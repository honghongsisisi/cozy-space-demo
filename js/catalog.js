// 아이템 목록. 새 물건을 넣으려면 ITEMS에 한 줄 추가하고 build 함수를 만들면 됩니다.
import * as THREE from 'three';
import { PALETTE as P } from './palette.js?v=0.31';

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

// 지붕 기와 줄무늬 그림 (반짝이지 않는 차분한 무늬)
let roofTex = null;
function roofTexture() {
  if (roofTex) return roofTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(120,90,70,0.35)'; ctx.lineWidth = 3;
  for (let row = 0; row < 4; row++) {
    const y = row * 32 + 30, off = row % 2 ? 16 : 0;
    for (let x = -32 + off; x < 160; x += 32) { ctx.beginPath(); ctx.arc(x + 16, y - 14, 16, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  }
  roofTex = new THREE.CanvasTexture(c);
  roofTex.colorSpace = THREE.SRGBColorSpace;
  roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping;
  roofTex.repeat.set(5, 2.5);
  return roofTex;
}

let roofMat_ = null;
export function roofMaterial() {
  if (!roofMat_) roofMat_ = new THREE.MeshLambertMaterial({ color: P.roof, side: THREE.DoubleSide, map: roofTexture() });
  return roofMat_;
}

// 집 크기: 바깥 모습과 집 안 방이 같은 크기라서, 들어가면 그 자리에서 지붕만 사라지고 방이 보여요
export const HOUSE_W = 11, HOUSE_D = 8.5, HOUSE_H = 2.8; // v0.30: 방이 넉넉하도록 크게

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
  // ---- 집 (섬마다 한 채, 가구 창에는 나오지 않음) ----
  // 둥근 지붕의 아담한 오두막. 앞쪽(+z) 가운데가 문이고, 문 앞까지 걸어가면 집 안으로 들어가요.
  cottage() {
    const g = new THREE.Group();
    const W = HOUSE_W, D = HOUSE_D, H = HOUSE_H; // 너비·깊이·벽 높이 (집 안 방과 같은 크기)
    const wall = mat(P.houseWall), wood = mat(P.wood), dark = mat(P.woodDark);
    // 바닥 받침 + 벽
    g.add(mesh(new THREE.BoxGeometry(W + 0.3, 0.28, D + 0.3), dark, 0, 0.14, 0));
    g.add(mesh(new THREE.BoxGeometry(W, H, D), wall, 0, H / 2 + 0.1, 0));
    // 모서리 기둥과 가로 나무띠
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => g.add(mesh(new THREE.BoxGeometry(0.24, H + 0.05, 0.24), wood, sx * W / 2, H / 2 + 0.12, sz * D / 2)));
    g.add(mesh(new THREE.BoxGeometry(W + 0.1, 0.16, 0.08), wood, 0, H + 0.04, D / 2 + 0.02));
    g.add(mesh(new THREE.BoxGeometry(W + 0.1, 0.16, 0.08), wood, 0, H + 0.04, -D / 2 - 0.02));
    // 둥근 지붕: 반 원통을 옆으로 눕히고 살짝 납작하게. 기와 줄 무늬는 그림으로
    const R = D / 2 + 0.35, L = W + 0.7, FLAT = 0.72;
    const roofMat = roofMaterial();
    const roof = mesh(new THREE.CylinderGeometry(R, R, L, 20, 1, true, 0, Math.PI), roofMat, 0, H + 0.1, 0);
    roof.rotation.z = Math.PI / 2; roof.scale.set(FLAT, 1, 1); // 눕힌 뒤 위아래(원래 x)를 납작하게
    g.add(roof);
    // 지붕 양 끝 테두리 (조금 진한 색)
    [-1, 1].forEach((sx) => {
      const rim = mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.16, 20, 1, true, 0, Math.PI), mat(P.roofLine, { flatShading: false, side: THREE.DoubleSide }), sx * (L / 2 - 0.08), H + 0.1, 0);
      rim.rotation.z = Math.PI / 2; rim.scale.set(FLAT, 1, 1);
      g.add(rim);
      // 박공(지붕 밑 반달 벽)과 작은 둥근 창
      const gable = mesh(new THREE.CircleGeometry(D / 2 + 0.05, 20, 0, Math.PI), wall, sx * (W / 2 + 0.005), H + 0.1, 0);
      gable.rotation.y = sx * Math.PI / 2; gable.scale.set(1, FLAT, 1);
      gable.material = mat(P.houseWall, { side: THREE.DoubleSide });
      g.add(gable);
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), glowMat);
      win.position.set(sx * (W / 2 + 0.02), H + 0.55, 0); win.rotation.y = sx * Math.PI / 2;
      g.add(win);
      const ring = mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 16), wood, sx * (W / 2 + 0.03), H + 0.55, 0);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
    });
    // 굴뚝 (돌)
    g.add(mesh(new THREE.BoxGeometry(0.6, 1.3, 0.6), mat(P.stone), 3.4, H + 2.6, -1.3));
    g.add(mesh(new THREE.BoxGeometry(0.74, 0.14, 0.74), mat(P.stoneDark), 3.4, H + 3.3, -1.3));
    // 문: 위가 둥근 나무 문 + 문틀 + 손잡이 + 작은 둥근 창
    const fz = D / 2;
    const frameShape = new THREE.Shape();
    frameShape.moveTo(-0.62, 0); frameShape.lineTo(-0.62, 1.35); frameShape.absarc(0, 1.35, 0.62, Math.PI, 0, true); frameShape.lineTo(0.62, 0); frameShape.lineTo(-0.62, 0);
    const frame = mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.1, bevelEnabled: false }), dark, 0, 0.28, fz - 0.02);
    g.add(frame);
    const doorShape = new THREE.Shape();
    doorShape.moveTo(-0.48, 0); doorShape.lineTo(-0.48, 1.32); doorShape.absarc(0, 1.32, 0.48, Math.PI, 0, true); doorShape.lineTo(0.48, 0); doorShape.lineTo(-0.48, 0);
    g.add(mesh(new THREE.ExtrudeGeometry(doorShape, { depth: 0.08, bevelEnabled: false }), wood, 0, 0.28, fz + 0.04));
    // 문의 세로 나무결 두 줄
    [-0.16, 0.16].forEach((x) => g.add(mesh(new THREE.BoxGeometry(0.03, 1.5, 0.02), dark, x, 1.0, fz + 0.13)));
    const knob = mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(P.stoneDark), 0.3, 1.0, fz + 0.15);
    g.add(knob);
    const dwin = new THREE.Mesh(new THREE.CircleGeometry(0.17, 14), glowMat);
    dwin.position.set(0, 1.55, fz + 0.13);
    g.add(dwin);
    // 문 앞 나무 발판 (두 칸)
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.18, 0.7), dark, 0, 0.09, fz + 0.45));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.1, 0.4), wood, 0, 0.05, fz + 0.95));
    // 문 양옆 창문: 세이지 창틀 + 십자 창살. 유리는 밤이 되면 따뜻하게 불이 켜져요
    [-1, 1].forEach((sx) => {
      const x = sx * 2.8;
      g.add(mesh(new THREE.BoxGeometry(0.95, 0.85, 0.08), mat(P.sage), x, 1.25, fz + 0.03));
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.65), glowMat);
      glass.position.set(x, 1.25, fz + 0.075);
      g.add(glass);
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.65, 0.03), mat(P.sage), x, 1.25, fz + 0.09));
      g.add(mesh(new THREE.BoxGeometry(0.75, 0.05, 0.03), mat(P.sage), x, 1.25, fz + 0.09));
      g.add(mesh(new THREE.BoxGeometry(1.05, 0.08, 0.2), wood, x, 0.8, fz + 0.1)); // 창턱
    });
    // 문 옆 작은 등 (밤에 불이 켜져요)
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.26), dark, 0.88, 1.95, fz + 0.12));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), glowMat);
    bulb.position.set(0.88, 1.83, fz + 0.24);
    g.add(bulb);
    g.userData.light = new THREE.Vector3(0.88, 1.83, fz + 0.4);
    return g;
  },
  // ---- 방 가구 ----
  rug() {
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.03, 32), mat(P.sage, { flatShading: false }));
    a.scale.set(1, 1, 0.72); a.position.y = 0.015; a.receiveShadow = true;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.035, 32), mat(P.fabric, { flatShading: false }));
    b.scale.set(1, 1, 0.72); b.position.y = 0.02; b.receiveShadow = true;
    g.add(a, b);
    return g;
  },
  chair() {
    const g = new THREE.Group();
    const w = mat(P.wood), d = mat(P.woodDark);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.07, 0.5), w, 0, 0.46, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.55, 0.06), w, 0, 0.78, -0.22));
    g.add(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), mat(P.fabric2), 0, 0.51, 0.01)); // 방석
    [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => g.add(mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), d, x, 0.225, z)));
    return g;
  },
  bed() {
    const g = new THREE.Group();
    const w = mat(P.wood), d = mat(P.woodDark);
    g.add(mesh(new THREE.BoxGeometry(1.3, 0.3, 2.2), d, 0, 0.25, 0));           // 틀
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.2, 2.1), mat(P.fabric), 0, 0.48, 0)); // 매트리스
    g.add(mesh(new THREE.BoxGeometry(1.24, 0.08, 1.3), mat(P.fabric2), 0, 0.6, 0.4)); // 이불
    const pillow = mesh(new THREE.BoxGeometry(0.75, 0.14, 0.4), mat(0xfaf4ea), 0, 0.64, -0.75);
    g.add(pillow);
    g.add(mesh(new THREE.BoxGeometry(1.4, 1.0, 0.1), w, 0, 0.6, -1.12));  // 머리판
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.55, 0.1), w, 0, 0.38, 1.12)); // 발판
    return g;
  },
  shelf() {
    const g = new THREE.Group();
    const w = mat(P.wood);
    g.add(mesh(new THREE.BoxGeometry(1.3, 1.6, 0.06), mat(P.woodDark), 0, 0.8, -0.18));
    [-0.62, 0.62].forEach((x) => g.add(mesh(new THREE.BoxGeometry(0.06, 1.6, 0.42), w, x, 0.8, 0)));
    [0.04, 0.55, 1.05, 1.57].forEach((y) => g.add(mesh(new THREE.BoxGeometry(1.3, 0.06, 0.42), w, 0, y, 0)));
    // 책: 크기와 색을 조금씩 다르게
    const rnd = seeded(5);
    [0.07, 0.58].forEach((y, row) => {
      let x = -0.54;
      while (x < 0.45) {
        const bw = 0.07 + rnd() * 0.06, bh = 0.32 + rnd() * 0.1;
        g.add(mesh(new THREE.BoxGeometry(bw, bh, 0.28), mat(P.book[Math.floor(rnd() * 4)]), x + bw / 2, y + bh / 2, 0));
        x += bw + 0.015;
        if (row === 1 && x > 0.05) break; // 둘째 칸은 반만 채우고 작은 화분 자리
      }
    });
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.16, 8), mat(P.pot), 0.32, 0.66, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.13, 0), mat(P.leaf[1]), 0.32, 0.82, 0));
    return g;
  },
  potPlant() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 8), mat(P.pot), 0, 0.225, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 8), mat(P.pot), 0, 0.45, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.42, 0), mat(P.leaf[0]), 0, 0.85, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.28, 0), mat(P.leaf[1]), 0.22, 1.15, 0.05));
    g.add(mesh(new THREE.IcosahedronGeometry(0.25, 0), mat(P.leaf[2]), -0.18, 1.2, -0.08));
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
  { type: 'rug',       name: '둥근 러그', emoji: '⭕', radius: 0 , group: 'room' },
  { type: 'chair',     name: '나무 의자', emoji: '🪑', radius: 0.3 , group: 'room' },
  { type: 'bed',       name: '작은 침대', emoji: '🛏️', radius: 0.75 , group: 'room' },
  { type: 'shelf',     name: '책장',     emoji: '📚', radius: 0.5 , group: 'room' },
  { type: 'potPlant',  name: '화분',     emoji: '🪴', radius: 0.3 , group: 'room' },
  // 집: 섬마다 한 채. 가구 창에는 없고, 옮기기·돌리기만 돼요 (치우기 X)
  // colliders: 네모난 집에 맞춰 부딪히는 동그라미 여러 개 (집 가운데 기준 자리)
  { type: 'cottage',   name: '우리 집',  emoji: '🏠', radius: 5.2 , group: 'home', fixed: true,
    colliders: [-4.3, -2.6, -0.9, 0.9, 2.6, 4.3].flatMap((x) => [-3.05, -1.0, 1.0, 3.05].map((z) => ({ x, z, r: 1.2 }))), // 네모난 집을 동그라미로 채움
    door: { x: 0, z: HOUSE_D / 2 + 0.2 } },
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
  { id: 'room', name: '방 가구' },
];

export const ITEM_BY_TYPE = Object.fromEntries(ITEMS.map((i) => [i.type, i]));

export function buildItem(type) {
  const g = builders[type]();
  g.userData.type = type;
  return g;
}
