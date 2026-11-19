// 브라우저에 저장하기 / 불러오기
// 나중에 친구 방문 기능을 만들 때는 이 파일만 서버 저장으로 바꾸면 됩니다.
import { OUTER_NATURE, newId } from './world.js?v=0.25';

const KEY = 'cozy-space-demo:v1';

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 3, savedAt: Date.now(), ...state }));
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
    if (!s) return null;
    // 1판은 회전을 45도 단위 숫자로 저장했음 → 각도로 바꿔 줌
    if (s.version === 1) { (s.items || []).forEach((it) => { it.rot = (it.rot || 0) * 45; }); s.version = 2; }
    // 2판 → 3판: 섬이 2배로 넓어짐. 놓아 둔 물건은 그대로 두고, 넓어진 바깥쪽에 자연물만 더해 줌
    if (s.version === 2) {
      const mine = s.items || [];
      OUTER_NATURE.forEach((n) => { if (!mine.some((m) => Math.hypot(m.x - n.x, m.z - n.z) < 1.2)) mine.push({ ...n, id: newId() }); });
      s.items = mine; s.version = 3;
    }
    return s.version === 3 ? s : null;
  } catch (e) {
    return null;
  }
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
}
