// 머리 큰 귀여운 아바타와 걷기·점프·인사 움직임
import * as THREE from 'three';
import { mat } from './catalog.js?v=0.7';
import { PALETTE as P } from './palette.js?v=0.7';
import { PLOT_RADIUS } from './world.js?v=0.7';

const SPEED = 4.2;     // 걷기 속도
const RUN_SPEED = 8.4; // 달리기 속도 (걷기의 2배)

// 캐릭터 설정 그림(docs/character-sheet.png)을 단순 도형으로 옮긴 아바타
// 비율: 키 약 2.0, 머리 약 1/6.5. 관절: 엉덩이·무릎·어깨·팔꿈치
export class Avatar {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // 점프·흔들림용
    this.root.add(this.body);
    scene.add(this.root);

    const M = (c, e = 0.25) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: e });
    const skin = M(P.skin), hair = M(P.hair, 0.18), top = M(P.shirt, 0.2), outfit = M(P.pants), shoe = M(P.shoes, 0.15), sock = M(0xffffff, 0.2);
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };

    // ---- 다리 (엉덩이 → 무릎 → 발) ----
    const HIP_Y = 0.86;
    const makeLeg = (sx) => {
      const hip = new THREE.Group(); hip.position.set(sx * 0.075, HIP_Y, 0);
      add(hip, new THREE.CylinderGeometry(0.085, 0.09, 0.2, 12), outfit, 0, -0.06, 0);       // 반바지 다리
      add(hip, new THREE.CylinderGeometry(0.095, 0.095, 0.04, 12), outfit, 0, -0.17, 0);     // 접힌 밑단
      add(hip, new THREE.CylinderGeometry(0.052, 0.045, 0.3, 10), skin, 0, -0.29, 0);        // 허벅지
      const knee = new THREE.Group(); knee.position.y = -0.43; hip.add(knee);
      add(knee, new THREE.CylinderGeometry(0.044, 0.036, 0.3, 10), skin, 0, -0.15, 0);       // 종아리
      add(knee, new THREE.CylinderGeometry(0.042, 0.04, 0.13, 10), sock, 0, -0.3, 0);        // 흰 양말
      const foot = add(knee, new THREE.CapsuleGeometry(0.045, 0.08, 4, 10), shoe, 0, -0.395, 0.03); // 구두
      foot.rotation.x = Math.PI / 2; foot.scale.set(1.05, 1, 0.75);
      add(knee, new THREE.BoxGeometry(0.1, 0.012, 0.025), shoe, 0, -0.355, 0.035);           // 메리제인 끈
      this.body.add(hip);
      return { hip, knee };
    };
    const L = makeLeg(-1), R = makeLeg(1);
    this.legL = L.hip; this.kneeL = L.knee; this.legR = R.hip; this.kneeR = R.knee;

    // ---- 몸통: 크림 블라우스 + 세이지 멜빵 반바지 ----
    add(this.body, new THREE.CylinderGeometry(0.135, 0.15, 0.18, 14), outfit, 0, 0.93, 0);   // 반바지 허리
    add(this.body, new THREE.CylinderGeometry(0.105, 0.13, 0.36, 14), top, 0, 1.19, 0);       // 블라우스
    const bib = add(this.body, new THREE.BoxGeometry(0.17, 0.17, 0.03), outfit, 0, 1.1, 0.112); bib.rotation.x = -0.06; // 앞판
    add(this.body, new THREE.BoxGeometry(0.06, 0.05, 0.008), M(P.pants, 0.1), 0, 1.11, 0.13); // 가슴 주머니
    [-1, 1].forEach((sx) => {
      const strap = add(this.body, new THREE.BoxGeometry(0.03, 0.3, 0.02), outfit, sx * 0.06, 1.24, 0.1); strap.rotation.x = -0.25;
      const back = add(this.body, new THREE.BoxGeometry(0.03, 0.3, 0.02), outfit, sx * 0.04, 1.2, -0.11); back.rotation.z = sx * 0.35; // 뒤 X자 끈
      add(this.body, new THREE.SphereGeometry(0.012, 6, 6), M(0xd9c39a, 0.2), sx * 0.06, 1.18, 0.13); // 단추
    });
    const collar = add(this.body, new THREE.CylinderGeometry(0.085, 0.1, 0.03, 16), top, 0, 1.38, 0.01); // 둥근 카라
    collar.scale.z = 0.9;
    add(this.body, new THREE.CylinderGeometry(0.035, 0.04, 0.08, 8), skin, 0, 1.42, 0);       // 목

    // ---- 팔 (어깨 → 팔꿈치), 어깨엔 퍼프 소매 ----
    const makeArm = (sx) => {
      const sh = new THREE.Group(); sh.position.set(sx * 0.14, 1.33, 0);
      const puff = add(sh, new THREE.SphereGeometry(0.065, 12, 10), top, 0, -0.03, 0); puff.scale.set(1, 1.1, 1);
      add(sh, new THREE.CylinderGeometry(0.03, 0.028, 0.22, 8), skin, 0, -0.15, 0);           // 윗팔
      const el = new THREE.Group(); el.position.y = -0.26; sh.add(el);
      add(el, new THREE.CylinderGeometry(0.027, 0.024, 0.2, 8), skin, 0, -0.1, 0);            // 아랫팔
      const hand = add(el, new THREE.SphereGeometry(0.033, 8, 8), skin, 0, -0.22, 0); hand.scale.set(0.8, 1.2, 0.6);
      sh.rotation.z = sx * 0.07;
      this.body.add(sh);
      return { sh, el };
    };
    const AL = makeArm(-1), AR = makeArm(1);
    this.armL = AL.sh; this.elbowL = AL.el; this.armR = AR.sh; this.elbowR = AR.el;

    // ---- 머리: 얼굴 + 볼륨 단발(안으로 말린 끝) ----
    this.head = new THREE.Group();
    this.head.position.set(0, 1.65, 0);
    this.head.scale.setScalar(1.15); // 설정 그림처럼 머리를 조금 크게
    this.body.add(this.head);
    const face = add(this.head, new THREE.SphereGeometry(0.165, 22, 18), M(P.skin, 0.38));
    face.scale.set(1, 1.04, 0.96);
    const cap = add(this.head, new THREE.SphereGeometry(0.185, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.02, -0.015);
    cap.rotation.x = -0.3;
    add(this.head, new THREE.SphereGeometry(0.19, 18, 14), hair, 0, -0.03, -0.06).scale.set(1.05, 1, 0.85); // 뒷머리 볼륨
    // 옆머리: 길게 내려오다 끝이 안으로 말림
    [-1, 1].forEach((sx) => {
      const side = add(this.head, new THREE.CapsuleGeometry(0.075, 0.14, 4, 10), hair, sx * 0.15, -0.09, -0.01);
      side.rotation.z = sx * 0.18;
      const curl = add(this.head, new THREE.SphereGeometry(0.085, 12, 10), hair, sx * 0.13, -0.2, 0.01);
      curl.scale.set(1.1, 0.75, 1);
      const front = add(this.head, new THREE.CapsuleGeometry(0.05, 0.1, 4, 8), hair, sx * 0.135, -0.07, 0.08);
      front.rotation.z = sx * 0.12;
    });
    // 옆으로 넘긴 앞머리
    const bang = add(this.head, new THREE.SphereGeometry(0.172, 18, 8, -Math.PI * 0.5, Math.PI, 0, Math.PI * 0.3), hair, 0, 0.03, 0.02);
    bang.rotation.z = -0.15;
    const sweep = add(this.head, new THREE.CapsuleGeometry(0.045, 0.14, 4, 8), hair, 0.05, 0.09, 0.13);
    sweep.rotation.set(0.3, 0, 1.2);

    // 큰 갈색 눈 + 하이라이트 두 개, 볼터치, 작은 입
    const B = (c) => new THREE.MeshBasicMaterial({ color: c });
    [-1, 1].forEach((sx) => {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 12), B(0xfffaf5));
      white.scale.set(0.95, 1.15, 0.35); white.position.set(sx * 0.064, -0.02, 0.152); this.head.add(white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 12), B(0x6b4532));
      iris.scale.set(0.95, 1.15, 0.35); iris.position.set(sx * 0.064, -0.025, 0.158); this.head.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), B(0x2e1f18));
      pupil.scale.set(1, 1.2, 0.3); pupil.position.set(sx * 0.064, -0.027, 0.166); this.head.add(pupil);
      const h1 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), B(0xffffff)); h1.position.set(sx * 0.064 + 0.01, -0.012, 0.17); this.head.add(h1);
      const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), B(0xffffff)); h2.position.set(sx * 0.064 - 0.008, -0.038, 0.17); this.head.add(h2);
      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.01), B(0x4a3226));
      lash.position.set(sx * 0.064, 0.016, 0.16); lash.rotation.z = sx * -0.15; this.head.add(lash);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.01), B(0x8a6450));
      brow.position.set(sx * 0.064, 0.05, 0.158); brow.rotation.z = sx * -0.1; this.head.add(brow);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.026, 12), new THREE.MeshBasicMaterial({ color: P.cheek, transparent: true, opacity: 0.55 }));
      cheek.position.set(sx * 0.1, -0.068, 0.137); cheek.rotation.y = sx * 0.6; this.head.add(cheek);
    });
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 4, 10, Math.PI), B(0xc9776e));
    mouth.rotation.z = Math.PI; mouth.position.set(0, -0.085, 0.158); this.head.add(mouth);

    this.root.position.set(0, 0, 3);
    this.facing = 0; // 처음에는 카메라 쪽을 봄
    this.root.rotation.y = this.facing;
    this.target = null;
    this.vy = 0;
    this.y = 0;
    this.walkT = 0;
    this.running = false; // 달리는 중인지
    this.waveT = 0;
    this.moving = false;
  }

  get position() { return this.root.position; }

  moveTo(x, z) { this.target = new THREE.Vector2(x, z); }
  jump() { if (this.y <= 0.001) this.vy = 5.2; }
  wave() { this.waveT = 1.6; }

  update(dt, input, cameraYaw, colliders) {
    const p = this.root.position;
    let dx = 0, dz = 0;

    // 키보드 이동 (카메라가 보는 방향 기준)
    if (input.x || input.y) {
      this.target = null;
      const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
      const rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw);
      dx = fx * input.y + rx * input.x;
      dz = fz * input.y + rz * input.x;
      const len = Math.hypot(dx, dz);
      dx /= len; dz /= len;
    } else if (this.target) {
      dx = this.target.x - p.x;
      dz = this.target.y - p.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.08) { this.target = null; dx = dz = 0; }
      else { const k = Math.min(1, len / ((this.running ? RUN_SPEED : SPEED) * dt)); dx = (dx / len) * k; dz = (dz / len) * k; }
    }

    this.moving = dx !== 0 || dz !== 0;
    if (!this.moving) this.running = false; // 멈추면 다시 걷기로
    if (this.moving) {
      const sp = this.running ? RUN_SPEED : SPEED;
      p.x += dx * sp * dt;
      p.z += dz * sp * dt;
      const want = Math.atan2(dx, dz);
      let diff = want - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 12);
      this.root.rotation.y = this.facing;
    }

    // 물건에 부딪히면 밀려나기
    const me = 0.25;
    for (const c of colliders) {
      const ox = p.x - c.x, oz = p.z - c.z;
      const d = Math.hypot(ox, oz), min = c.r + me;
      if (d < min && d > 0.0001) {
        p.x = c.x + (ox / d) * min;
        p.z = c.z + (oz / d) * min;
        if (this.target && Math.hypot(this.target.x - c.x, this.target.y - c.z) < min) this.target = null;
      }
    }
    const lim = PLOT_RADIUS - 0.4, dc = Math.hypot(p.x, p.z);
    if (dc > lim) { p.x *= lim / dc; p.z *= lim / dc; }

    // 점프
    this.vy -= 16 * dt;
    const wasAir = this.y > 0;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    if (wasAir && this.y === 0 && this.onStep) { this.onStep(); setTimeout(() => this.onStep && this.onStep(), 60); }

    // ---- 걷기 / 달리기 동작 ----
    // 걷기: 곧은 자세, 다리를 작게 흔들고 팔은 자연스럽게 앞뒤로
    // 달리기: 몸을 앞으로 숙이고, 무릎을 크게 접고, 팔꿈치를 굽혀 힘차게 흔들며 통통 튐
    const walking = this.moving && this.y === 0;
    const run = walking && this.running;
    const prevStep = Math.floor(this.walkT / Math.PI);
    this.walkT += dt * (walking ? (run ? 13 : 8.5) : 0);
    if (walking && Math.floor(this.walkT / Math.PI) !== prevStep && this.onStep) this.onStep(); // 발이 닿을 때마다 발소리
    const ph = this.walkT;
    const s1 = Math.sin(ph), k = 0.3;
    const legAmp = run ? 0.85 : 0.42;
    this.legL.rotation.x = lerp(this.legL.rotation.x, walking ? s1 * legAmp : 0, k);
    this.legR.rotation.x = lerp(this.legR.rotation.x, walking ? -s1 * legAmp : 0, k);
    // 무릎: 다리가 뒤로 갈 때 접힘 (달리기는 크게)
    const kneeAmp = run ? 1.15 : 0.35;
    this.kneeL.rotation.x = lerp(this.kneeL.rotation.x, walking ? Math.max(0, -Math.sin(ph - 0.6)) * kneeAmp : 0, k);
    this.kneeR.rotation.x = lerp(this.kneeR.rotation.x, walking ? Math.max(0, Math.sin(ph - 0.6)) * kneeAmp : 0, k);
    const armAmp = run ? 0.9 : 0.35;
    this.armL.rotation.x = lerp(this.armL.rotation.x, walking ? -s1 * armAmp : 0, k);
    this.elbowL.rotation.x = lerp(this.elbowL.rotation.x, run ? -1.3 : (walking ? -0.15 : -0.05), 0.2);
    this.body.rotation.x = lerp(this.body.rotation.x, run ? 0.15 : 0, 0.15);
    const bob = walking ? Math.abs(s1) * (run ? 0.09 : 0.025) : Math.sin(performance.now() / 600) * 0.008;
    this.body.position.y = this.y + bob;
    this.head.rotation.z = walking ? s1 * (run ? 0.03 : 0.04) : 0;
    this.head.rotation.x = lerp(this.head.rotation.x, run ? -0.12 : 0, 0.15); // 달릴 때 고개는 앞을 봄

    // 인사
    if (this.waveT > 0) {
      this.waveT -= dt;
      this.armR.rotation.x = lerp(this.armR.rotation.x, 0, 0.3);
      this.armR.rotation.z = lerp(this.armR.rotation.z, 2.6 + Math.sin(this.waveT * 14) * 0.3, 0.3);
      this.elbowR.rotation.x = lerp(this.elbowR.rotation.x, 0, 0.3);
    } else {
      this.armR.rotation.x = lerp(this.armR.rotation.x, walking ? s1 * armAmp : 0, k);
      this.armR.rotation.z = lerp(this.armR.rotation.z, 0.07, 0.2);
      this.elbowR.rotation.x = lerp(this.elbowR.rotation.x, run ? -1.3 : (walking ? -0.15 : -0.05), 0.2);
    }
  }

  serialize() {
    return { x: this.root.position.x, z: this.root.position.z, facing: this.facing };
  }
  restore(s) {
    if (!s) return;
    this.root.position.set(s.x || 0, 0, s.z || 0);
    this.facing = s.facing || 0;
    this.root.rotation.y = this.facing;
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }
