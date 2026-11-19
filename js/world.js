// 마당의 '데이터'와 화면 속 물건을 함께 관리합니다.
// 물건을 바꿀 때는 꼭 apply(action)을 거칩니다. 나중에 여러 명이 함께 놀 때는
// 이 action을 서버로 보내고, 남이 보낸 action도 똑같이 apply하면 됩니다.
import * as THREE from 'three';
import { buildItem, ITEM_BY_TYPE, mat } from './catalog.js?v=0.20';
import { PALETTE as P } from './palette.js?v=0.20';

export const PLOT_RADIUS = 20; // 둥근 섬의 반지름 (v0.20에서 10 → 20, 지름 2배)

export const DEFAULT_ITEMS = [
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

let idCounter = 0;
export function newId() {
  return Date.now().toString(36) + '-' + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 5);
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map(); // id -> { data, obj }
    this.root = new THREE.Group();
    scene.add(this.root);
    this.listeners = [];
    this.buildTerrain();
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
    this.scene.add(this.water);

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
    this.scene.add(this.ripples);
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
    this.scene.add(this.ripples2);

    // 마당: 물 위에 뜬 둥근 섬 (잔디 + 흙 + 나무 테두리)
    const R = PLOT_RADIUS;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.3, R - 1.6, 1.6, 72), mat(P.plotSide));
    soil.position.y = -0.82;
    soil.receiveShadow = true;
    this.scene.add(soil);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.1, 96), mat(P.plotGrass));
    top.position.y = -0.05;
    top.receiveShadow = true;
    this.scene.add(top);
    this.groundPick = top;
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
      this.scene.add(pm);
      a += (0.3 * thick + 0.02 + rnd() * 0.05) / R; // 말뚝 굵기만큼 띄우고, 사이 간격도 들쭉날쭉
    }

    // 꾸미기 중에만 보이는 바둑판 줄
    const s = Math.ceil(R) * 2;
    this.grid = new THREE.GridHelper(s, s, 0xffffff, 0xffffff);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.16;
    this.grid.position.y = 0.01;
    this.grid.visible = false;
    this.scene.add(this.grid);
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
    this.items.forEach(({ obj }) => {
      if (obj.userData.float) obj.userData.float.position.y = 1.3 + Math.sin(t * 1.4 + obj.position.x) * 0.12;
    });
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
    this.items.forEach(({ obj }) => {
      if (obj.userData.light) out.push(obj.localToWorld(obj.userData.light.clone()));
    });
    return out;
  }

  colliders() {
    const out = [];
    this.items.forEach(({ data }) => {
      const r = ITEM_BY_TYPE[data.type].radius;
      if (r > 0) out.push({ x: data.x, z: data.z, r });
    });
    return out;
  }
}

export function snap(v) {
  return Math.round(v * 2) / 2; // 0.5칸 단위로 맞추기
}
// 섬 밖으로 나가지 않게 안쪽으로 당기기
export function clampToPlot(x, z) {
  const lim = PLOT_RADIUS - 0.6, d = Math.hypot(x, z);
  if (d <= lim) return { x, z };
  return { x: (x / d) * lim, z: (z / d) * lim };
}
