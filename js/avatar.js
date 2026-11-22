// 머리 큰 귀여운 아바타와 걷기·점프·인사 움직임
import * as THREE from 'three';
import { mat } from './catalog.js?v=0.49';
import { PALETTE as P } from './palette.js?v=0.49';
import { PLOT_RADIUS } from './world.js?v=0.49';

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
    const skin = M(P.skin, 0.36), hair = M(P.hair, 0.18), top = M(P.shirt, 0.2), outfit = M(P.pants), shoe = M(P.shoes, 0.15), sock = M(0xffffff, 0.2);
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

    // ---- 머리: 얼굴 + 볼륨 단발(물결 + 안으로 말린 끝) ----
    this.head = new THREE.Group();
    this.head.position.set(0, 1.65, 0);
    this.head.scale.setScalar(1.15); // 설정 그림처럼 머리를 조금 크게
    this.body.add(this.head);
    // 얼굴은 조금 더 스스로 밝게: 그늘에서도 피부가 회색빛으로 탁해지지 않게
    const face = add(this.head, new THREE.SphereGeometry(0.165, 28, 22), M(0xffe9dd, 0.5));
    face.scale.set(1, 1.04, 0.96);
    // 정수리: 매끈한 반구 + 위쪽 볼륨
    const cap = add(this.head, new THREE.SphereGeometry(0.187, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, 0, 0.02, -0.015);
    cap.rotation.x = -0.3;
    add(this.head, new THREE.SphereGeometry(0.19, 24, 18), hair, 0, -0.03, -0.06).scale.set(1.06, 1, 0.86); // 뒷머리 볼륨
    add(this.head, new THREE.SphereGeometry(0.12, 18, 12), hair, 0, 0.11, -0.05).scale.set(1.2, 0.55, 1.1);  // 정수리 볼륨
    // 물결 머리 다발: 뒤·옆으로 빙 둘러 내려오며 끝이 안으로 말림 (단발 웨이브)
    const lock = new THREE.CapsuleGeometry(0.046, 0.12, 6, 12);
    const curlGeo = new THREE.SphereGeometry(0.056, 14, 10);
    for (let i = 0; i < 7; i++) {
      const ang = Math.PI * (0.12 + (i / 6) * 0.76) + Math.PI; // 앞쪽(얼굴)은 비우고 옆·뒤로 반 바퀴
      const x = Math.cos(ang) * 0.16, z = Math.sin(ang) * 0.12 - 0.035;
      const wave = (i % 2) * 0.016;
      const l = add(this.head, lock, hair, x, -0.1 - wave, z);
      l.rotation.set(-z * 1.0, 0, x * 1.1);
      const c = add(this.head, curlGeo, hair, x * 0.88, -0.19 - wave, z * 0.88 + 0.01);
      c.scale.set(1.05, 0.7, 1.05);
    }
    // 얼굴 옆으로 내려오는 앞쪽 다발 + 안으로 말린 끝
    [-1, 1].forEach((sx) => {
      const front = add(this.head, new THREE.CapsuleGeometry(0.04, 0.12, 6, 10), hair, sx * 0.158, -0.08, 0.05);
      front.rotation.z = sx * 0.12;
      const fc = add(this.head, new THREE.SphereGeometry(0.048, 14, 10), hair, sx * 0.142, -0.18, 0.05);
      fc.scale.set(1, 0.7, 0.95);
    });
    // 옆으로 넘긴 앞머리 (두 갈래로 나뉜 물결)
    const bang = add(this.head, new THREE.SphereGeometry(0.173, 24, 10, -Math.PI * 0.5, Math.PI, 0, Math.PI * 0.3), hair, 0, 0.03, 0.02);
    bang.rotation.z = -0.15;
    const sweep = add(this.head, new THREE.CapsuleGeometry(0.048, 0.15, 6, 10), hair, 0.05, 0.09, 0.132);
    sweep.rotation.set(0.3, 0, 1.2);
    const sweep2 = add(this.head, new THREE.CapsuleGeometry(0.04, 0.1, 6, 10), hair, -0.075, 0.075, 0.13);
    sweep2.rotation.set(0.35, 0, -0.9);

    // 큰 갈색 눈 + 하이라이트 두 개 (눈 깜빡일 수 있게 한 묶음으로), 볼터치, 작은 입
    const B = (c) => new THREE.MeshBasicMaterial({ color: c });
    this.eyes = [];
    [-1, 1].forEach((sx) => {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.064, -0.022, 0);
      this.head.add(eye);
      this.eyes.push(eye);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 12), B(0xfffaf5));
      white.scale.set(0.95, 1.15, 0.35); white.position.set(0, 0.002, 0.152); eye.add(white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), B(0x6b4532));
      iris.scale.set(0.95, 1.15, 0.35); iris.position.set(0, -0.003, 0.158); eye.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), B(0x2e1f18));
      pupil.scale.set(1, 1.2, 0.3); pupil.position.set(0, -0.005, 0.166); eye.add(pupil);
      const h1 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), B(0xffffff)); h1.position.set(0.01, 0.01, 0.17); eye.add(h1);
      const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), B(0xffffff)); h2.position.set(-0.008, -0.016, 0.17); eye.add(h2);
      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.01), B(0x4a3226));
      lash.position.set(sx * 0.064, 0.016, 0.16); lash.rotation.z = sx * -0.15; this.head.add(lash);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.01), B(0x8a6450));
      brow.position.set(sx * 0.064, 0.05, 0.158); brow.rotation.z = sx * -0.1; this.head.add(brow);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.027, 16), new THREE.MeshBasicMaterial({ color: P.cheek, transparent: true, opacity: 0.5 }));
      cheek.position.set(sx * 0.1, -0.068, 0.137); cheek.rotation.y = sx * 0.6; this.head.add(cheek);
    });
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 4, 12, Math.PI), B(0xc9776e));
    mouth.rotation.z = Math.PI; mouth.position.set(0, -0.085, 0.158); this.head.add(mouth);
    this.blinkT = 2 + Math.random() * 2; // 다음 눈 깜빡임까지 남은 시간

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
    this.pose = null;   // 가구 사용 중인 자세 (v0.49) { kind, x, z, facing, h, exit }
    this.unpose = null; // 자세를 풀고 일어나는 중 (0.3초) { fx, fz, tx, tz, t }
    this.lift = 0;      // 일어날 때 몸 높이가 툭 튀지 않게 천천히 줄어드는 높이

    // 책 읽기용 작은 책 (평소엔 숨김)
    const book = new THREE.Group();
    const cover = new THREE.MeshLambertMaterial({ color: P.book[1] });
    const paper = new THREE.MeshLambertMaterial({ color: 0xfaf4ea, emissive: 0xfaf4ea, emissiveIntensity: 0.15 });
    [-1, 1].forEach((sx) => {
      const half = new THREE.Group(); half.rotation.y = sx * -0.35; book.add(half);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.012), cover); c.position.set(sx * 0.065, 0, 0); half.add(c);
      const pg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, 0.014), paper); pg.position.set(sx * 0.062, 0, 0.012); half.add(pg);
    });
    book.position.set(0, 1.1, 0.3); book.rotation.x = -0.75;
    book.visible = false;
    this.body.add(book);
    this.book = book;

    // 이불 덮고 자기용 이불 (침대 이불과 같은 색, 평소엔 숨김)
    const quilt = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.36, 1.42), new THREE.MeshLambertMaterial({ color: P.fabric2 }));
    quilt.castShadow = true; quilt.visible = false;
    this.root.add(quilt);
    this.quilt = quilt;

    // 졸 때 머리 위로 천천히 떠오르는 작은 z 글자 3개
    const zc = document.createElement('canvas'); zc.width = zc.height = 64;
    const zx = zc.getContext('2d');
    zx.fillStyle = '#8b6a56'; zx.font = 'bold 46px sans-serif'; zx.textAlign = 'center'; zx.textBaseline = 'middle';
    zx.fillText('z', 32, 34);
    const zTex = new THREE.CanvasTexture(zc);
    this.zz = [0, 1, 2].map(() => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, opacity: 0, depthWrite: false }));
      sp.visible = false;
      this.root.add(sp);
      return sp;
    });
  }

  // ---- 가구 사용하기 (v0.49) ----
  // kind: sit(앉기) · doze(졸기) · lie(눕기) · sleep(이불 덮고 자기) · read(책 읽기) · look(창밖 보기)
  // x, z, facing: 자세를 잡을 자리와 방향 / h: 앉는 자리·눕는 자리 높이 / exit: 일어나서 설 자리
  setPose(p) {
    const far = Math.hypot(this.root.position.x - p.x, this.root.position.z - p.z) > 2.5;
    this.pose = { ...p, fx: this.root.position.x, fz: this.root.position.z, ff: this.facing, t: far ? 1 : 0 };
    this.unpose = null;
    this.target = null; this.running = false; this.waveT = 0;
  }
  // 일어나기: 설 자리(exit)로 0.3초 동안 부드럽게 옮겨 가요. quick이면 바로
  clearPose(quick) {
    const p = this.pose;
    if (!p) return;
    this.pose = null;
    this.book.visible = false; this.quilt.visible = false;
    this.zz.forEach((z) => { z.visible = false; });
    this.lift = quick ? 0 : this.body.position.y - this.y;
    const ex = p.exit || { x: this.root.position.x, z: this.root.position.z };
    if (quick) { this.root.position.set(ex.x, 0, ex.z); return; }
    this.unpose = { fx: this.root.position.x, fz: this.root.position.z, tx: ex.x, tz: ex.z, t: 0 };
  }
  get busy() { return !!this.unpose; } // 일어나는 중에는 잠깐 기다림

  stepPose(dt) {
    const p = this.pose, sm = (rate) => 1 - Math.exp(-dt * rate);
    const t = performance.now() / 1000;
    // 자리로 옮겨 앉기 (0.35초)
    p.t = Math.min(1, p.t + dt / 0.35);
    const e = p.t * p.t * (3 - 2 * p.t);
    this.root.position.x = lerp(p.fx, p.x, e);
    this.root.position.z = lerp(p.fz, p.z, e);
    let diff = p.facing - p.ff; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing = p.ff + diff * e;
    this.root.rotation.y = this.facing;
    this.moving = false; this.y = 0; this.vy = 0; this.walkBlend = 0; this.runBlend = 0;

    const k = sm(7);
    const set = (o, prop, v, kk = k) => { o.rotation[prop] = lerp(o.rotation[prop], v, kk); };
    const sit = p.kind === 'sit' || p.kind === 'doze';
    const lie = p.kind === 'lie' || p.kind === 'sleep';
    const sleepy = p.kind === 'doze' || p.kind === 'sleep';
    const breath = Math.sin(t * (sleepy ? 1.2 : 1.9)) * (sleepy ? 0.012 : 0.007);
    // 몸 높이·기울기
    let by = breath, bx = 0;
    if (sit) { by = p.h + 0.07 - 0.86 + breath; bx = p.kind === 'doze' ? 0.12 : 0.04; }
    if (lie) { by = p.h + 0.15 + breath * 0.6; bx = -Math.PI / 2; }
    if (p.kind === 'read') bx = 0.04;
    if (p.kind === 'look') bx = 0.07;
    this.body.position.y = lerp(this.body.position.y, by, sm(8));
    set(this.body, 'x', bx, sm(6));
    set(this.body, 'y', 0); set(this.body, 'z', 0);
    // 다리
    const hip = sit ? -1.5 : 0, knee = sit ? 1.45 : 0;
    const swing = sit && p.kind === 'sit' ? Math.sin(t * 1.3) * 0.08 : 0; // 앉아서 발을 살랑살랑
    set(this.legL, 'x', hip + swing); set(this.legR, 'x', hip - swing);
    set(this.kneeL, 'x', knee + swing); set(this.kneeR, 'x', knee - swing);
    // 팔
    let ax = 0, az = 0.07, el = -0.05;
    if (sit) { ax = -0.45; az = 0.12; el = -0.75; }                  // 손은 무릎 위에
    if (lie) { ax = 0.05; az = 0.16; el = -0.15; }                   // 눕기: 팔은 몸 옆에 편하게
    if (p.kind === 'read') { ax = -0.95; az = 0.32; el = -1.05; }    // 두 손으로 책
    if (p.kind === 'look') { ax = -0.3; az = 0.18; el = -0.55; }     // 창틀에 손을 살짝
    set(this.armL, 'x', ax); set(this.armR, 'x', ax);
    set(this.armL, 'z', az); set(this.armR, 'z', -az);
    set(this.elbowL, 'x', el); set(this.elbowR, 'x', el);
    // 머리
    let hx = 0, hy = 0, hz = 0;
    if (p.kind === 'sit') { hy = Math.sin(t * 0.37) * 0.15; hz = Math.sin(t * 0.6) * 0.04; }
    if (p.kind === 'doze') { hx = 0.32 + Math.max(0, Math.sin(t * 0.8)) * 0.18; hz = 0.12; } // 꾸벅꾸벅
    if (p.kind === 'lie') { hy = Math.sin(t * 0.3) * 0.25; }
    if (p.kind === 'sleep') { hy = 0.35; }
    if (p.kind === 'read') { hx = 0.38 + Math.sin(t * 0.5) * 0.03; hy = Math.sin(t * 0.9) * 0.08; } // 줄을 따라 읽는 듯
    if (p.kind === 'look') { hx = -0.05; hy = Math.sin(t * 0.25) * 0.3; hz = Math.sin(t * 0.4) * 0.04; }
    set(this.head, 'x', hx, sm(4)); set(this.head, 'y', hy, sm(3)); set(this.head, 'z', hz, sm(4));
    // 눈: 졸고 자는 동안은 감고, 아니면 깜빡임
    if (sleepy) this.eyes.forEach((ey) => { ey.scale.y = lerp(ey.scale.y, 0.1, sm(5)); });
    else this.blink(dt);
    // 책 · 이불
    this.book.visible = p.kind === 'read' && p.t > 0.6;
    this.quilt.visible = p.kind === 'sleep' && p.t > 0.8;
    if (this.quilt.visible) this.quilt.position.set(0, p.h + 0.14, -0.5); // 매트리스 위부터 몸을 폭 덮는 높이
    // z z z
    const zOn = sleepy && p.t >= 1;
    if (zOn) {
      const hp = this.root.worldToLocal(this.head.getWorldPosition(new THREE.Vector3()));
      this.zz.forEach((z, i) => {
        const q = ((t / 3.2) + i / 3) % 1;
        z.visible = true;
        z.position.set(hp.x + 0.15 + q * 0.18, hp.y + 0.25 + q * 0.55, hp.z + (lie ? 0.15 : 0));
        z.scale.setScalar(0.12 + q * 0.1);
        z.material.opacity = Math.sin(q * Math.PI) * 0.75;
      });
    } else this.zz.forEach((z) => { z.visible = false; });
  }

  blink(dt) {
    this.blinkT -= dt;
    let open = 1;
    if (this.blinkT < 0) {
      const p = -this.blinkT / 0.14;
      open = p >= 1 ? 1 : Math.abs(1 - p * 2) * 0.9 + 0.1;
      if (p >= 1) this.blinkT = 2 + Math.random() * 3 + (Math.random() < 0.2 ? -1.7 : 0); // 가끔 두 번 연달아
    }
    this.eyes.forEach((e) => { e.scale.y = open; });
  }

  get position() { return this.root.position; }

  // 유령 모습 (가입하지 않은 손님, v0.41): 사람 몸은 숨기고, 둥근 천을 쓴 작은 유령이 둥둥 떠다녀요.
  // 반짝이거나 빛나지 않게, 크림색에 살짝 비치는 정도로만.
  setGhost(on) {
    this.isGhost = !!on;
    if (on && !this.ghost) {
      const g = new THREE.Group();
      const cloth = new THREE.MeshLambertMaterial({ color: 0xf6efe4, emissive: 0xf6efe4, emissiveIntensity: 0.35, transparent: true, opacity: 0.82, depthWrite: false });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), cloth);
      head.position.y = 1.25;
      // 아래로 살짝 넓어지는 천 + 물결 치는 끝자락
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.62, 28, 1, true), cloth);
      skirt.position.y = 0.94;
      g.add(head, skirt);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const w = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), cloth);
        w.scale.set(1, 0.75, 1);
        w.position.set(Math.sin(a) * 0.44, 0.64, Math.cos(a) * 0.44);
        g.add(w);
      }
      const eyeM = new THREE.MeshBasicMaterial({ color: 0x5a4636 });
      [-1, 1].forEach((sx) => {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), eyeM);
        e.scale.set(0.85, 1.15, 0.5);
        e.position.set(sx * 0.13, 1.33, 0.385);
        g.add(e);
        const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshBasicMaterial({ color: P.cheek, transparent: true, opacity: 0.45 }));
        cheek.position.set(sx * 0.22, 1.24, 0.36); cheek.rotation.y = sx * 0.55;
        g.add(cheek);
      });
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 12, Math.PI), eyeM);
      mouth.rotation.z = Math.PI; mouth.position.set(0, 1.22, 0.405);
      g.add(mouth);
      this.ghost = g;
      this.root.add(g);
    }
    if (this.ghost) this.ghost.visible = !!on;
    this.body.visible = !on;
  }

  moveTo(x, z) { this.target = new THREE.Vector2(x, z); }
  jump() { if (this.y <= 0.001) this.vy = 5.2; }
  wave() { this.waveT = 1.6; }

  update(dt, input, cameraYaw, colliders) {
    this.step(dt, input, cameraYaw, colliders);
    this.updateGhost(dt);
  }

  step(dt, input, cameraYaw, colliders) {
    if (this.pose) { this.stepPose(dt); return; }
    const p = this.root.position;
    let dx = 0, dz = 0;
    // 일어나는 중: 설 자리로 부드럽게 옮겨 가요 (이 동안은 부딪힘·이동 없이)
    if (this.unpose) {
      const u = this.unpose;
      u.t = Math.min(1, u.t + dt / 0.3);
      const e = u.t * u.t * (3 - 2 * u.t);
      p.x = lerp(u.fx, u.tx, e); p.z = lerp(u.fz, u.tz, e);
      if (u.t >= 1) this.unpose = null;
      input = { x: 0, y: 0 }; colliders = [];
    }

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
    // 속도도 갑자기 바뀌지 않고 0.2초쯤에 걸쳐 붙었다 줄어듦
    const wantSp = !this.moving ? SPEED * 0.4 : this.running ? RUN_SPEED : SPEED;
    this.curSpeed = lerp(this.curSpeed || SPEED * 0.5, wantSp, 1 - Math.exp(-dt * 9));
    if (this.moving) {
      const sp = this.curSpeed;
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
    if (this.bounds) { const c = this.bounds(p.x, p.z); p.x = c.x; p.z = c.z; } // 집 안에서는 벽 안쪽까지만
    else {
      const lim = PLOT_RADIUS - 0.4, dc = Math.hypot(p.x, p.z);
      if (dc > lim) { p.x *= lim / dc; p.z *= lim / dc; }
    }

    // 점프
    this.vy -= 16 * dt;
    const wasAir = this.y > 0;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    if (wasAir && this.y === 0 && this.onStep) { this.onStep(); setTimeout(() => this.onStep && this.onStep(), 60); }

    // ---- 걷기 / 달리기 동작 ----
    // 걷기: 곧은 자세, 다리를 작게 흔들고 팔은 자연스럽게 앞뒤로
    // 달리기: 몸을 앞으로 숙이고, 무릎을 크게 접고, 팔꿈치를 굽혀 힘차게 흔들며 통통 튐
    // 부드럽게 보이는 원리: ① 걷기↔달리기를 0~1 사이 값(runBlend)으로 천천히 섞고
    // ② 관절은 시간에 맞춘 '부드러운 따라가기'(sm)로 움직이고 ③ 골반·어깨가 살짝 엇갈려 비틀림
    const walking = this.moving && this.y === 0;
    const sm = (rate) => 1 - Math.exp(-dt * rate);
    this.runBlend = lerp(this.runBlend || 0, walking && this.running ? 1 : 0, sm(6));
    this.walkBlend = lerp(this.walkBlend || 0, walking ? 1 : 0, sm(10));
    const rb = this.runBlend, wb = this.walkBlend;
    const prevStep = Math.floor(this.walkT / Math.PI);
    this.walkT += dt * (walking ? lerp(8.5, 13, rb) : 0);
    if (walking && Math.floor(this.walkT / Math.PI) !== prevStep && this.onStep) this.onStep(); // 발이 닿을 때마다 발소리
    const ph = this.walkT;
    const s1 = Math.sin(ph), k = sm(18);
    const legAmp = lerp(0.42, 0.85, rb) * wb;
    this.legL.rotation.x = lerp(this.legL.rotation.x, s1 * legAmp, k);
    this.legR.rotation.x = lerp(this.legR.rotation.x, -s1 * legAmp, k);
    // 무릎: 다리가 뒤로 갈 때 접힘 (달리기는 크게). 곡선을 부드럽게 만들려고 제곱을 씀
    const kneeAmp = lerp(0.4, 1.15, rb) * wb;
    const kneeCurve = (v) => Math.pow(Math.max(0, v), 1.4);
    this.kneeL.rotation.x = lerp(this.kneeL.rotation.x, kneeCurve(-Math.sin(ph - 0.6)) * kneeAmp, k);
    this.kneeR.rotation.x = lerp(this.kneeR.rotation.x, kneeCurve(Math.sin(ph - 0.6)) * kneeAmp, k);
    const armAmp = lerp(0.35, 0.9, rb) * wb;
    const elbow = lerp(-0.05, lerp(-0.18, -1.3, rb), wb);
    this.armL.rotation.x = lerp(this.armL.rotation.x, -s1 * armAmp, k);
    this.armL.rotation.z = lerp(this.armL.rotation.z, -0.07 - Math.abs(s1) * 0.04 * wb, k);
    this.elbowL.rotation.x = lerp(this.elbowL.rotation.x, elbow, sm(10));
    // 몸: 달릴 때 앞으로 숙임 + 걸음마다 골반이 살짝 돌고 좌우로 기울어짐
    this.body.rotation.x = lerp(this.body.rotation.x, 0.15 * rb, sm(8));
    this.body.rotation.y = lerp(this.body.rotation.y, s1 * lerp(0.07, 0.1, rb) * wb, k);
    this.body.rotation.z = lerp(this.body.rotation.z, Math.cos(ph) * 0.025 * wb, k);

    // 가만히 있을 때: 숨쉬기(아주 작게 오르내림), 고개를 살짝 갸웃
    const t = performance.now() / 1000;
    const idle = 1 - wb;
    const breath = Math.sin(t * 1.9) * 0.008 * idle;
    const bob = Math.abs(s1) * lerp(0.025, 0.09, rb) * wb;
    this.lift = lerp(this.lift, 0, 1 - Math.exp(-dt * 7));
    this.body.position.y = this.y + bob + breath + this.lift;
    this.armL.rotation.z += Math.sin(t * 1.9) * 0.01 * idle;
    this.head.rotation.z = lerp(this.head.rotation.z, s1 * 0.035 * wb + Math.sin(t * 0.6) * 0.035 * idle, sm(8));
    this.head.rotation.y = lerp(this.head.rotation.y, Math.sin(t * 0.37) * 0.12 * idle, sm(4));
    this.head.rotation.x = lerp(this.head.rotation.x, -0.12 * rb, sm(8)); // 달릴 때 고개는 앞을 봄

    // 눈 깜빡임: 2~5초마다 0.14초 동안
    this.blink(dt);

    // 인사
    if (this.waveT > 0) {
      this.waveT -= dt;
      this.armR.rotation.x = lerp(this.armR.rotation.x, 0, sm(14));
      this.armR.rotation.z = lerp(this.armR.rotation.z, 2.6 + Math.sin(this.waveT * 14) * 0.3, sm(14));
      this.elbowR.rotation.x = lerp(this.elbowR.rotation.x, 0, sm(14));
    } else {
      this.armR.rotation.x = lerp(this.armR.rotation.x, s1 * armAmp, k);
      this.armR.rotation.z = lerp(this.armR.rotation.z, 0.07 + Math.abs(s1) * 0.04 * wb - Math.sin(t * 1.9) * 0.01 * idle, sm(10));
      this.elbowR.rotation.x = lerp(this.elbowR.rotation.x, elbow, sm(10));
    }
  }

  // 유령: 땅에서 조금 떠서 천천히 오르내리고, 움직일 땐 진행 방향으로 살짝 기울어요
  updateGhost(dt) {
    if (!this.isGhost || !this.ghost) return;
    const t = performance.now() / 1000;
    this.ghost.position.y = this.y + 0.25 + Math.sin(t * 1.8) * 0.07;
    this.ghost.rotation.x = lerp(this.ghost.rotation.x, this.moving ? 0.12 : 0, 1 - Math.exp(-dt * 5));
    this.ghost.rotation.z = Math.sin(t * 1.1) * 0.04 + (this.waveT > 0 ? Math.sin(this.waveT * 9) * 0.22 : 0); // 인사: 몸을 좌우로 흔들흔들
  }

  serialize() {
    const ex = this.pose && this.pose.exit; // 앉아 있을 땐 일어나서 설 자리로 저장
    return { x: ex ? ex.x : this.root.position.x, z: ex ? ex.z : this.root.position.z, facing: this.facing };
  }
  restore(s) {
    if (!s) return;
    if (this.pose) this.clearPose(true);
    this.unpose = null; this.lift = 0;
    this.root.position.set(s.x || 0, 0, s.z || 0);
    this.facing = s.facing || 0;
    this.root.rotation.y = this.facing;
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }
