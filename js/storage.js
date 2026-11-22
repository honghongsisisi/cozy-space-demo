// 브라우저에 저장하기 / 불러오기
// v0.41부터: 로그인한 사람마다 따로 칸을 써요(같은 컴퓨터에서 여러 사람이 로그인해도 섞이지 않게).
// 브라우저 저장은 '빠른 임시 보관'이고, 진짜 보관은 서버(auth.js의 saveIsland)예요.
// 예전(로그인 없던 때) 저장은 LEGACY 칸에 그대로 있고, 처음 로그인한 계정으로 한 번만 옮겨 줘요.
import { OUTER_NATURE, HOUSE_SPOT, DEFAULT_ROOM_ITEMS, fitHouse, clampToRoom, newId } from './world.js?v=0.50';

const LEGACY = 'cozy-space-demo:v1';
const LEGACY_OWNER = 'cozy-space-demo:legacy-owner';
export const userKey = (uid) => `${LEGACY}:u:${uid}`;

// 저장할 모양 만들기 (저장 시각을 함께 적어서, 서버와 이 컴퓨터 중 어느 쪽이 새것인지 비교해요)
export function packState(state) { return { version: 5, savedAt: Date.now(), ...state }; }

export function saveState(packed, key) {
  try {
    localStorage.setItem(key, JSON.stringify(packed));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadState(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

// 예전 저장(로그인 없던 때)을 아직 아무 계정도 가져가지 않았으면 돌려줌
export function takeLegacy(uid) {
  try {
    const owner = localStorage.getItem(LEGACY_OWNER);
    if (owner && owner !== uid) return null;
    const s = loadState(LEGACY);
    if (s) localStorage.setItem(LEGACY_OWNER, uid);
    return s;
  } catch (e) { return null; }
}

// 예전 판의 저장을 지금 판으로 고쳐 주기 (서버에서 받은 것도 똑같이)
export function migrate(s) {
  try {
    if (!s || typeof s !== 'object') return null;
    // 1판은 회전을 45도 단위 숫자로 저장했음 → 각도로 바꿔 줌
    if (s.version === 1) { (s.items || []).forEach((it) => { it.rot = (it.rot || 0) * 45; }); s.version = 2; }
    // 2판 → 3판: 섬이 2배로 넓어짐. 놓아 둔 물건은 그대로 두고, 넓어진 바깥쪽에 자연물만 더해 줌
    if (s.version === 2) {
      const mine = s.items || [];
      OUTER_NATURE.forEach((n) => { if (!mine.some((m) => Math.hypot(m.x - n.x, m.z - n.z) < 1.2)) mine.push({ ...n, id: newId() }); });
      s.items = mine; s.version = 3;
    }
    // 3판 → 4판: 섬에 '우리 집'이 생김
    if (s.version === 3) {
      const mine = s.items || [];
      if (!mine.some((m) => m.type === 'cottage')) mine.unshift({ ...HOUSE_SPOT, id: newId() });
      s.items = mine; s.version = 4;
    }
    // 4판 → 5판: 집이 집 안 방과 같은 크기로 커짐(v0.30). 집 자리와 겹치는 물건은 비켜 주고(처음부터 있던 자연물은 치움), 집 안 물건은 방 안으로
    if (s.version === 4) {
      s.items = fitHouse(s.items || []);
      if (s.house && Array.isArray(s.house.items)) s.house.items.forEach((i) => Object.assign(i, clampToRoom(i.x, i.z, 0.3)));
      s.version = 5;
    }
    if (s.version === 5 && !(s.house && Array.isArray(s.house.items))) s.house = { items: DEFAULT_ROOM_ITEMS.map((i) => ({ ...i, id: newId() })) };
    return s.version === 5 ? s : null;
  } catch (e) {
    return null;
  }
}

