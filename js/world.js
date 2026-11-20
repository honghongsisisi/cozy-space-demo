// 마당의 '데이터'와 화면 속 물건을 함께 관리합니다.
// 물건을 바꿀 때는 꼭 apply(action)을 거칩니다. 나중에 여러 명이 함께 놀 때는
// 이 action을 서버로 보내고, 남이 보낸 action도 똑같이 apply하면 됩니다.
import * as THREE from 'three';
import { buildItem, ITEM_BY_TYPE, mat, glowMat, HOUSE_W, HOUSE_D, HOUSE_H, roofMaterial } from './catalog.js?v=0.31';
import { PALETTE as P } from './palette.js?v=0.31';

export const PLOT_RADIUS = 20; // 둥근 섬의 반지름 (v0.20에서 10 → 20, 지름 2배)

// 우리 집 자리: 섬 뒤쪽 오른편. 문은 처음 서 있는 쪽을 비스듬히 바라봄 (벤치에 길이 막히지 않게)
export const HOUSE_SPOT = { type: 'cottage', x: 5.5, z: -10.2, rot: -20 };
// 집이 차지하는 네모 (+ 둘레 여유). 이 안에 있는 물건은 집과 겹침
export function inHouseArea(h, x, z, margin = 0.7) {
  const a = (h.rot || 0) * Math.PI / 180, dx = x - h.x, dz = z - h.z;
  const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
  return Math.abs(lx) < HOUSE_W / 2 + margin && lz > -HOUSE_D / 2 - margin && lz < HOUSE_D / 2 + 1.1 + margin; // 앞쪽은 발판·문 앞까지
}
// 집 자리와 겹치는 물건 정리: 처음부터 있던 자연물은 치우고, 직접 놓은 물건은 집 옆으로 비켜 줌
export function fitHouse(items) {
  const h = items.find((m) => m.type === 'cottage');
  if (!h) return items;
  const out = items.filter((m) => m === h || !(inHouseArea(h, m.x, m.z) && OUTER_NATURE.some((n) => n.type === m.type && Math.hypot(n.x - m.x, n.z - m.z) < 0.05)));
  const a = (h.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  out.forEach((m, i) => {
    if (m === h || !inHouseArea(h, m.x, m.z)) return;
    const dx = m.x - h.x, dz = m.z - h.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    // 집 옆으로 비켜 주되, 다른 물건과 겹치지 않는 자리를 찾을 때까지 조금씩 더 멀리
    let p = null;
    for (let k = 0; k < 12; k++) {
      const nx = (lx >= 0 ? 1 : -1) * (HOUSE_W / 2 + 1.0 + k * 0.6);
      p = clampToPlot(h.x + nx * c + lz * s, h.z - nx * s + lz * c);
      if (!inHouseArea(h, p.x, p.z) && !out.some((o) => o !== m && o !== h && Math.hypot(o.x - p.x, o.z - p.z) < 1.3)) break;
    }
    m.x = Math.round(p.x * 100) / 100; m.z = Math.round(p.z * 100) / 100;
  });
  return out;
}

// 집 안: 바깥 집과 같은 크기의 작은 방 하나. 벽 두께만큼 안쪽이 방바닥
// 집 안 자리는 '집 가운데'를 (0, 0)으로, 문 쪽을 +z로 하는 집 기준 자리예요
export const ROOM_T = 0.3;
export const ROOM_W = HOUSE_W - ROOM_T * 2, ROOM_D = HOUSE_D - ROOM_T * 2, ROOM_H = HOUSE_H + 0.1;
export const ROOM_DOOR = { x: 0, z: ROOM_D / 2 + 0.55 };   // 문 밖으로 이만큼 나가면 마당으로
export const ROOM_SPAWN = { x: 0, z: ROOM_D / 2 - 1.3 };   // 들어오면 걸어가 서는 자리
export const DEFAULT_ROOM_ITEMS = [
  { type: 'rug', x: 0.8, z: 0.2, rot: 0 },
  { type: 'table', x: 0.8, z: 0.1, rot: 0 },
  { type: 'chair', x: -0.25, z: 0.15, rot: 90 },
  { type: 'chair', x: 1.85, z: 0.15, rot: 270 },
  { type: 'bed', x: -3.9, z: -2.7, rot: 0 },
  { type: 'shelf', x: 2.0, z: -3.7, rot: 0 },
  { type: 'potPlant', x: 4.6, z: -3.4, rot: 0 },
  { type: 'potPlant', x: -4.6, z: 3.2, rot: 45 },
  { type: 'floatLantern', x: 3.6, z: 2.0, rot: 0 },
  { type: 'bench', x: -4.4, z: 0.6, rot: 90 },
];

export const DEFAULT_ITEMS = [
  { ...HOUSE_SPOT },
  { type: 'treeRound', x: -6, z: -5.5, rot: 0 },
  { type: 'treeRound', x: 6.5, z: -6, rot: 45 },
  { type: 'treePine', x: -8, z: 2.5, rot: 0 },
  { type: 'treePine', x: 7.5, z: 4.5, rot: 0 },
  { type: 'floatLantern', x: -3, z: 5, rot: 0 },
  { type: 'floatLantern', x: 5, z: 0, rot: 0 },
  { type: 'flowers', x: -4, z: -3, rot: 0 },
  { type: 'flowers', x: 4.5, z: -2.5, rot: 90 },
  { type: 'bush', x: -8, z: -1, rot: 0 },
  { type: 'bench', x: 0, z: -6, rot: 0 },
  { type: 'lamp', x: 2, z: -6, rot: 0 },
  { type: 'mailbox', x: 2.5, z: 4, rot: 0 },
  { type: 'stepStone', x: 0, z: 6, rot: 0 },
  { type: 'stepStone', x: 0.4, z: 7.5, rot: 45 },
  { type: 'stepStone', x: -0.2, z: 8.3, rot: 90 },
  { type: 'lamp', x: -2, z: -6, rot: 0 },
  { type: 'rock', x: 6, z: 2, rot: 0 },
];

// 섬을 넓히면서 바깥쪽에 흩어 둔 자연물 (휑하지 않게). 예전 저장에도 한 번만 더해 줌
export const OUTER_NATURE = (() => {
  let v = 23; const r = () => ((v = (v * 9301 + 49297) % 233280) / 233280); // 늘 같은 자리가 나오는 난수
  const kinds = ['treeRound', 'treePine', 'bush', 'treeRound', 'flowers', 'rock', 'treePine', 'bush', 'flowers'];
  const out = [];
  let tries = 0;
  while (out.length < 26 && tries++ < 400) {
    const a = r() * Math.PI * 2, d = 11.5 + r() * 6.8;
    const x = Math.round(Math.cos(a) * d * 10) / 10, z = Math.round(Math.sin(a) * d * 10) / 10;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.6)) continue; // 서로 너무 붙지 않게
    if (Math.abs(x) < 1.6 && z > 0) continue; // 앞쪽 산책길은 비워 둠
    out.push({ type: kinds[out.length % kinds.length], x, z, rot: Math.round(r() * 8) * 45 });
  }
  return out;
})();
DEFAULT_ITEMS.push(...OUTER_NATURE);
DEFAULT_ITEMS.splice(0, DEFAULT_ITEMS.length, ...fitHouse(DEFAULT_ITEMS.map((i) => ({ ...i }))));

// 광장: 모두가 만나는 작은 마을 광장 (데모라 '광장인 걸 알 정도'로 작게)
// 가운데 분수대, 둘레에 벤치 4개와 가로등 4개, 한쪽에 큰 나무 한 그루,
// 가장자리로 뻗은 디딤돌 길 3갈래 (나중에 테마파크·상점·바닷가 입구를 붙일 자리)
export const PLAZA_ITEMS = (() => {
  const out = [];
  const deg = (a) => Math.round((a * 180) / Math.PI);
  const at = (type, a, r, rot = 0) => {
    out.push({ id: `plaza-${out.length}`, type, x: Math.round(Math.sin(a) * r * 100) / 100, z: Math.round(Math.cos(a) * r * 100) / 100, rot });
  };
  out.push({ id: 'plaza-floor', type: 'plazaFloor', x: 0, z: 0, rot: 0 });
  out.push({ id: 'plaza-fountain', type: 'fountain', x: 0, z: 0, rot: 22.5 });
  // 벤치 4개: 모두 분수대를 바라봄. 길이 나가는 방향(앞·왼쪽 뒤·오른쪽 뒤)은 비워 둠
  [Math.PI * 0.32, Math.PI * 0.68 + Math.PI * 0.32, -Math.PI * 0.32, -(Math.PI * 0.68 + Math.PI * 0.32)]
    .forEach((a) => at('bench', a, 4.6, deg(a + Math.PI)));
  [0.5, 1.5, -0.5, -1.5].forEach((k) => at('lamp', (Math.PI / 2) * k + Math.PI / 2 * 0, 7.2));
  out.push({ id: 'plaza-bigtree', type: 'bigTree', x: -9.5, z: -6.5, rot: 20 }); // 큰 나무 한 그루
  // 디딤돌 길 3갈래: 앞(처음 오는 곳), 왼쪽 뒤, 오른쪽 뒤
  [0, Math.PI * 0.68 + Math.PI * 0.32 - Math.PI * 0.25, -(Math.PI * 0.75)].forEach((a, j) => {
    for (let i = 0; i < 4; i++) at('stepStone', a, 8.6 + i * 1.4, (i + j) * 30);
  });
  // 가장자리 꽃·덤불 조금
  [0.35, -0.35, 1.9, -1.9].forEach((a, i) => at(i % 2 ? 'flowers' : 'bush', a, 9.2, i * 45));
  return out;
})();

