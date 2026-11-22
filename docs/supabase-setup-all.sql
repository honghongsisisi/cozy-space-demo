-- 한 번에 실행하는 서버 준비 글 (섬 저장 + 친구 맺기 + 친구 섬 구경 + 방명록)
-- Supabase 화면 → SQL Editor → 아래 전체를 붙여 넣고 Run 을 한 번 누르면 됩니다. 여러 번 눌러도 괜찮아요.
-- (docs/supabase-islands.sql 과 docs/supabase-friends.sql 을 순서대로 합친 것)

-- 내 섬 저장 표 (v0.41)
-- Supabase 화면 → SQL Editor → 아래 전체를 붙여 넣고 Run 을 한 번 누르면 됩니다.
-- 한 사람당 한 줄. RLS 규칙 때문에 로그인한 본인만 자기 줄을 읽고 쓸 수 있어요.
create table if not exists public.islands (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null default '',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.islands enable row level security;

drop policy if exists "내 섬 보기" on public.islands;
drop policy if exists "내 섬 만들기" on public.islands;
drop policy if exists "내 섬 고치기" on public.islands;
create policy "내 섬 보기" on public.islands for select to authenticated using ((select auth.uid()) = user_id);
create policy "내 섬 만들기" on public.islands for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "내 섬 고치기" on public.islands for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on public.islands to authenticated;

-- 친구 맺기 + 친구 섬 구경 + 방명록 (v0.42)
-- Supabase 화면 → SQL Editor → 아래 전체를 붙여 넣고 Run 을 한 번 누르면 됩니다. (여러 번 눌러도 괜찮아요)
-- 먼저 docs/supabase-islands.sql 이 한 번 실행되어 있어야 해요.
--
-- 원리: 섬 표(islands)는 여전히 '내 줄만 읽고 쓰기' 규칙 그대로예요.
-- 대신 '섬 번호를 아는 사람에게 그 섬 하나만 보여 주는 창구'(함수)를 만들어요.
-- 그래서 초대 링크(섬 번호)를 받은 사람만 그 섬을 볼 수 있고, 섬 목록을 통째로 뒤질 수는 없어요.
-- 방명록도 같은 방식: 표는 잠가 두고, 읽기·쓰기·지우기 창구 3개로만 다뤄요.

-- 1) 섬 번호(초대 링크에 들어가는 16글자)를 섬 표에 함께 적어 둠
alter table public.islands
  add column if not exists room text generated always as (substr(replace(user_id::text, '-', ''), 1, 16)) stored;
create unique index if not exists islands_room_idx on public.islands (room);

-- 2) 친구 섬 하나 꺼내 보기 (로그인 안 한 유령 손님도 볼 수 있어요)
create or replace function public.visit_island(p_room text)
returns table (nickname text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select i.nickname, i.data, i.updated_at from public.islands i where i.room = lower(p_room) limit 1;
$$;

-- 3) 방명록 표 (잠가 두고 아래 창구로만 다룸)
create table if not exists public.guestbook (
  id bigint generated always as identity primary key,
  room text not null,
  author uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '',
  body text not null check (char_length(body) between 1 and 100),
  created_at timestamptz not null default now()
);
create index if not exists guestbook_room_idx on public.guestbook (room, created_at desc);
alter table public.guestbook enable row level security;
revoke all on public.guestbook from anon, authenticated;

