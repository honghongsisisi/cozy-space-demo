// 머리 큰 귀여운 아바타와 걷기·점프·인사 움직임
import * as THREE from 'three';
import { mat } from './catalog.js?v=0.6';
import { PALETTE as P } from './palette.js?v=0.6';
import { PLOT_RADIUS } from './world.js?v=0.6';

const SPEED = 4.2;     // 걷기 속도
const RUN_SPEED = 10;  // 달리기 속도 (걷기의 약 2.4배)

export class Avatar {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // 점프·흔들림용
    this.root.add(this.body);
    scene.add(this.root);

    const m = (geo, material, x, y, z) => {
      const o = new THREE.Mesh(geo, material);
      o.position.set(x, y, z);
      o.castShadow = true;
      return o;
    };
    // 살짝 스스로 빛나게 해서 그늘에서도 얼굴이 어둡지 않게
    const smooth = (c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.28 });

    // 비율: 키 약 2.1, 머리 지름 0.6 (머리 크고 팔다리는 가늘고 긴 편)
    // 다리
    this.legL = new THREE.Group(); this.legL.position.set(-0.09, 0.9, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.09, 0.9, 0);
    [this.legL, this.legR].forEach((leg) => {
      leg.add(m(new THREE.CylinderGeometry(0.055, 0.045, 0.82, 8), smooth(P.pants), 0, -0.41, 0));
      leg.add(m(new THREE.CapsuleGeometry(0.05, 0.1, 3, 8), smooth(P.shoes), 0, -0.86, 0.04));
      leg.children[1].rotation.x = Math.PI / 2;
      this.body.add(leg);
    });
    // 몸통 (허리는 가늘게, 어깨는 조금 넓게)
    this.body.add(m(new THREE.CylinderGeometry(0.17, 0.13, 0.5, 10), smooth(P.shirt), 0, 1.16, 0));
    this.body.add(m(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 10), smooth(P.pants), 0, 0.9, 0));
    this.body.add(m(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 6), smooth(P.skin), 0, 1.45, 0));
    // 팔
    this.armL = new THREE.Group(); this.armL.position.set(-0.21, 1.37, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.21, 1.37, 0);
    [this.armL, this.armR].forEach((arm, i) => {
      arm.add(m(new THREE.CapsuleGeometry(0.04, 0.52, 3, 8), smooth(P.skin), 0, -0.3, 0));
      arm.add(m(new THREE.CapsuleGeometry(0.058, 0.12, 3, 8), smooth(P.shirt), 0, -0.06, 0));
      arm.rotation.z = i === 0 ? -0.08 : 0.08;
      this.body.add(arm);
    });
    // 머리
    this.head = new THREE.Group();
    this.head.position.set(0, 1.78, 0);
    this.body.add(this.head);
    const face = m(new THREE.SphereGeometry(0.3, 20, 16), smooth(P.skin), 0, 0, 0);
    face.scale.set(1, 1.05, 0.95);
    this.head.add(face);
    // 머리카락: 윗머리 + 옆머리 + 앞머리
    const hairM = smooth(P.hair);
    const cap = m(new THREE.SphereGeometry(0.325, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hairM, 0, 0.03, -0.02);
    cap.rotation.x = -0.35;
    this.head.add(cap);
    [-1, 1].forEach((sd) => {
      const side = m(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8), hairM, sd * 0.25, -0.12, -0.05);
      side.rotation.z = sd * 0.12;
      this.head.add(side);
    });
    const bang = m(new THREE.SphereGeometry(0.31, 16, 8, -Math.PI * 0.45, Math.PI * 0.9, 0, Math.PI * 0.32), hairM, 0, 0.05, 0.02);
    this.head.add(bang);
    // 큰 눈: 진한 타원 + 하얀 반짝이
    const eyeM = new THREE.MeshBasicMaterial({ color: P.eye });
    const shineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-1, 1].forEach((sd) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), eyeM);
      eye.scale.set(0.85, 1.15, 0.4);
      eye.position.set(sd * 0.11, -0.04, 0.27);
      this.head.add(eye);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), shineM);
      shine.position.set(sd * 0.11 + 0.02, -0.01, 0.295);
      this.head.add(shine);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), new THREE.MeshBasicMaterial({ color: P.cheek, transparent: true, opacity: 0.6 }));
      cheek.position.set(sd * 0.17, -0.13, 0.245);
      cheek.rotation.y = sd * 0.5;
      this.head.add(cheek);
    });
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: 0xd98a80 }));
    mouth.scale.set(1.4, 0.6, 0.5);
    mouth.position.set(0, -0.17, 0.27);
    this.head.add(mouth);

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

    // 걷는 모양
    const walking = this.moving && this.y === 0;
    const prevStep = Math.floor(this.walkT / Math.PI);
    const run = walking && this.running;
    this.walkT += dt * (walking ? (run ? 17 : 9) : 0); // 달리면 발걸음(=발소리)도 빨라짐
    // 발이 땅에 닿는 순간마다 발소리
    if (walking && Math.floor(this.walkT / Math.PI) !== prevStep && this.onStep) this.onStep();
    const swing = walking ? Math.sin(this.walkT) * (run ? 1.15 : 0.5) : 0;
    this.legL.rotation.x = lerp(this.legL.rotation.x, swing, 0.3);
    this.legR.rotation.x = lerp(this.legR.rotation.x, -swing, 0.3);
    this.armL.rotation.x = lerp(this.armL.rotation.x, -swing * (run ? 1.3 : 0.8), 0.35);
    // 달릴 때: 팔꿈치를 굽힌 듯 팔을 앞으로 모으고, 몸을 살짝 앞으로 숙임
    this.armL.rotation.z = lerp(this.armL.rotation.z, run ? -0.25 : -0.08, 0.2);
    this.body.rotation.x = lerp(this.body.rotation.x, run ? 0.28 : 0, 0.15);
    const bob = walking ? Math.abs(Math.sin(this.walkT)) * (run ? 0.18 : 0.06) : Math.sin(performance.now() / 600) * 0.012;
    this.body.position.y = this.y + bob;
    this.head.rotation.z = walking ? Math.sin(this.walkT) * 0.05 : 0;

    // 인사
    if (this.waveT > 0) {
      this.waveT -= dt;
      this.armR.rotation.x = lerp(this.armR.rotation.x, 0, 0.3);
      this.armR.rotation.z = lerp(this.armR.rotation.z, 2.7 + Math.sin(this.waveT * 14) * 0.3, 0.3);
    } else {
      this.armR.rotation.x = lerp(this.armR.rotation.x, swing * (run ? 1.3 : 0.8), 0.35);
      this.armR.rotation.z = lerp(this.armR.rotation.z, run ? 0.25 : 0.08, 0.2);
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
