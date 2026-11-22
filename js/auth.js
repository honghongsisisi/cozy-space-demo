// 회원가입 · 로그인 · 내 섬을 서버에 저장하기 (v0.41)
// 원리: Supabase가 '이메일 + 비밀번호' 계정을 관리해 줘요. 로그인하면 브라우저가 '출입증'(세션)을 기억해 두어서,
// 다음에 켤 때는 다시 로그인하지 않아도 돼요.
// 섬은 서버의 islands 표에 한 사람당 한 줄로 저장돼요. 표의 규칙(RLS) 때문에 내 줄만 읽고 쓸 수 있어요.
// 주소 끝에 ?localtest=1 을 붙이면 서버 없이 이 브라우저 안에서만 가짜 계정으로 시험해요 (개발용).
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=0.49';

const LOCAL_TEST = new URLSearchParams(location.search).has('localtest');
let client = null;
// 친구와 함께 놀기(net.js)도 같은 연결을 씀
export function getClient() {
  if (!client && window.supabase && SUPABASE_URL && SUPABASE_KEY) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
export function authReady() { return LOCAL_TEST || !!getClient(); }

// 서버가 영어로 알려 주는 문제를 쉬운 한국어로
function korean(err) {
  const m = String((err && (err.message || err.error_description || err.code)) || err || '').toLowerCase();
  if (m.includes('invalid login')) return '이메일이나 비밀번호가 맞지 않아요';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user_already_exists')) return '이미 가입한 이메일이에요. 로그인해 주세요';
  if (m.includes('not confirmed')) return '메일함에서 가입 확인 링크를 먼저 눌러 주세요';
  if (m.includes('password') && (m.includes('6') || m.includes('short') || m.includes('weak'))) return '비밀번호는 6자 이상으로 적어 주세요';
  if (m.includes('email') && (m.includes('invalid') || m.includes('valid'))) return '이메일 주소를 다시 확인해 주세요';
  if (m.includes('rate') || m.includes('too many') || m.includes('security purposes')) return '잠깐 사이에 너무 많이 시도했어요. 1분쯤 뒤에 다시 해 주세요';
  if (m.includes('signups not allowed') || m.includes('signup_disabled')) return '지금은 새로 가입할 수 없어요';
  if (m.includes('fetch') || m.includes('network')) return '인터넷 연결을 확인해 주세요';
  return '잠깐 문제가 생겼어요. 조금 뒤에 다시 해 주세요';
}

const toUser = (u) => (u ? { id: u.id, email: u.email || '', nickname: String((u.user_metadata && u.user_metadata.nickname) || '').slice(0, 10) } : null);

// ---------- 시험용 가짜 서버 (?localtest=1) ----------
const fake = {
  read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  write(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  users() { return this.read('cozy-fake:users') || {}; },
  islands() { return this.read('cozy-fake:islands') || {}; },
};

// 지금 로그인되어 있는 사람 (없으면 null)
export async function currentUser() {
  if (LOCAL_TEST) { const id = fake.read('cozy-fake:session'); const u = id && Object.values(fake.users()).find((x) => x.id === id); return u ? toUser(u) : null; }
  const c = getClient(); if (!c) return null;
  try { const { data } = await c.auth.getSession(); return toUser(data && data.session && data.session.user); } catch (e) { return null; }
}

// 가입하기 → { user } 또는 { confirm: true }(메일 확인이 필요함) 또는 { error }
export async function signUp(email, password, nickname) {
  email = String(email || '').trim().toLowerCase();
  if (LOCAL_TEST) {
    const us = fake.users();
    if (us[email]) return { error: '이미 가입한 이메일이에요. 로그인해 주세요' };
    if (String(password).length < 6) return { error: '비밀번호는 6자 이상으로 적어 주세요' };
    us[email] = { id: crypto.randomUUID(), email, password, user_metadata: { nickname } };
    fake.write('cozy-fake:users', us); fake.write('cozy-fake:session', us[email].id);
    return { user: toUser(us[email]) };
  }
  const c = getClient(); if (!c) return { error: '서버에 연결할 수 없어요' };
  try {
    const { data, error } = await c.auth.signUp({ email, password, options: { data: { nickname }, emailRedirectTo: location.origin + location.pathname } });
    if (error) return { error: korean(error) };
    // 이미 가입한 이메일이면 서버가 빈 사람을 돌려줘요 (남의 이메일을 알아내지 못하게 하려는 규칙)
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { error: '이미 가입한 이메일이에요. 로그인해 주세요' };
    if (!data.session) return { confirm: true };
    return { user: toUser(data.user) };
  } catch (e) { return { error: korean(e) }; }
}

// 로그인 → { user } 또는 { error }
export async function signIn(email, password) {
  email = String(email || '').trim().toLowerCase();
  if (LOCAL_TEST) {
    const u = fake.users()[email];
    if (!u || u.password !== password) return { error: '이메일이나 비밀번호가 맞지 않아요' };
    fake.write('cozy-fake:session', u.id);
    return { user: toUser(u) };
  }
  const c = getClient(); if (!c) return { error: '서버에 연결할 수 없어요' };
  try {
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) return { error: korean(error) };
    return { user: toUser(data.user) };
  } catch (e) { return { error: korean(e) }; }
}

export async function signOut() {
  if (LOCAL_TEST) { localStorage.removeItem('cozy-fake:session'); return; }
  const c = getClient(); if (c) { try { await c.auth.signOut(); } catch (e) { /* 무시 */ } }
}

// 별명 바꾸기 (계정 정보에도 적어 둠. 다른 기기에서도 같은 별명)
export async function setNickname(nickname) {
  if (LOCAL_TEST) {
    const us = fake.users(), id = fake.read('cozy-fake:session');
    const u = Object.values(us).find((x) => x.id === id); if (u) { u.user_metadata = { nickname }; fake.write('cozy-fake:users', us); }
    return;
  }
  const c = getClient(); if (c) { try { await c.auth.updateUser({ data: { nickname } }); } catch (e) { /* 무시 */ } }
}

// ---------- 내 섬 저장 / 불러오기 (서버) ----------
// 서버 표가 아직 없으면 { missing: true } 를 던져요. 그때는 이 컴퓨터에만 저장하고 계속 놀 수 있어요.
const isMissing = (error) => error && (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|could not find the table/i.test(error.message || ''));

export async function loadIsland(uid) {
  if (LOCAL_TEST) return fake.islands()[uid] || null;
  const c = getClient(); if (!c) throw { offline: true };
  const { data, error } = await c.from('islands').select('data, nickname, updated_at').eq('user_id', uid).maybeSingle();
  if (error) throw isMissing(error) ? { missing: true } : error;
  return data || null;
}

export async function saveIsland(uid, nickname, state) {
  if (LOCAL_TEST) {
    const all = fake.islands(); all[uid] = { data: state, nickname, updated_at: new Date().toISOString() };
    fake.write('cozy-fake:islands', all); return true;
  }
  const c = getClient(); if (!c) throw { offline: true };
  const { error } = await c.from('islands').upsert({ user_id: uid, nickname, data: state, updated_at: new Date().toISOString() });
  if (error) throw isMissing(error) ? { missing: true } : error;
  return true;
}

// ---------- 친구 섬 구경 · 방명록 (v0.42) ----------
// 서버의 섬 표는 '내 줄만' 규칙이라, 친구 섬은 '섬 번호를 아는 사람에게 그 섬 하나만 보여 주는 창구'(visit_island)로 꺼내요.
// 방명록도 창구 3개(읽기·쓰기·지우기)로만 다뤄요. 표 만들기: docs/supabase-friends.sql
const isMissingFn = (error) => error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || ''));
const roomOf = (uid) => String(uid || '').replace(/[^a-z0-9]/gi, '').slice(0, 16).toLowerCase();
async function rpc(name, args) {
  const c = getClient(); if (!c) throw { offline: true };
  const { data, error } = await c.rpc(name, args);
  if (error) throw isMissingFn(error) || isMissing(error) ? { missing: true } : error;
  return data;
}

// 친구 섬 하나 꺼내기 → { nickname, data, updated_at } 또는 null(그런 섬 없음)
export async function visitIsland(room) {
  if (LOCAL_TEST) {
    const hit = Object.entries(fake.islands()).find(([uid]) => roomOf(uid) === room);
    return hit ? hit[1] : null;
  }
  const rows = await rpc('visit_island', { p_room: room });
  return (rows && rows[0]) || null;
}

const gbErr = (e) => {
  const m = String((e && e.message) || '');
  if (m.includes('too_many')) return '한 섬에는 하루에 5개까지 남길 수 있어요';
  if (m.includes('login_required')) return '가입한 사람만 방명록을 쓸 수 있어요';
  if (m.includes('no_island')) return '아직 저장된 적 없는 섬이라 방명록을 남길 수 없어요';
  if (m.includes('bad_length')) return '100자까지 적을 수 있어요';
  // 모르는 문제는 서버가 준 짧은 표시(코드)를 뒤에 붙여 둬요. 화면을 찍어 보내 주면 원인을 찾기 쉬워요
  const code = e && (e.code || e.status) ? ` (${String(e.code || e.status).slice(0, 12)})` : '';
  return korean(e) + code;
};

// 방명록 읽기 → [{ id, author_name, body, created_at, mine }]
export async function guestbookList(room) {
  if (LOCAL_TEST) {
    const me = fake.read('cozy-fake:session');
    return (fake.read('cozy-fake:gb') || []).filter((g) => g.room === room).sort((a, b) => b.id - a.id).slice(0, 50).map((g) => ({ ...g, mine: g.author === me }));
  }
  return (await rpc('guestbook_list', { p_room: room })) || [];
}

// 방명록 쓰기 → { ok } 또는 { error }
export async function guestbookWrite(room, body, name) {
  if (LOCAL_TEST) {
    const me = fake.read('cozy-fake:session'); if (!me) return { error: '가입한 사람만 방명록을 쓸 수 있어요' };
    const all = fake.read('cozy-fake:gb') || [];
    const day = Date.now() - 86400000;
    if (all.filter((g) => g.room === room && g.author === me && Date.parse(g.created_at) > day).length >= 5) return { error: gbErr({ message: 'too_many' }) };
    all.push({ id: Date.now(), room, author: me, author_name: name, body, created_at: new Date().toISOString() });
    fake.write('cozy-fake:gb', all); return { ok: true };
  }
  try { await rpc('guestbook_write', { p_room: room, p_body: body, p_name: name }); return { ok: true }; }
  catch (e) { return { error: e && e.missing ? '방명록이 아직 준비 중이에요' : gbErr(e) }; }
}

// 방명록 지우기 (쓴 사람 본인, 또는 섬 주인)
export async function guestbookDelete(id) {
  if (LOCAL_TEST) {
    const me = fake.read('cozy-fake:session');
    const mineRoom = roomOf(me);
    fake.write('cozy-fake:gb', (fake.read('cozy-fake:gb') || []).filter((g) => !(g.id === id && (g.author === me || g.room === mineRoom))));
    return true;
  }
  try { return !!(await rpc('guestbook_delete', { p_id: id })); } catch (e) { return false; }
}

// ---------- 친구 맺기 (v0.42) ----------
// 친구 신청 → 상대가 수락하면 서로 친구. 서로를 '섬 번호'(room)로 가리켜요.
// 만난 사람에게는 섬 번호로, 밖에서 아는 사람에게는 6글자 친구 코드로 신청해요.
const fakeFriends = {
  all() { return fake.read('cozy-fake:friends') || []; },
  save(a) { fake.write('cozy-fake:friends', a); },
  code(uid) { return roomOf(uid).slice(0, 6).toUpperCase(); },
  find(room, code) {
    const ids = Object.keys(fake.islands());
    return ids.find((uid) => (room ? roomOf(uid) === room : fakeFriends.code(uid) === String(code || '').trim().toUpperCase()));
  },
};
const friendErr = (e) => {
  const m = String((e && e.message) || e || '');
  if (m.includes('not_found')) return '그 친구를 찾지 못했어요. 코드를 다시 확인해 주세요';
  if (m.includes('self')) return '나 자신과는 친구를 맺을 수 없어요';
  if (m.includes('too_many_sent')) return '보낸 신청이 너무 많아요. 답을 조금 기다려 주세요';
  if (m.includes('too_many')) return '친구는 200명까지 맺을 수 있어요';
  if (m.includes('login_required')) return '가입한 사람만 친구를 맺을 수 있어요';
  return e && e.missing ? '친구 맺기가 아직 준비 중이에요' : korean(e);
};

// 내 친구 코드 → '89M6MS' 같은 6글자 (아직 섬이 서버에 없으면 '')
export async function friendCode() {
  if (LOCAL_TEST) { const me = fake.read('cozy-fake:session'); return me ? fakeFriends.code(me) : ''; }
  const rows = await rpc('friend_me', {});
  return (rows && rows[0] && rows[0].friend_code) || '';
}

// 친구 목록 → [{ room, nickname, title, status: 'friend'|'received'|'sent' }]
export async function friendList() {
  if (LOCAL_TEST) {
    const me = fake.read('cozy-fake:session'), isl = fake.islands();
    return fakeFriends.all().filter((f) => f.user_id === me).map((f) => {
      const row = isl[f.friend_id] || {};
      return { room: roomOf(f.friend_id), nickname: row.nickname || '', title: (row.data && row.data.title) || '', status: f.status };
    });
  }
  return (await rpc('friend_list', {})) || [];
}

// 친구 신청 (room 또는 code 중 하나) → { status: 'sent'|'friend'|'already' } 또는 { error }
export async function friendRequest({ room = null, code = null }) {
  if (LOCAL_TEST) {
    const me = fake.read('cozy-fake:session'); if (!me) return { error: friendErr('login_required') };
    const them = fakeFriends.find(room, code);
    if (!them) return { error: friendErr('not_found') };
    if (them === me) return { error: friendErr('self') };
    const all = fakeFriends.all();
    const cur = all.find((f) => f.user_id === me && f.friend_id === them);
    if (cur && cur.status !== 'received') return { status: 'already' };
    if (cur) { all.forEach((f) => { if ((f.user_id === me && f.friend_id === them) || (f.user_id === them && f.friend_id === me)) f.status = 'friend'; }); fakeFriends.save(all); return { status: 'friend' }; }
    all.push({ user_id: me, friend_id: them, status: 'sent' }, { user_id: them, friend_id: me, status: 'received' });
    fakeFriends.save(all); return { status: 'sent' };
  }
  try { return { status: await rpc('friend_request', { p_room: room, p_code: code }) }; }
  catch (e) { return { error: friendErr(e) }; }
}

// 받은 신청에 답하기 (accept: true 수락 / false 괜찮아요)
export async function friendAnswer(room, accept) {
  if (LOCAL_TEST) {
    const me = fake.read('cozy-fake:session'), them = fakeFriends.find(room);
    let all = fakeFriends.all();
    const pair = (f) => (f.user_id === me && f.friend_id === them) || (f.user_id === them && f.friend_id === me);
    if (accept) all.forEach((f) => { if (pair(f)) f.status = 'friend'; }); else all = all.filter((f) => !pair(f));
    fakeFriends.save(all); return true;
  }
  try { return !!(await rpc('friend_answer', { p_room: room, p_accept: accept })); } catch (e) { return false; }
}

// 친구 끊기 · 보낸 신청 거두기 (상대에게 따로 알리지 않아요)
export async function friendRemove(room) {
  if (LOCAL_TEST) {
    const me = fake.read('cozy-fake:session'), them = fakeFriends.find(room);
    fakeFriends.save(fakeFriends.all().filter((f) => !((f.user_id === me && f.friend_id === them) || (f.user_id === them && f.friend_id === me))));
    return true;
  }
  try { return !!(await rpc('friend_remove', { p_room: room })); } catch (e) { return false; }
}
