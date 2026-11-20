// 회원가입 · 로그인 · 내 섬을 서버에 저장하기 (v0.41)
// 원리: Supabase가 '이메일 + 비밀번호' 계정을 관리해 줘요. 로그인하면 브라우저가 '출입증'(세션)을 기억해 두어서,
// 다음에 켤 때는 다시 로그인하지 않아도 돼요.
// 섬은 서버의 islands 표에 한 사람당 한 줄로 저장돼요. 표의 규칙(RLS) 때문에 내 줄만 읽고 쓸 수 있어요.
// 주소 끝에 ?localtest=1 을 붙이면 서버 없이 이 브라우저 안에서만 가짜 계정으로 시험해요 (개발용).
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=0.41';

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