-- 방명록 읽기: 최근 50개 (mine = 내가 쓴 글이라 지울 수 있는지)
create or replace function public.guestbook_list(p_room text)
returns table (id bigint, author_name text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public
as $$
  select g.id, g.author_name, g.body, g.created_at, coalesce(g.author = auth.uid(), false)
  from public.guestbook g where g.room = lower(p_room)
  order by g.created_at desc limit 50;
$$;

-- 방명록 쓰기: 가입한 사람만, 100자까지, 한 섬에 하루 5개까지 (장난 글 도배 막기)
create or replace function public.guestbook_write(p_room text, p_body text, p_name text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare new_id bigint; b text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if char_length(b) < 1 or char_length(b) > 100 then raise exception 'bad_length'; end if;
  if not exists (select 1 from public.islands where room = lower(p_room)) then raise exception 'no_island'; end if;
  if (select count(*) from public.guestbook where room = lower(p_room) and author = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many';
  end if;
  insert into public.guestbook (room, author, author_name, body)
  values (lower(p_room), auth.uid(), left(btrim(coalesce(p_name, '')), 10), b)
  returning id into new_id;
  return new_id;
end;
$$;

-- 방명록 지우기: 쓴 사람 본인, 또는 섬 주인
create or replace function public.guestbook_delete(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.guestbook g
  where g.id = p_id
    and (g.author = auth.uid() or exists (select 1 from public.islands i where i.room = g.room and i.user_id = auth.uid()));
  return found;
end;
$$;

-- 4) 친구 맺기
-- 친구 코드: 사람마다 6글자 (헷갈리는 0·O·1·I·L은 빼고). 밖에서 아는 친구에게 알려 주면 코드로 신청할 수 있어요.
create or replace function public.new_friend_code() returns text
language sql volatile set search_path = public
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6);
$$;
alter table public.islands add column if not exists friend_code text not null default public.new_friend_code();
create unique index if not exists islands_friend_code_idx on public.islands (friend_code);

-- 친구 표: 한 쌍마다 두 줄 (나→너, 너→나). status: sent(내가 보냄) / received(받음) / friend(친구)
create table if not exists public.friends (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('sent', 'received', 'friend')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.friends enable row level security;
revoke all on public.friends from anon, authenticated;

-- 내 친구 코드
create or replace function public.friend_me()
returns table (friend_code text, room text)
language sql stable security definer set search_path = public
as $$ select i.friend_code, i.room from public.islands i where i.user_id = auth.uid(); $$;

-- 친구 목록 (친구 + 받은 신청 + 보낸 신청). 섬 번호(room)로 서로를 가리켜요
create or replace function public.friend_list()
returns table (room text, nickname text, title text, status text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select i.room, i.nickname, coalesce(i.data->>'title', ''), f.status, f.created_at
  from public.friends f join public.islands i on i.user_id = f.friend_id
  where f.user_id = auth.uid()
  order by f.created_at desc limit 300;
$$;

-- 친구 신청: 섬 번호(만난 사람) 또는 친구 코드로. 상대도 나에게 신청해 두었으면 바로 친구가 돼요
-- 돌려주는 값: sent / friend / already
create or replace function public.friend_request(p_room text, p_code text)
returns text
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); them uuid; cur text;
begin
  if me is null then raise exception 'login_required'; end if;
  if p_room is not null and p_room <> '' then select user_id into them from public.islands where room = lower(p_room);
  else select user_id into them from public.islands where friend_code = upper(btrim(coalesce(p_code, ''))); end if;
  if them is null then raise exception 'not_found'; end if;
  if them = me then raise exception 'self'; end if;
  select status into cur from public.friends where user_id = me and friend_id = them;
  if cur = 'friend' or cur = 'sent' then return 'already'; end if;
  if cur = 'received' then
    update public.friends set status = 'friend' where (user_id = me and friend_id = them) or (user_id = them and friend_id = me);
    return 'friend';
  end if;
  if (select count(*) from public.friends where user_id = me and status = 'friend') >= 200 then raise exception 'too_many'; end if;
  if (select count(*) from public.friends where user_id = me and status = 'sent') >= 30 then raise exception 'too_many_sent'; end if;
  insert into public.friends (user_id, friend_id, status) values (me, them, 'sent');
  insert into public.friends (user_id, friend_id, status) values (them, me, 'received');
  return 'sent';
end;
$$;

-- 받은 신청에 답하기 (수락 true / 괜찮아요 false)
create or replace function public.friend_answer(p_room text, p_accept boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); them uuid;
begin
  select user_id into them from public.islands where room = lower(p_room);
  if me is null or them is null or not exists (select 1 from public.friends where user_id = me and friend_id = them and status = 'received') then return false; end if;
  if p_accept then update public.friends set status = 'friend' where (user_id = me and friend_id = them) or (user_id = them and friend_id = me);
  else delete from public.friends where (user_id = me and friend_id = them) or (user_id = them and friend_id = me); end if;
  return true;
end;
$$;

-- 친구 끊기 / 보낸 신청 거두기 (상대에게 따로 알리지 않아요)
create or replace function public.friend_remove(p_room text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); them uuid;
begin
  select user_id into them from public.islands where room = lower(p_room);
  if me is null or them is null then return false; end if;
  delete from public.friends where (user_id = me and friend_id = them) or (user_id = them and friend_id = me);
  return found;
end;
$$;

grant execute on function public.new_friend_code() to authenticated; -- 새 섬을 저장할 때 코드가 저절로 생기게
revoke all on function public.friend_me() from public;
revoke all on function public.friend_list() from public;
revoke all on function public.friend_request(text, text) from public;
revoke all on function public.friend_answer(text, boolean) from public;
revoke all on function public.friend_remove(text) from public;
grant execute on function public.friend_me() to authenticated;
grant execute on function public.friend_list() to authenticated;
grant execute on function public.friend_request(text, text) to authenticated;
grant execute on function public.friend_answer(text, boolean) to authenticated;
grant execute on function public.friend_remove(text) to authenticated;

revoke all on function public.visit_island(text) from public;
revoke all on function public.guestbook_list(text) from public;
revoke all on function public.guestbook_write(text, text, text) from public;
revoke all on function public.guestbook_delete(bigint) from public;
grant execute on function public.visit_island(text) to anon, authenticated;
grant execute on function public.guestbook_list(text) to anon, authenticated;
grant execute on function public.guestbook_write(text, text, text) to authenticated;
grant execute on function public.guestbook_delete(bigint) to authenticated;
