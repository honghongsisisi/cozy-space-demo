// 하늘·시간대·날씨·조명 연출
import * as THREE from 'three';
import { SKY_KEYS, PALETTE as P } from './palette.js?v=0.28';
import { glowMat, fireMat } from './catalog.js?v=0.28';
import { seoulNow, sunTimes, skyTimeFor } from './realtime.js?v=0.28';

const LIGHT_POOL = 4; // 밤에 실제로 빛을 내는 등불 수 (가볍게 유지하려고 제한)

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Environment {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.time = 13;
    this.weather = 'clear';
    this.flowing = false;
    this.indoor = false; // 집 안에 있으면 true (하늘·빛·날씨 입자를 집 안에 맞춤)
    this.realTime = false; // 켜면 한국 실제 시간에 맞춰 하늘이 바뀜
    this.cloudiness = 0; // 0~1, 날씨에 따라 천천히 바뀜

    // 하늘 공 (위·아래 두 색 그라데이션)
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = clamp(vP.y * 1.6 + 0.05, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0);
        #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), this.skyMat);
    scene.add(this.sky);
    scene.fog = new THREE.Fog(0xffffff, 80, 380);

    // 빛
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb5d98f, 1.2);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -16; sc.right = sc.top = 16; sc.near = 1; sc.far = 90; // 그림자는 캐릭터 주변만 (섬이 넓어도 선명하게)
    this.sun.shadow.radius = 4; // 그림자 가장자리를 부드럽게
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);

    this.lampLights = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xffb878, 0, 8, 1.8);
      scene.add(l);
      this.lampLights.push(l);
    }

    this.makeStars();
    this.makeMoon();
    // 밤하늘 방울은 홍시 님 요청으로 뺐음 (다시 켜려면 아래 줄의 // 를 지우기)
    // this.makeBubbles();
    this.bubbles = [];
    this.makeClouds();
    this.makeWeather();

    this._c1 = new THREE.Color(); this._c2 = new THREE.Color();
  }

  makeStars() {
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * 1.3;
      const r = 400;
      pos[i * 3] = Math.cos(th) * Math.sin(ph) * r;
      pos[i * 3 + 1] = Math.cos(ph) * r * 0.9 + 15;
      pos[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = canvasTex(32, (ctx, s) => {
      const gr = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, s, s);
    });
    this.starMat = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, map: tex, transparent: true, depthWrite: false, fog: false });
    this.stars = new THREE.Points(g, this.starMat);
    this.scene.add(this.stars);
  }

  makeMoon() {
    const tex = canvasTex(256, (ctx, s) => {
      const c = s / 2;
      const glow = ctx.createRadialGradient(c, c, s * 0.18, c, c, s * 0.5);
      glow.addColorStop(0, 'rgba(255,250,235,0.5)'); glow.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, s, s);
      // 초승달: 큰 원에서 옆 원을 빼기
      ctx.fillStyle = '#fffbea';
      ctx.beginPath(); ctx.arc(c, c, s * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(c + s * 0.1, c - s * 0.07, s * 0.2, 0, Math.PI * 2); ctx.fill();
    });
    this.moonMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    this.moon = new THREE.Sprite(this.moonMat);
    this.moon.scale.set(90, 90, 1);
    this.scene.add(this.moon);
  }

  // 밤하늘에 둥둥 떠오르는 투명한 방울
  makeBubbles() {
    const tex = canvasTex(64, (ctx, s) => {
      const c = s / 2;
      const gr = ctx.createRadialGradient(c, c, s * 0.25, c, c, s * 0.48);
      gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.8, 'rgba(255,240,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c, c, s * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.ellipse(c - s * 0.15, c - s * 0.17, s * 0.08, s * 0.04, -0.7, 0, Math.PI * 2); ctx.fill();
    });
    this.bubbleMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
    this.bubbles = [];
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Sprite(this.bubbleMat);
      const s = 0.4 + Math.random() * 0.8;
      b.scale.set(s, s, 1);
      b.userData = { a: Math.random() * Math.PI * 2, r: 4 + Math.random() * 14, y: Math.random() * 14, sp: 0.3 + Math.random() * 0.4 };
      this.scene.add(b);
      this.bubbles.push(b);
    }
  }

  // 구름: 각진 돌덩이처럼 보이지 않게 매끈한 공을 여러 개 겹친 솜사탕 모양.
  // 스스로 조금 빛나게(emissive) 해서 그늘진 아랫면도 회색 덩어리가 되지 않음
  makeClouds() {
    this.cloudRoot = new THREE.Group();
    this.cloudMat = new THREE.MeshLambertMaterial({ color: P.cloud, emissive: 0xffffff, emissiveIntensity: 0.45, transparent: true, opacity: 0.9, fog: false });
    const geo = new THREE.SphereGeometry(1, 18, 12);
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Group();
      const parts = 4 + (i % 3);
      for (let j = 0; j < parts; j++) {
        const m = new THREE.Mesh(geo, this.cloudMat);
        const mid = 1 - Math.abs(j - (parts - 1) / 2) / parts; // 가운데가 더 크고 높게
        const s = 3 + mid * 3.5 + Math.random() * 1.2;
        m.scale.set(s * 1.25, s * 0.8, s);
        m.position.set(j * 4.2 - parts * 2.1, mid * 2.2 + Math.random() * 0.6, Math.random() * 2.5);
        c.add(m);
      }
      // 아래를 평평하게 받쳐 주는 납작한 공 (뭉게구름의 바닥)
      const base = new THREE.Mesh(geo, this.cloudMat);
      base.scale.set(parts * 2.6, 1.6, 4);
      base.position.set(-2.1, -0.6, 1.2);
      c.add(base);
      const a = (i / 10) * Math.PI * 2, d = 110 + Math.random() * 90;
      c.position.set(Math.cos(a) * d, 30 + Math.random() * 25, Math.sin(a) * d);
      c.lookAt(0, c.position.y, 0);
      this.cloudRoot.add(c);
    }
    this.scene.add(this.cloudRoot);
  }

  makeWeather() {
    // 비: 가는 선
    const n = 700; // 빗줄기 수 (v0.22에서 1400 → 700, 차분하게)
    const rp = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 50, y = Math.random() * 25, z = (Math.random() - 0.5) * 50;
      rp.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0.55 }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    // 눈·꽃잎: 점
    const m = 900, fp = new Float32Array(m * 3);
    this.flakeSeed = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      fp.set([(Math.random() - 0.5) * 50, Math.random() * 25, (Math.random() - 0.5) * 50], i * 3);
      this.flakeSeed[i] = Math.random() * 100;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    this.snowTex = canvasTex(32, (ctx, s) => {
      const gr = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, s, s);
    });
    this.petalTex = canvasTex(32, (ctx, s) => {
      ctx.fillStyle = '#ffc4d6';
      ctx.beginPath(); ctx.ellipse(s / 2, s / 2, s * 0.42, s * 0.24, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe3ec';
      ctx.beginPath(); ctx.ellipse(s * 0.45, s * 0.45, s * 0.18, s * 0.08, 0.6, 0, Math.PI * 2); ctx.fill();
    });
    this.flakeMat = new THREE.PointsMaterial({ size: 0.28, map: this.snowTex, transparent: true, depthWrite: false });
    this.flakes = new THREE.Points(fg, this.flakeMat);
    this.flakes.visible = false;
    this.flakes.frustumCulled = false;
    this.scene.add(this.flakes);
  }

  setTime(t) { this.time = ((t % 24) + 24) % 24; }
  setWeather(w) {
    this.weather = w;
    this.rain.visible = w === 'rain';
    this.flakes.visible = w === 'snow' || w === 'petals';
    if (w === 'snow') { this.flakeMat.map = this.snowTex; this.flakeMat.size = 0.25; }
    if (w === 'petals') { this.flakeMat.map = this.petalTex; this.flakeMat.size = 0.35; }
    this.flakeMat.needsUpdate = true;
  }

  sample() {
    const t = this.time;
    let i = 0;
    while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].t <= t) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
    const k = (t - a.t) / (b.t - a.t);
    return { a, b, k };
  }

  // 밤 정도 (0 = 낮, 1 = 깊은 밤)
  nightness() {
    const t = this.time;
    if (t >= 7.5 && t <= 17.5) return 0;
    if (t > 17.5 && t < 20) return (t - 17.5) / 2.5;
    if (t >= 20 || t < 5) return 1;
    return 1 - (t - 5) / 2.5;
  }

  update(dt, focus) {
    if (this.realTime) {
      const now = seoulNow();
      if (!this.sun_ || this.sun_.day !== now.day) this.sun_ = { day: now.day, ...sunTimes(now.year, now.month, now.day) }; // 하루에 한 번만 계산
      this.seoul = now.hours;
      this.setTime(skyTimeFor(now.hours, this.sun_));
    } else if (this.flowing) this.setTime(this.time + dt * (24 / 180)); // 3분에 하루

    const wantCloud = { clear: 0, cloudy: 0.75, rain: 1, snow: 0.6, petals: 0.1 }[this.weather];
    this.cloudiness += (wantCloud - this.cloudiness) * Math.min(1, dt * 1.5);
    const cl = this.cloudiness;
    const night = this.nightness();

    const { a, b, k } = this.sample();
    // 흐린 날 색: 차가운 잿빛 대신 연보랏빛 도는 포근한 회색 (밤엔 남보라)
    const gray = this._c2.setHex(night > 0.5 ? 0x4b4a7e : 0xc6c3da);
    const top = this._c1.setHex(a.top).lerp(new THREE.Color(b.top), k).lerp(gray, cl * 0.5);
    this.skyMat.uniforms.top.value.copy(top);
    const bottom = new THREE.Color(a.bottom).lerp(new THREE.Color(b.bottom), k).lerp(new THREE.Color(night > 0.5 ? 0x8a74b8 : 0xe2d9e6), cl * 0.45);
    this.skyMat.uniforms.bottom.value.copy(bottom);
    this.scene.fog.color.copy(bottom);
    // 집 창문 유리: 바깥 하늘빛
    if (this.world.windowMat) this.world.windowMat.color.copy(top).lerp(bottom, 0.55).lerp(this._c2.setHex(0xffffff), 0.15);
    // 집 안: 바깥(하늘)은 따뜻하고 차분한 단색 배경으로. 밤엔 조금 어둡게
    if (this.indoor) {
      const inTop = new THREE.Color(0xe6d8c3).lerp(new THREE.Color(0x4f4862), night * 0.85);
      const inBot = new THREE.Color(0xf1e7d8).lerp(new THREE.Color(0x6c6280), night * 0.85);
      this.skyMat.uniforms.top.value.copy(inTop);
      this.skyMat.uniforms.bottom.value.copy(inBot);
      this.scene.fog.color.copy(inBot);
    }

    // 물은 하늘색을 비춤
    this.world.water.material.color.copy(top).lerp(bottom, 0.7).lerp(this._c2.setHex(0xffffff), 0.08);
    // 밤 물빛: 진한 보라 대신 참고 이미지 같은 분홍빛 도는 연보라로 살짝 밝게
    this.world.water.material.color.lerp(this._c2.setHex(0xb294dc), night * 0.5);
    this.world.ripples.material.opacity = 0.14 + (1 - night) * 0.16;
    this.world.ripples2.material.opacity = 0.08 + (1 - night) * 0.08;

    const sunI = (a.sunI + (b.sunI - a.sunI) * k) * (1 - cl * 0.45);
    const ambI = (a.ambI + (b.ambI - a.ambI) * k) * (1 - cl * 0.1); // 흐려도 섬은 너무 어두워지지 않게
    this.sun.color.setHex(a.sun).lerp(new THREE.Color(b.sun), k);
    this.sun.intensity = sunI;
    this.hemi.intensity = ambI;
    this.hemi.color.copy(top).lerp(new THREE.Color(0xffffff), 0.6);
    this.hemi.groundColor.setHex(0x9fbf88).lerp(bottom, 0.3);
    if (this.indoor) {
      // 집 안: 창으로 드는 햇빛은 부드럽게, 방 전체는 따뜻하고 고르게
      this.sun.intensity = sunI * 0.6;
      this.hemi.intensity = Math.max(ambI, 0.95) * 1.05;
      this.hemi.color.setHex(0xfff4e6).lerp(new THREE.Color(0xb9b0e0), night * 0.5);
      this.hemi.groundColor.setHex(0xd9bf9e);
    }

    // 해(낮)·달(밤) 방향: 그림자가 너무 길어지지 않게 높이를 제한
    const ang = ((this.time - 6) / 12) * Math.PI;
    const isDay = night < 0.5;
    const dir = isDay
      ? new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(0.45, Math.sin(ang)), 0.5)
      : new THREE.Vector3(-0.5, 0.8, -0.6);
    dir.normalize();
    // 그림자 범위가 캐릭터를 따라다니게 (떨림 없게 2칸 단위로 맞춤)
    const fx = Math.round(focus.x / 2) * 2, fz = Math.round(focus.z / 2) * 2;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.copy(dir).multiplyScalar(40).add(this.sun.target.position);

    // 달·별·방울
    const clearNight = this.indoor ? 0 : night * (1 - cl);
    this.cloudRoot.visible = !this.indoor;
    this.rain.visible = this.weather === 'rain' && !this.indoor;         // 집 안에는 비·눈이 안 내려요
    this.flakes.visible = (this.weather === 'snow' || this.weather === 'petals') && !this.indoor;
    this.moonMat.opacity = clearNight;
    this.moon.visible = clearNight > 0.01;
    this.moon.position.copy(focus).add(new THREE.Vector3(-0.35, 0.42, -1).normalize().multiplyScalar(360));
    this.starMat.opacity = clearNight * (0.75 + Math.sin(performance.now() / 700) * 0.15);
    this.stars.visible = clearNight > 0.01;
    this.stars.position.set(focus.x, 0, focus.z);
    this.sky.position.copy(focus);

    const tt = performance.now() / 1000;
    this.cloudMat.color.setHex(0xffffff).lerp(new THREE.Color(night > 0.5 ? 0x6c6aa0 : 0xdedbea), Math.max(cl * 0.8, night * 0.8));
    this.cloudMat.emissive.setHex(0xffffff).lerp(new THREE.Color(night > 0.5 ? 0x4a4880 : 0xe6e2f0), Math.max(cl * 0.6, night * 0.85));
    this.cloudRoot.rotation.y += dt * 0.004;

    // 등불: 밤이나 흐린 날 켜짐
    const lampOn = Math.min(1, night + cl * 0.5);
    glowMat.color.setHex(0xf4ecd8).lerp(new THREE.Color(P.bulb).multiplyScalar(1.15), lampOn);
    const flick = 0.9 + Math.sin(tt * 13) * 0.05 + Math.sin(tt * 7.3) * 0.05;
    fireMat.color.setHex(P.fire).multiplyScalar(flick);
    const sources = this.world.lightSources().sort((p, q) => p.distanceToSquared(focus) - q.distanceToSquared(focus));
    this.lampLights.forEach((l, i) => {
      const s = sources[i];
      l.intensity = s ? lampOn * 5 : 0;
      if (s) l.position.copy(s);
    });
    this.world.items.forEach(({ obj }) => {
      obj.traverse((o) => { if (o.userData.flicker) o.scale.set(1, flick, 1); });
    });

    // 날씨 입자: 아바타 주변에서만 내림
    if (this.rain.visible) {
      const p = this.rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 2) {
        let y = p.getY(i) - dt * 22;
        if (y < -1) y += 25;
        p.setY(i, y); p.setY(i + 1, y - 0.7);
      }
      p.needsUpdate = true;
      this.rain.position.set(focus.x, 0, focus.z);
    }
    if (this.flakes.visible) {
      const p = this.flakes.geometry.attributes.position;
      const petals = this.weather === 'petals';
      const fall = petals ? 1.4 : 1.8;
      for (let i = 0; i < p.count; i++) {
        const s = this.flakeSeed[i];
        let y = p.getY(i) - dt * fall * (0.7 + (s % 1) * 0.6);
        if (y < -0.5) y += 25;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(tt * (petals ? 1.6 : 0.8) + s) * dt * (petals ? 0.9 : 0.4));
      }
      p.needsUpdate = true;
      this.flakes.position.set(focus.x, 0, focus.z);
    }
  }

  serialize() { return { time: this.time, weather: this.weather, flowing: this.flowing, realTime: this.realTime }; }
  restore(s) {
    if (!s) return;
    if (typeof s.time === 'number') this.setTime(s.time);
    if (s.weather) this.setWeather(s.weather);
    this.flowing = !!s.flowing;
    this.realTime = !!s.realTime;
  }
}
