// 아이템 목록. 새 물건을 넣으려면 ITEMS에 한 줄 추가하고 build 함수를 만들면 됩니다.
import * as THREE from 'three';
import { PALETTE as P } from './palette.js?v=0.27';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  }
  return matCache.get(key);
}

// 밤에 빛나는 전구 재질 (환경에서 밝기를 바꿉니다)
export const glowMat = new THREE.MeshBasicMaterial({ color: P.bulb });
export const fireMat = new THREE.MeshBasicMaterial({ color: P.fire });

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 같은 모양이 매번 같게 나오도록 하는 간단한 난수
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

const builders = {
  treeRound() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 6), mat(P.wood), 0, 0.55, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.85, 0), mat(P.leaf[0]), 0, 1.6, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(P.leaf[1]), 0.45, 1.3, 0.2));
    g.add(mesh(new THREE.IcosahedronGeometry(0.5, 0), mat(P.leaf[2]), -0.35, 2.0, -0.15));
    return g;
  },
  treePine() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 6), mat(P.woodDark), 0, 0.35, 0));
    [[0.85, 1.0, 0.9], [0.65, 0.9, 1.5], [0.42, 0.8, 2.05]].forEach(([r, h, y]) => {
      g.add(mesh(new THREE.ConeGeometry(r, h, 7), mat(P.pine), 0, y, 0));
    });
    return g;
  },
  flowers() {
    const g = new THREE.Group();
    const rnd = seeded(7);
    const stem = mat(P.leaf[1]);
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2, r = 0.1 + rnd() * 0.35;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.2 + rnd() * 0.15;
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, h, 4), stem, x, h / 2, z));
      g.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), mat(P.flower[i % P.flower.length]), x, h + 0.04, z));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 8), mat(P.leaf[2]), 0, 0.015, 0));
    return g;
  },
  bush() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.IcosahedronGeometry(0.45, 0), mat(P.leaf[1]), 0, 0.35, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.35, 0), mat(P.leaf[0]), 0.38, 0.28, 0.1));
    g.add(mesh(new THREE.IcosahedronGeometry(0.32, 0), mat(P.leaf[2]), -0.35, 0.26, -0.05));
    return g;
  },
  rock() {
    const g = new THREE.Group();
    const a = mesh(new THREE.DodecahedronGeometry(0.42, 0), mat(P.stone), 0, 0.25, 0);
    a.scale.set(1, 0.7, 0.9);
    const b = mesh(new THREE.DodecahedronGeometry(0.22, 0), mat(P.stoneDark), 0.4, 0.13, 0.2);
    g.add(a, b);
    return g;
  },
  bench() {
    const g = new THREE.Group();
    const w = mat(P.wood), d = mat(P.woodDark);
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.08, 0.45), w, 0, 0.42, 0));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.35, 0.07), w, 0, 0.72, -0.2));
    [[-0.6, 0.17], [0.6, 0.17], [-0.6, -0.17], [0.6, -0.17]].forEach(([x, z]) => {
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), d, x, 0.21, z));
    });
    return g;
  },
  // 종이 등불을 단 나무 기둥
  lamp() {
    const g = new THREE.Group();
    const w = mat(P.woodDark);
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), w, 0, 0.05, 0));
    g.add(mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), w, 0, 0.85, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), w, 0.2, 1.62, 0));
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), glowMat);
    lantern.scale.y = 1.15;
    lantern.position.set(0.38, 1.3, 0);
    g.add(lantern);
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8), w, 0.38, 1.56, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8), w, 0.38, 1.04, 0));
    g.userData.light = new THREE.Vector3(0.38, 1.3, 0);
    return g;
  },
  // 공중에 둥실 떠 있는 작은 등불
  floatLantern() {
    const g = new THREE.Group();
    const f = new THREE.Group();
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), glowMat);
    lantern.scale.y = 1.2;
    f.add(lantern);
    // 위·아래 뚜껑: 공중에 떠 있어서 그림자가 바닥에 '검은 점'처럼만 남으므로 그림자를 만들지 않음
    [0.25, -0.25].forEach((y) => {
      const cap = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), mat(P.woodDark), 0, y, 0);
      cap.castShadow = false;
      f.add(cap);
    });
    f.position.y = 1.3;
    g.add(f);
    g.userData.float = f;
    g.userData.light = new THREE.Vector3(0, 1.3, 0);
    return g;
  },
  fence() {
    const g = new THREE.Group();
    const w = mat(P.wood);
    [-0.7, 0, 0.7].forEach((x) => g.add(mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), w, x, 0.35, 0)));
    [0.25, 0.52].forEach((y) => g.add(mesh(new THREE.BoxGeometry(1.5, 0.08, 0.06), w, 0, y, 0)));
    return g;
  },
  table() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.07, 10), mat(P.table), 0, 0.7, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), mat(P.woodDark), 0, 0.35, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.05, 8), mat(P.woodDark), 0, 0.025, 0));
    return g;
  },
  mailbox() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), mat(P.woodDark), 0, 0.45, 0));
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.3, 0.5), mat(P.mailbox), 0, 1.0, 0));
    const top = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 8, 1, false, Math.PI / 2, Math.PI), mat(P.mailbox), 0, 1.15, 0);
    top.rotation.x = Math.PI / 2;
    g.add(top);
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.25, 0.05), mat(P.flag), 0.19, 1.2, 0.1));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.1, 0.14), mat(P.flag), 0.19, 1.28, 0.18));
    return g;
  },
  parasol() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 6), mat(P.table), 0, 1.0, 0));
    g.add(mesh(new THREE.ConeGeometry(1.2, 0.45, 8), mat(P.parasol), 0, 2.05, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.08, 8), mat(P.metal), 0, 0.04, 0));
    return g;
  },
  campfire() {
    const g = new THREE.Group();
    const rnd = seeded(3);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(mesh(new THREE.DodecahedronGeometry(0.11 + rnd() * 0.04, 0), mat(P.stoneDark), Math.cos(a) * 0.42, 0.08, Math.sin(a) * 0.42));
    }
    [0, Math.PI / 2].forEach((r) => {
      const log = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 5), mat(P.woodDark), 0, 0.1, 0);
      log.rotation.order = 'YXZ';
      log.rotation.set(Math.PI / 2 - 0.25, r, 0);
      g.add(log);
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 6), fireMat);
    flame.position.y = 0.32;
    flame.userData.flicker = true;
    g.add(flame);
    g.userData.light = new THREE.Vector3(0, 0.6, 0);
    return g;
  },
  // ---- 광장 전용 (가구 창에는 나오지 않음) ----
  fountain() {
    const g = new THREE.Group();
    // 낮은 팔각 돌 수반 + 안쪽 물 + 가운데 기둥 + 위쪽 작은 그릇. 물은 반짝이지 않는 차분한 하늘색
    g.add(mesh(new THREE.CylinderGeometry(2.0, 2.1, 0.5, 8), mat(P.stone), 0, 0.25, 0));
    g.add(mesh(new THREE.CylinderGeometry(2.08, 2.08, 0.08, 8), mat(P.stoneDark), 0, 0.52, 0));
    const water = mesh(new THREE.CylinderGeometry(1.78, 1.78, 0.04, 24), mat(P.fountainWater, { flatShading: false }), 0, 0.46, 0);
    water.castShadow = false;
    g.add(water);
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.25, 8), mat(P.stone), 0, 0.95, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.85, 0.35, 0.28, 8), mat(P.stone), 0, 1.62, 0));
    const water2 = mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.03, 20), mat(P.fountainWater, { flatShading: false }), 0, 1.74, 0);
    water2.castShadow = false;
    g.add(water2);
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.45, 6), mat(P.stoneDark), 0, 1.95, 0));
    g.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), mat(P.stone), 0, 2.22, 0));
    // 물이 퐁퐁 솟는 작은 물방울 (천천히 오르내림)
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(P.fountainWater, { flatShading: false }));
    drop.position.y = 2.42;
    drop.userData.bob = true;
    g.add(drop);
    return g;
  },
  bigTree() {
    // 광장의 큰 나무: 동글나무를 두 배쯤 크게, 잎은 세 덩이
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.4, 7), mat(P.wood), 0, 1.2, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(1.9, 0), mat(P.leaf[0]), 0, 3.5, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(1.25, 0), mat(P.leaf[1]), 1.1, 2.9, 0.5));
    g.add(mesh(new THREE.IcosahedronGeometry(1.1, 0), mat(P.leaf[2]), -0.9, 4.3, -0.4));
    return g;
  },
  plazaFloor() {
    // 광장 바닥: 따뜻한 돌 바닥 원 + 바깥 테두리 (그림자만 받고 부딪히지 않음)
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 0.04, 48), mat(P.paving, { flatShading: false }));
    floor.position.y = 0.02; floor.receiveShadow = true; g.add(floor);
    const rim = new THREE.Mesh(new THREE.RingGeometry(7.6, 8.0, 48), mat(P.stoneDark, { flatShading: false, side: THREE.DoubleSide }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.045; rim.receiveShadow = true; g.add(rim);
    // 바닥 무늬: 가운데에서 퍼지는 은은한 동심원 두 줄
    [3.2, 5.4].forEach((r) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.12, 48), mat(P.pavingLine, { flatShading: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.043; ring.receiveShadow = true; g.add(ring);
    });
    return g;
  },
  stepStone() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.06, 7), mat(P.stone), 0, 0.03, 0));
    return g;
  },
};

// radius: 아바타가 부딪히는 크기 (0이면 그냥 지나감)
export const ITEMS = [
  { type: 'treeRound', name: '동글나무', emoji: '🌳', radius: 0.45 , group: 'nature' },
  { type: 'treePine',  name: '뾰족나무', emoji: '🌲', radius: 0.4 , group: 'nature' },
  { type: 'flowers',   name: '꽃밭',     emoji: '🌷', radius: 0 , group: 'nature' },
  { type: 'bush',      name: '덤불',     emoji: '🌿', radius: 0.5 , group: 'nature' },
  { type: 'rock',      name: '바위',     emoji: '🪨', radius: 0.45 , group: 'nature' },
  { type: 'bench',     name: '벤치',     emoji: '🪑', radius: 0.6 , group: 'furniture' },
  { type: 'lamp',      name: '등불기둥', emoji: '🏮', radius: 0.25 , group: 'light' },
  { type: 'floatLantern', name: '뜬 등불', emoji: '🎐', radius: 0 , group: 'light' },
  { type: 'fence',     name: '울타리',   emoji: '🚧', radius: 0 , group: 'path' },
  { type: 'table',     name: '둥근탁자', emoji: '⚪', radius: 0.55 , group: 'furniture' },
  { type: 'mailbox',   name: '우체통',   emoji: '📮', radius: 0.3 , group: 'furniture' },
  { type: 'parasol',   name: '파라솔',   emoji: '⛱️', radius: 0.15 , group: 'furniture' },
  { type: 'campfire',  name: '모닥불',   emoji: '🔥', radius: 0.5 , group: 'light' },
  { type: 'stepStone', name: '디딤돌',   emoji: '⬜', radius: 0 , group: 'path' },
  // 광장 전용 (group이 ITEM_GROUPS에 없어서 가구 창에는 안 보임)
  { type: 'fountain',  name: '분수대',   emoji: '⛲', radius: 2.2 , group: 'plaza' },
  { type: 'bigTree',   name: '큰 나무',  emoji: '🌳', radius: 0.7 , group: 'plaza' },
  { type: 'plazaFloor', name: '광장 바닥', emoji: '⭕', radius: 0 , group: 'plaza' },
];

export const ITEM_GROUPS = [
  { id: 'nature', name: '자연' },
  { id: 'furniture', name: '가구' },
  { id: 'light', name: '불빛' },
  { id: 'path', name: '길·울타리' },
];

export const ITEM_BY_TYPE = Object.fromEntries(ITEMS.map((i) => [i.type, i]));

export function buildItem(type) {
  const g = builders[type]();
  g.userData.type = type;
  return g;
}