let idCounter = 0;
export function newId() {
  return Date.now().toString(36) + '-' + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 5);
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map(); // id -> { data, obj }  (지금 꾸미는 곳의 물건: 마당 또는 집 안)
    // 마당 전체(섬·물·마당 물건)를 담는 묶음. 집 안에 있는 동안에는 이 묶음을 통째로 돌리고 옮겨서
    // '집 가운데 = (0,0)'이 되게 해요. 그래서 집 안도 마당도 화면 전환 없이 한 장면에 함께 보여요
    this.frame = new THREE.Group();
    scene.add(this.frame);
    this.yardRoot = new THREE.Group();
    this.frame.add(this.yardRoot);
    this.houseRoot = new THREE.Group(); // 집 안 물건 (집 기준 자리)
    scene.add(this.houseRoot);
    this.root = this.yardRoot;
    this.listeners = [];
    this.outdoor = new THREE.Group(); // 섬·물
    this.frame.add(this.outdoor);
    this.buildTerrain();
    this.buildRoom();
    this.indoor = false;
    this.yardMap = null; // 집 안에 있는 동안: 마당 물건 (보이기만 함)
  }

  onChange(fn) { this.listeners.push(fn); }
  emit(action) { this.listeners.forEach((fn) => fn(action)); }

  buildTerrain() {
    // 잔잔한 물 (하늘색을 비추도록 환경에서 색을 바꿉니다)
    this.water = new THREE.Mesh(
      new THREE.CircleGeometry(400, 48),
      new THREE.MeshPhongMaterial({ color: 0x8ec5f0, shininess: 25, specular: 0x1e1e1e })
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -0.9;
    this.water.receiveShadow = true;
    this.outdoor.add(this.water);

    // 물결 반짝임 (가는 줄무늬 그림을 천천히 흘려 보냄)
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    let v = 5; const r = () => ((v = (v * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 90; i++) {
      const x = r() * 256, y = r() * 256, w = 10 + r() * 40;
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`;
      ctx.lineWidth = 1 + r() * 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y - 2, x + w, y); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    this.ripples = new THREE.Mesh(
      new THREE.CircleGeometry(400, 48),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.ripples.rotation.x = -Math.PI / 2;
    this.ripples.position.y = -0.88;
    this.rippleTex = tex;
    this.outdoor.add(this.ripples);
    // 두 번째 물결 층: 크기·속도·방향을 조금 다르게 해서 물이 흘러가는 느낌을 줌
    const tex2 = tex.clone();
    tex2.needsUpdate = true;
    tex2.repeat.set(22, 22);
    tex2.rotation = 0.6;
    this.ripples2 = new THREE.Mesh(
      new THREE.CircleGeometry(400, 48),
      new THREE.MeshBasicMaterial({ map: tex2, transparent: true, opacity: 0.3, depthWrite: false })
    );
    this.ripples2.rotation.x = -Math.PI / 2;
    this.ripples2.position.y = -0.87;
    this.rippleTex2 = tex2;
    this.outdoor.add(this.ripples2);

    // 마당: 물 위에 뜬 둥근 섬 (잔디 + 흙 + 나무 테두리)
    const R = PLOT_RADIUS;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.3, R - 1.6, 1.6, 72), mat(P.plotSide));
    soil.position.y = -0.82;
    soil.receiveShadow = true;
    this.outdoor.add(soil);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.1, 96), mat(P.plotGrass));
    top.position.y = -0.05;
    top.receiveShadow = true;
    this.outdoor.add(top);
    this.groundPick = top;
    this.islandTop = top;
    // 나무 말뚝 테두리: 손으로 박은 것처럼 간격·굵기·높이·기울기를 조금씩 다르게
    let sv = 11; const rnd = () => ((sv = (sv * 9301 + 49297) % 233280) / 233280); // 늘 같은 모양이 나오는 난수
    const post = new THREE.CylinderGeometry(0.16, 0.18, 0.5, 6);
    const woods = [mat(P.wood), mat(P.woodDark), mat(0xa47a55)];
    let a = 0;
    while (a < Math.PI * 2 - 0.05) {
      const thick = 0.8 + rnd() * 0.45;
      const pm = new THREE.Mesh(post, woods[Math.floor(rnd() * 3)]);
      const h = 0.32 + rnd() * 0.3;
      pm.scale.set(thick, h / 0.5, thick);
      const rr = R + 0.08 + rnd() * 0.1;
      pm.position.set(Math.cos(a) * rr, -0.05 + h / 2 - 0.1, Math.sin(a) * rr);
      pm.rotation.set((rnd() - 0.5) * 0.12, rnd() * Math.PI, (rnd() - 0.5) * 0.12);
      pm.castShadow = true; pm.receiveShadow = true;
      this.outdoor.add(pm);
      a += (0.3 * thick + 0.02 + rnd() * 0.05) / R; // 말뚝 굵기만큼 띄우고, 사이 간격도 들쭉날쭉
    }

    // 꾸미기 중에만 보이는 바둑판 줄
    const s = Math.ceil(R) * 2;
    this.grid = new THREE.GridHelper(s, s, 0xffffff, 0xffffff);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.16;
    this.grid.position.y = 0.01;
    this.grid.visible = false;
    this.outdoor.add(this.grid);
  }

  // ---- 집 안 (작은 방 하나) ----
  // 벽 네 면 중 카메라 쪽 벽은 낮게 깎여서, 언제나 안쪽 벽 두세 면만 보여요 (카메라를 돌려도)
  buildRoom() {
    const W = ROOM_W, D = ROOM_D, H = ROOM_H, T = ROOM_T;
    const room = new THREE.Group();
    room.visible = false;
    this.scene.add(room);
    this.room = room;
    const tex = (draw, rx, ry) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      draw(c.getContext('2d'));
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
      return t;
    };
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    // 마루: 꿀빛 나무 널판 (반짝이지 않게)
    const floorTex = tex((ctx) => {
      ctx.fillStyle = hex(P.floorWood); ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = hex(P.floorLine);
      for (let i = 0; i < 4; i++) { ctx.fillRect(0, i * 32, 128, 2); ctx.fillRect(((i * 53) % 128), i * 32, 2, 32); ctx.fillRect(((i * 53 + 64) % 128), i * 32, 2, 32); }
    }, W / 4, D / 4);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.position.y = -0.1; floor.receiveShadow = true;
    room.add(floor);
    this.roomFloor = floor;
    // 방 아래 받침 (얇은 종이처럼 보이지 않게)
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * T, 0.7, D + 2 * T), mat(P.woodDark));
    base.position.y = -0.55; base.receiveShadow = true;
    room.add(base);
    // 벽지: 크림 바탕에 아주 옅은 점 무늬
    const paper = (len) => new THREE.MeshLambertMaterial({ map: tex((ctx) => {
      ctx.fillStyle = hex(P.wallpaper); ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = hex(P.wallDot);
      [[32, 32], [96, 96]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); });
    }, len / 1.4, H / 1.4) });
    // 창문 유리는 바깥 하늘빛을 받아요 (환경에서 색을 바꿈)
    this.windowMat = new THREE.MeshBasicMaterial({ color: 0xd8ecf8 });
    const addWindow = (wall, list, x, w = 1.5, h = 1.3, y = 1.85) => {
      const g = new THREE.Group();
      const fr = mat(P.sage);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.windowMat);
      glass.position.z = 0.005;
      g.add(glass);
      [[0, h / 2 + 0.06, w + 0.24, 0.12], [0, -h / 2 - 0.06, w + 0.24, 0.12], [0, 0, w, 0.06]].forEach(([px, py, bw, bh]) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.1), fr); b.position.set(px, py, 0.04); g.add(b);
      });
      [-w / 2 - 0.06, w / 2 + 0.06, 0].forEach((px, i) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(i < 2 ? 0.12 : 0.06, h, 0.1), fr); b.position.set(px, 0, 0.04); g.add(b);
      });
      const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.08, 0.22), mat(P.wood)); sill.position.set(0, -h / 2 - 0.14, 0.1); g.add(sill);
      g.position.set(x, y, T / 2 + 0.01);
      wall.add(g);
      list.push(g);
    };
    // 벽 하나: 안쪽(+z 쪽)이 방을 보도록 만든 뒤 돌려서 세움
    const makeWall = (len, px, pz, rotY, opts = {}) => {
      const wall = new THREE.Group();
      wall.userData.windows = [];
      const body = new THREE.Group(); // 이 묶음만 위아래로 줄였다 늘림
      wall.add(body);
      const pieces = opts.gap
        ? [[-(len / 2 + opts.gap / 2) / 2, len / 2 - opts.gap / 2], [(len / 2 + opts.gap / 2) / 2, len / 2 - opts.gap / 2]]
        : [[0, len]];
      pieces.forEach(([cx, pl]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(pl, H, T), [mat(P.houseWall), mat(P.houseWall), mat(P.wood), mat(P.houseWall), paper(pl), mat(P.houseWall)]);
        m.position.set(cx, H / 2, 0); m.receiveShadow = true;
        body.add(m);
        const wain = new THREE.Mesh(new THREE.BoxGeometry(pl, 0.95, 0.06), mat(P.wainscot)); // 벽 아래 나무 판
        wain.position.set(cx, 0.475, T / 2 + 0.03); body.add(wain);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(pl, 0.08, 0.1), mat(P.wood));
        rail.position.set(cx, 0.97, T / 2 + 0.05); body.add(rail);
        const top = new THREE.Mesh(new THREE.BoxGeometry(pl + 0.02, 0.12, T + 0.08), mat(P.wood));
        top.position.set(cx, H, 0); body.add(top);
      });
      if (opts.gap) { // 문 위 벽
        const lin = new THREE.Mesh(new THREE.BoxGeometry(opts.gap + 0.02, H - 2.5, T), [mat(P.houseWall), mat(P.houseWall), mat(P.wood), mat(P.houseWall), paper(opts.gap), mat(P.houseWall)]);
        lin.position.set(0, 2.5 + (H - 2.5) / 2, 0); body.add(lin);
      }
      (opts.windows || []).forEach((x) => addWindow(body, wall.userData.windows, x));
      wall.position.set(px, 0, pz);
      wall.rotation.y = rotY;
      wall.userData.body = body;
      wall.userData.normal = new THREE.Vector3(-Math.sin(rotY), 0, -Math.cos(rotY)); // 바깥쪽 방향
      wall.userData.cut = 1;
      room.add(wall);
      return wall;
    };
    this.walls = [
      makeWall(W + T * 2, 0, -D / 2 - T / 2, 0, { windows: [-3.0, 3.0] }),        // 뒤
      makeWall(D, -W / 2 - T / 2, 0, Math.PI / 2, { windows: [0] }),              // 왼쪽
      makeWall(D, W / 2 + T / 2, 0, -Math.PI / 2, { windows: [0] }),              // 오른쪽
      makeWall(W + T * 2, 0, D / 2 + T / 2, Math.PI, { gap: 1.5 }),               // 앞 (문 자리 비움)
    ];
    // 앞쪽 문: 벽이 낮게 깎여도 문은 그대로 서 있어서 '나가는 곳'이 늘 보여요
    const door = new THREE.Group();
    const dark = mat(P.woodDark), wood = mat(P.wood);
    const shape = (hw, hh) => { const s = new THREE.Shape(); s.moveTo(-hw, 0); s.lineTo(-hw, hh); s.absarc(0, hh, hw, Math.PI, 0, true); s.lineTo(hw, 0); s.lineTo(-hw, 0); return s; };
    const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(shape(0.78, 1.75), { depth: T + 0.1, bevelEnabled: false }), dark);
    fr.position.z = -(T + 0.1) / 2; door.add(fr);
    // 문틀은 가운데가 뚫린 아치 (지나다닐 수 있게). 앞쪽 벽이 낮아지면 문틀도 같이 낮아져서 방을 가리지 않아요
    door.remove(fr);
    const ring = shape(0.78, 1.75); ring.holes.push(shape(0.6, 1.72));
    const fr2 = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: T + 0.1, bevelEnabled: false }), dark);
    fr2.position.z = -(T + 0.1) / 2; door.add(fr2);
    door.position.set(0, 0, D / 2 + T / 2);
    door.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    room.add(door);
    this.roomDoor = door;
    // 문 앞 매트 (세이지)
    const matt = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.025, 0.75), mat(P.sage));
    matt.position.set(0, 0.0125, D / 2 - 0.5); matt.receiveShadow = true;
    room.add(matt);
    // 모서리 기둥
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(T + 0.06, H + 0.1, T + 0.06), mat(P.wood));
      p.position.set(sx * (W / 2 + T / 2), (H + 0.1) / 2, sz * (D / 2 + T / 2));
      p.userData.corner = [sx, sz];
      room.add(p);
    });
    this.corners = room.children.filter((o) => o.userData.corner);
    // 꾸미기 격자 (방 크기)
    this.roomGrid = new THREE.GridHelper(W, W, 0xffffff, 0xffffff);
    this.roomGrid.scale.z = D / W;
    this.roomGrid.material.transparent = true; this.roomGrid.material.opacity = 0.2;
    this.roomGrid.position.y = 0.01; this.roomGrid.visible = false;
    room.add(this.roomGrid);
    // 지붕: 바깥 집 지붕과 같은 모양. 들어가면 스르륵 투명해지며 사라지고, 나오면 다시 덮여요
    const R = HOUSE_D / 2 + 0.35, L = HOUSE_W + 0.7;
    this.roofMat = roofMaterial().clone();
    this.roofMat.transparent = true;
    this.roof = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 20, 1, true, 0, Math.PI), this.roofMat);
    this.roof.rotation.z = Math.PI / 2; this.roof.scale.set(0.72, 1, 1);
    this.roof.position.y = H;
    room.add(this.roof);
    this.roofOpacity = 1;
    this.closing = false;
  }

  // ---- 집에 들어가기 / 나오기 (화면 전환 없이) ----
  // house: 마당에서의 집 자리 { x, z, rot }. 집 안 물건은 houseItems
  enterHouse(house, houseItems) {
    const a = house.rot * Math.PI / 180;
    this.houseT = { x: house.x, z: house.z, a };
    // 마당 묶음을 거꾸로 돌리고 옮겨서 집 가운데가 (0,0)에 오게
    this.frame.rotation.y = -a;
    this.frame.position.set(-house.x, 0, -house.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    this.frame.position.y = -0.04; // 마당 잔디를 방바닥보다 살짝 아래로 (바닥에 잔디가 비치지 않게)
    this.yardMap = this.items;
    this.yardMap.forEach(({ data, obj }) => { if (data.type === 'cottage') obj.visible = false; });
    this.items = new Map();
    this.root = this.houseRoot;
    houseItems.forEach((it) => this._add(it));
    this.indoor = true; this.closing = false;
    this.room.visible = true;
    this.roofOpacity = 1;
    this.walls.forEach((w) => { w.userData.cut = 1; }); // 처음엔 다 서 있다가 앞쪽 벽이 천천히 낮아짐
    this.groundPick = this.roomFloor;
    this.grid.visible = false; this.roomGrid.visible = false;
  }
  // 지붕이 다 덮인 뒤 마당으로 돌아가기. 집 안 물건 목록을 돌려줌
  exitHouse() {
    const house = this.serialize();
    [...this.items.keys()].forEach((id) => this._remove(id));
    this.items = this.yardMap; this.yardMap = null;
    this.items.forEach(({ obj }) => { obj.visible = true; });
    this.root = this.yardRoot;
    this.frame.rotation.y = 0; this.frame.position.set(0, 0, 0);
    this.indoor = false; this.closing = false;
    this.room.visible = false;
    this.groundPick = this.islandTop;
    this.grid.visible = false; this.roomGrid.visible = false;
    return house;
  }
  // 집 안에 있는 동안 마당 모습이 바뀌면 (친구 섬에서 주인이 꾸밀 때) 뒤쪽 마당만 새로 그림
  setYard(items) {
    if (!this.indoor) return;
    const cur = this.items, curRoot = this.root;
    this.items = this.yardMap; this.root = this.yardRoot;
    [...this.items.keys()].forEach((id) => this._remove(id));
    items.forEach((it) => this._add(it));
    this.items.forEach(({ data, obj }) => { if (data.type === 'cottage') obj.visible = false; });
    this.items = cur; this.root = curRoot;
  }
  // 집 기준 자리 ↔ 마당 자리
  toLocal(x, z) {
    const t = this.houseT, dx = x - t.x, dz = z - t.z, c = Math.cos(t.a), s = Math.sin(t.a);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }
  toYard(x, z) {
    const t = this.houseT, c = Math.cos(t.a), s = Math.sin(t.a);
    return { x: t.x + x * c + z * s, z: t.z - x * s + z * c };
  }

  get activeGrid() { return this.indoor ? this.roomGrid : this.grid; }

  // 카메라 쪽 벽은 낮게: 벽의 바깥 방향과 카메라 방향이 같으면 깎음 (천천히)
  updateWalls(dt, camPos) {
    if (!this.indoor) return;
    const LOW = 0.12;
    this.walls.forEach((w) => {
      const toCam = new THREE.Vector3(camPos.x, 0, camPos.z).normalize(); // 방 가운데에서 카메라 쪽 방향
      const want = !this.closing && w.userData.normal.dot(toCam) > 0.3 ? LOW : 1; // 나갈 때는 벽을 다시 세움
      const cur = w.userData.cut + (want - w.userData.cut) * Math.min(1, dt * 5);
      w.userData.cut = cur;
      w.userData.body.scale.y = cur;
      w.userData.windows.forEach((g) => { g.visible = cur > 0.7; });
    });
    this.roomDoor.scale.y = Math.max(0.12, this.walls[3].userData.cut);
    // 지붕: 들어오면 사라지고, 나갈 때 다시 덮임
    const wantRoof = this.closing ? 1 : 0;
    this.roofOpacity += Math.sign(wantRoof - this.roofOpacity) * Math.min(Math.abs(wantRoof - this.roofOpacity), dt * 2.2);
    this.roofMat.opacity = this.roofOpacity;
    this.roof.visible = this.roofOpacity > 0.01;
    this.roofMat.depthWrite = this.roofOpacity > 0.98;
    // 모서리 기둥: 붙은 두 벽 중 하나라도 깎이면 같이 낮춤
    this.corners.forEach((p) => {
      const [sx, sz] = p.userData.corner;
      const wx = this.walls[sx < 0 ? 1 : 2].userData.cut, wz = this.walls[sz < 0 ? 0 : 3].userData.cut;
      p.scale.y = Math.min(wx, wz);
      p.position.y = ((ROOM_H + 0.1) / 2) * p.scale.y;
    });
  }

  // 집 문 앞 자리 (마당에서): 여기까지 걸어가면 집 안으로
  doors() {
    const out = [];
    this.items.forEach(({ data }) => {
      const d = ITEM_BY_TYPE[data.type].door;
      if (!d) return;
      const a = data.rot * Math.PI / 180;
      out.push({ id: data.id, x: data.x + d.x * Math.cos(a) + d.z * Math.sin(a), z: data.z - d.x * Math.sin(a) + d.z * Math.cos(a), rot: data.rot });
    });
    return out;
  }

  update(dt) {
    // 물결 무늬를 한 방향으로 천천히 흘려 보냄 (그림만 움직여서 가벼움)
    this.rippleTex.offset.x += dt * 0.045;
    this.rippleTex.offset.y += dt * 0.012;
    this.rippleTex2.offset.x += dt * 0.025;
    this.rippleTex2.offset.y -= dt * 0.008;
    // 물 높이를 아주 살짝 출렁이게
    const tt = performance.now() / 1000;
    this.ripples.position.y = -0.88 + Math.sin(tt * 0.8) * 0.015;
    const t = performance.now() / 1000;
    const bob = ({ obj }) => {
      if (obj.userData.float) obj.userData.float.position.y = 1.3 + Math.sin(t * 1.4 + obj.position.x) * 0.12;
      if (obj.userData.type === 'fountain') obj.children.forEach((c) => { if (c.userData.bob) c.position.y = 2.42 + Math.abs(Math.sin(t * 1.6)) * 0.12; });
    };
    this.items.forEach(bob);
    if (this.yardMap) this.yardMap.forEach(bob);
  }

  // ---- 데이터 바꾸기 (모든 변경은 여기로) ----
  apply(action, { silent = false } = {}) {
    switch (action.type) {
      case 'add': this._add(action.item); break;
      case 'update': this._update(action.id, action.patch); break;
      case 'remove': this._remove(action.id); break;
      case 'replaceAll':
        [...this.items.keys()].forEach((id) => this._remove(id));
        action.items.forEach((it) => this._add(it));
        break;
    }
    if (!silent) this.emit(action);
  }

  _add(item) {
    if (!ITEM_BY_TYPE[item.type]) return;
    const data = { id: item.id || newId(), type: item.type, x: item.x, z: item.z, rot: item.rot || 0 };
    const obj = buildItem(data.type);
    obj.userData.itemId = data.id;
    this.root.add(obj);
    this.items.set(data.id, { data, obj });
    this._place(data.id);
  }

  _update(id, patch) {
    const it = this.items.get(id);
    if (!it) return;
    Object.assign(it.data, patch);
    this._place(id);
  }

  _remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    this.root.remove(it.obj);
    this.items.delete(id);
  }

  _place(id) {
    const { data, obj } = this.items.get(id);
    obj.position.set(data.x, 0, data.z);
    obj.rotation.y = data.rot * (Math.PI / 180); // rot = 각도(도)
  }

  serialize() {
    return [...this.items.values()].map(({ data }) => ({ ...data }));
  }

  findItemFromObject(o) {
    while (o) {
      if (o.userData && o.userData.itemId) return o.userData.itemId;
      o = o.parent;
    }
    return null;
  }

  lightSources() {
    const out = [];
    const add = ({ obj }) => { if (obj.userData.light && obj.visible) out.push(obj.localToWorld(obj.userData.light.clone())); };
    this.items.forEach(add);
    if (this.yardMap) this.yardMap.forEach(add); // 집 안에서도 마당 등불 빛이 보이게
    return out;
  }

  colliders() {
    const out = [];
    this.items.forEach(({ data }) => {
      const def = ITEM_BY_TYPE[data.type];
      if (def.colliders) {
        // 집처럼 네모난 물건: 여러 동그라미를 물건 방향에 맞춰 돌려서 놓음
        const a = data.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        def.colliders.forEach((k) => out.push({ x: data.x + k.x * c + k.z * s, z: data.z - k.x * s + k.z * c, r: k.r }));
      } else if (def.radius > 0) out.push({ x: data.x, z: data.z, r: def.radius });
    });
    return out;
  }
}

export function snap(v) {
  return Math.round(v * 2) / 2; // 0.5칸 단위로 맞추기
}
// 방 밖으로 나가지 않게 (벽 안쪽으로)
export function clampToRoom(x, z, pad = 0.45, door = false) {
  // 걷는 사람은 문 자리(앞쪽 가운데)로만 벽 밖으로 지나갈 수 있음
  if (door && z > ROOM_D / 2 - pad && Math.abs(x) < 0.9) return { x: Math.max(-0.5, Math.min(0.5, x)), z: Math.min(ROOM_D / 2 + 1.6, z) };
  return { x: Math.max(-ROOM_W / 2 + pad, Math.min(ROOM_W / 2 - pad, x)), z: Math.max(-ROOM_D / 2 + pad, Math.min(ROOM_D / 2 - pad, z)) };
}
// 섬 밖으로 나가지 않게 안쪽으로 당기기
export function clampToPlot(x, z) {
  const lim = PLOT_RADIUS - 0.6, d = Math.hypot(x, z);
  if (d <= lim) return { x, z };
  return { x: (x / d) * lim, z: (z / d) * lim };
}
