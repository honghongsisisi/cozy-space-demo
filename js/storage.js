// 브라우저에 저장하기 / 불러오기
// 나중에 친구 방문 기능을 만들 때는 이 파일만 서버 저장으로 바꾸면 됩니다.
const KEY = 'cozy-space-demo:v1';

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: Date.now(), ...state }));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.version === 1 ? s : null;
  } catch (e) {
    return null;
  }
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
}
