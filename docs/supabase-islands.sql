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
