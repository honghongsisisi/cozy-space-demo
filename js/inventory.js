// 가진 물건 개수 (v0.40)
// 원리: 물건마다 '가진 개수'만 적어 두고, '쓴 개수'는 마당과 집 안에 놓인 물건을 그때그때 세어서 알아내요.
// 그래서 치우거나 되돌리면 저절로 다시 쓸 수 있게 돼요.
// 나중에 상점이 생기면 addOwned(type, n)으로 가진 개수만 늘려 주면 됩니다.
import { ITEMS, ITEM_GROUPS } from './catalog.js?v=0.49';

export const START_COUNT = 20; // 지금은 물건마다 20개씩 가지고 시작

const DECOR_TYPES = ITEMS.filter((it) => ITEM_GROUPS.some((g) => g.id === it.group)).map((it) => it.type);
let owned = {};

// 저장된 값 불러오기 (없으면 모두 20개)
export function restoreOwned(saved) {
  owned = {};
  DECOR_TYPES.forEach((t) => {
    const n = saved && Number.isFinite(saved[t]) ? saved[t] : START_COUNT;
    owned[t] = Math.max(0, Math.floor(n));
  });
}
export function serializeOwned() { return { ...owned }; }
export function ownedOf(type) { return owned[type] ?? 0; }
export function addOwned(type, n = 1) { owned[type] = ownedOf(type) + n; }

// 놓인 물건들(마당 + 집 안)을 종류별로 세기
export function countUsed(lists) {
  const used = {};
  lists.forEach((list) => list.forEach((it) => { used[it.type] = (used[it.type] || 0) + 1; }));
  return used;
}

restoreOwned(null);
