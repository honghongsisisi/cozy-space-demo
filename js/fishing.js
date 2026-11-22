// 바닷가 낚시 (v0.48)
// 흐름: 모래밭에서 바다를 누르고 '낚시하기' → 낚싯대를 휙 던짐 → 찌가 물에 둥둥 → 몇 초 뒤 찌가 쑥 들어감
//       → 그때 화면을 한 번 누르면(또는 Space) 잡힘 → 물고기 카드 → 한 번 더 / 그만하기
// 늦게 눌러도 벌칙은 없어요. "아쉽게 놓쳤어요" 하고 다시 던질 뿐이에요.
// 잡은 물고기는 바구니에 들어가고(팔면 조개 = 게임 돈), 도감에는 종류마다 처음 잡은 기록과 가장 큰 크기가 남아요.
import * as THREE from 'three';
import { WATER_Y } from './world.js?v=0.49';

// 물고기 8종. 언제(when) 잘 나오는지만 조금씩 달라요. 매일 반복되니 '놓치면 끝'인 물고기는 없어요.
//  when: any 언제나 / day 낮 / night 밤 / rain 비 오는 날 / clearDay 맑은 낮
//  w: 얼마나 자주 나오는지 (클수록 자주), cm: 크기 범위, price: 기본 값 (큰 물고기일수록 조금 더 받아요)
export const FISH = [
  { id: 'jack', name: '전갱이', when: 'any', w: 30, cm: [15, 30], price: 6, color: 0xa7b8c2, shape: 'fish' },
  { id: 'mackerel', name: '고등어', when: 'any', w: 22, cm: [25, 42], price: 9, color: 0x86a2a6, shape: 'stripe' },
  { id: 'seabream', name: '도미', when: 'day', w: 14, cm: [25, 50], price: 18, color: 0xdcab9c, shape: 'tall' },
  { id: 'puffer', name: '복어', when: 'clearDay', w: 8, cm: [10, 25], price: 22, color: 0xd8c597, shape: 'round' },
  { id: 'flounder', name: '넙치', when: 'any', w: 6, cm: [35, 70], price: 28, color: 0xb59f86, shape: 'flat' },
  { id: 'squid', name: '오징어', when: 'night', w: 14, cm: [18, 35], price: 14, color: 0xe6d3c4, shape: 'squid' },
  { id: 'cutlass', name: '갈치', when: 'night', w: 6, cm: [60, 110], price: 30, color: 0xc8ced3, shape: 'long' },
  { id: 'rockfish', name: '우럭', when: 'rain', w: 16, cm: [20, 40], price: 15, color: 0x93877b, shape: 'fish' },
];
export const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));
export const WHEN_TEXT = { any: '언제나 나와요', day: '낮에 잘 나와요', night: '밤에 나와요', rain: '비 오는 날 나와요', clearDay: '맑은 낮에 가끔 나와요' };
export const MONEY = '조개'; // 게임 돈 이름 (임시)

export function fishValue(id, cm) {
  const f = FISH_BY_ID[id];
  if (!f) return 0;
  const k = (cm - f.cm[0]) / Math.max(1, f.cm[1] - f.cm[0]);
  return Math.max(1, Math.round(f.price * (0.8 + 0.4 * Math.min(1, Math.max(0, k)))));
}

// 물고기 그림 (작은 캔버스에 단순한 모양으로). 도감·카드에 써요. 못 잡은 물고기는 회색 그림자로.
const iconCache = new Map();
export function fishIcon(id, shadow = false) {
  const key = id + (shadow ? ':s' : '');
  if (iconCache.has(key)) return iconCache.get(key);
  const f = FISH_BY_ID[id];
  const c = document.createElement('canvas'); c.width = 96; c.height = 64;
  const g = c.getContext('2d');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const body = shadow ? '#d9d2c7' : hex(f.color);
  const dark = shadow ? '#cfc7bb' : 'rgba(60,45,35,0.22)';
  g.fillStyle = body; g.strokeStyle = dark; g.lineWidth = 2;
  const tail = (x, y, s) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x - s, y - s * 0.7); g.lineTo(x - s * 0.8, y); g.lineTo(x - s, y + s * 0.7); g.closePath(); g.fill(); };
  const eye = (x, y) => { if (shadow) return; g.fillStyle = '#3b2c24'; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); g.fillStyle = body; };
  switch (f.shape) {
    case 'round':
      tail(30, 32, 14); g.beginPath(); g.arc(52, 32, 20, 0, 7); g.fill();
      if (!shadow) { g.fillStyle = dark; for (let i = 0; i < 9; i++) { const a = i * 0.7; g.beginPath(); g.arc(52 + Math.cos(a) * 13, 32 + Math.sin(a) * 13, 1.4, 0, 7); g.fill(); } g.fillStyle = body; }
      eye(62, 27); break;
    case 'flat':
      tail(22, 32, 12); g.beginPath(); g.ellipse(50, 32, 30, 17, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(50, 32, 24, 11, 0, 0, 7); g.stroke();
      eye(68, 26); eye(72, 30); break;
    case 'long':
      tail(14, 34, 8); g.beginPath(); g.moveTo(12, 34); g.quadraticCurveTo(48, 20, 90, 30); g.quadraticCurveTo(48, 42, 12, 34); g.fill(); eye(80, 30); break;
    case 'tall':
      tail(26, 32, 15); g.beginPath(); g.ellipse(52, 32, 26, 19, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(40, 15); g.lineTo(60, 12); g.lineTo(64, 18); g.fill(); eye(68, 28); break;
    case 'squid':
      g.beginPath(); g.moveTo(84, 32); g.lineTo(52, 18); g.lineTo(44, 32); g.lineTo(52, 46); g.closePath(); g.fill();
      g.lineWidth = 3; g.strokeStyle = body; g.lineCap = 'round';
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(46, 32 + i * 3); g.quadraticCurveTo(30, 32 + i * 6, 14, 32 + i * 8 + (i % 2) * 3); g.stroke(); }
      eye(50, 28); break;
    default: // fish, stripe
      tail(26, 32, 15); g.beginPath(); g.ellipse(52, 32, 28, 13, 0, 0, 7); g.fill();
      if (f.shape === 'stripe' && !shadow) { g.strokeStyle = 'rgba(70,90,90,0.45)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(40 + i * 8, 21); g.quadraticCurveTo(44 + i * 8, 26, 40 + i * 8, 30); g.stroke(); } }
      eye(70, 29);
  }
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

const r1 = (v) => Math.round(v * 10) / 10;
// '을/를' 고르기: 마지막 글자에 받침이 있으면 '을'
const eul = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? '을' : '를'; };

export class Fishing {
  // env: 지금 시간·날씨 (어떤 물고기가 나올지), sound: 효과음, toast: 짧은 알림
  // onChange: 바구니·도감·조개가 바뀌면 (저장·창 새로 그리기)
  constructor({ scene, avatar, env, sound, toast, onChange }) {
    Object.assign(this, { scene, avatar, env, sound, toast, onChange });
    this.data = { coins: 0, basket: [], dex: {} };
    this.state = 'off'; // off | cast | wait | bite | caught | missed
    this.t = 0;

    // 찌: 위는 차분한 산호색, 아래는 크림색 (원색 빨강 대신)
    this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd99482 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf6efe4 }));
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), new THREE.MeshLambertMaterial({ color: 0x8f6745 }));
    pin.position.y = 0.15;
    this.bobber.add(top, bot, pin);
    this.bobber.visible = false;
    scene.add(this.bobber);
    // 낚싯줄: 낚싯대 끝에서 찌까지 살짝 처진 가는 선
    this.linePts = Array.from({ length: 14 }, () => new THREE.Vector3());
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.linePts), new THREE.LineBasicMaterial({ color: 0xf4eee6, transparent: true, opacity: 0.75 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
    // 찌 둘레 물결
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
    this.ringT = 0;

    this.buildUI();
  }

  // ---- 저장 ----
  serialize() { return { coins: this.data.coins, basket: this.data.basket.slice(0, 300), dex: this.data.dex }; }
  restore(d) {
    const ok = d && typeof d === 'object';
    this.data = {
      coins: ok && Number.isFinite(d.coins) ? Math.max(0, Math.floor(d.coins)) : 0,
      basket: ok && Array.isArray(d.basket) ? d.basket.filter((b) => b && FISH_BY_ID[b.f]) : [],
      dex: ok && d.dex && typeof d.dex === 'object' ? d.dex : {},
    };
  }
  get active() { return this.state !== 'off'; }

  // ---- 화면 아래 작은 안내줄 + 물고기 카드 ----
  buildUI() {
    const vp = document.getElementById('viewport');
    this.bar = document.createElement('div');
    this.bar.className = 'fish-bar hidden';
    this.bar.innerHTML = '<span class="fish-msg"></span><button class="btn fish-stop">그만하기</button>';
    vp.appendChild(this.bar);
    this.msg = this.bar.querySelector('.fish-msg');
    this.bar.querySelector('.fish-stop').addEventListener('click', () => this.stop());

    this.card = document.createElement('div');
    this.card.className = 'fish-card hidden';
    this.card.innerHTML = `<img class="fish-img" alt=""><div class="fish-info"><b class="fish-name"></b><span class="fish-size"></span><em class="fish-new hidden">도감에 새로 올렸어요</em><em class="fish-best hidden">가장 큰 기록이에요</em></div>
      <div class="fish-actions"><button class="btn btn-accent fish-again">한 번 더</button><button class="btn fish-done">그만하기</button></div>`;
    vp.appendChild(this.card);
    this.card.querySelector('.fish-again').addEventListener('click', () => { this.hideCard(); this.cast(); });
    this.card.querySelector('.fish-done').addEventListener('click', () => { this.hideCard(); this.stop(); });
  }
  say(text, hot = false) { this.msg.textContent = text; this.bar.classList.toggle('hot', hot); }
  hideCard() { this.card.classList.add('hidden'); }

  // 바다 쪽(각도 angle)을 보고 낚시 시작
  begin(angle) {
    if (this.active) return;
    this.angle = angle;
    this.avatar.facing = angle; this.avatar.root.rotation.y = angle;
    this.avatar.target = null;
    this.avatar.fishing = true;
    this.bar.classList.remove('hidden');
    this.cast();
  }
  stop() {
    if (!this.active) return;
    this.state = 'off';
    this.avatar.fishing = false; this.avatar.castT = 0; this.avatar.reelT = 0;
    this.bobber.visible = this.line.visible = this.ring.visible = false;
    this.bar.classList.add('hidden');
    this.hideCard();
  }
  cast() {
    const a = this.avatar;
    a.facing = this.angle; a.root.rotation.y = this.angle;
    a.castT = 0.8;
    this.state = 'cast'; this.t = 0;
    const dist = 4.2 + Math.random() * 1.6;
    const p = a.position;
    this.land = new THREE.Vector3(p.x + Math.sin(this.angle) * dist, WATER_Y, p.z + Math.cos(this.angle) * dist);
    this.bobber.visible = false; this.line.visible = false;
    this.say('휙! 찌를 던졌어요');
  }
  // 어떤 물고기가 올지: 지금 시간·날씨에 맞는 물고기 중에서 '자주 나오는 정도'만큼 뽑기
  pick() {
    const night = this.env.nightness() > 0.5, rain = this.env.weather === 'rain', clear = this.env.weather === 'clear';
    const ok = (w) => w === 'any' || (w === 'day' && !night) || (w === 'night' && night) || (w === 'rain' && rain) || (w === 'clearDay' && clear && !night);
    const pool = FISH.filter((f) => ok(f.when));
    let r = Math.random() * pool.reduce((s, f) => s + f.w, 0);
    const f = pool.find((q) => (r -= q.w) < 0) || pool[0];
    const k = Math.pow(Math.random(), 1.6); // 작은 게 흔하고 큰 건 가끔
    return { f: f.id, cm: r1(f.cm[0] + (f.cm[1] - f.cm[0]) * k) };
  }

  // 화면을 눌렀을 때 (main.js에서 불러 줌). 낚시가 받아 처리했으면 true
  tap() {
    if (this.state === 'bite') { this.hook(); return true; }
    if (this.state === 'wait' || this.state === 'cast') { this.say('찌가 쑥 들어가면 그때 눌러요'); return true; }
    return this.state === 'caught' || this.state === 'missed';
  }
  hook() {
    const got = this.pick();
    this.avatar.reelT = 0.7;
    this.state = 'caught'; this.t = 0;
    this.sound.fishCatch && this.sound.fishCatch();
    const d = this.data, prev = d.dex[got.f];
    const isNew = !prev, isBest = prev && got.cm > prev.best;
    d.dex[got.f] = { n: (prev ? prev.n : 0) + 1, best: Math.max(prev ? prev.best : 0, got.cm) };
    d.basket.push({ f: got.f, cm: got.cm });
    const f = FISH_BY_ID[got.f];
    this.card.querySelector('.fish-img').src = fishIcon(got.f);
    this.card.querySelector('.fish-name').textContent = f.name;
    this.card.querySelector('.fish-size').textContent = `${got.cm}cm · 팔면 ${MONEY} ${fishValue(got.f, got.cm)}개`;
    this.card.querySelector('.fish-new').classList.toggle('hidden', !isNew);
    this.card.querySelector('.fish-best').classList.toggle('hidden', !isBest);
    setTimeout(() => { if (this.state === 'caught') this.card.classList.remove('hidden'); }, 650);
    this.say(`${f.name}${eul(f.name)} 낚았어요! 바구니에 넣었어요`);
    this.onChange && this.onChange();
  }

  // 물건 팔기 (바구니에서 그 종류를 모두)
  sellKind(id) {
    const d = this.data;
    let sum = 0, n = 0;
    d.basket = d.basket.filter((b) => { if (b.f !== id) return true; sum += fishValue(b.f, b.cm); n++; return false; });
    d.coins += sum;
    this.onChange && this.onChange();
    return { n, sum };
  }
  sellAll() {
    const d = this.data;
    const sum = d.basket.reduce((s, b) => s + fishValue(b.f, b.cm), 0), n = d.basket.length;
    d.coins += sum; d.basket = [];
    this.onChange && this.onChange();
    return { n, sum };
  }

  // ---- 매 프레임 ----
  update(dt) {
    if (!this.active) return;
    const a = this.avatar, now = performance.now() / 1000;
    this.t += dt;
    const tip = new THREE.Vector3();
    a.rodTip.getWorldPosition(tip);
    if (this.state === 'cast') {
      // 팔을 휘두른 뒤(0.45초) 찌가 포물선을 그리며 날아가 물에 '퐁'
      const k = (this.t - 0.45) / 0.55;
      if (k > 0) {
        const e = Math.min(1, k);
        this.bobber.visible = this.line.visible = true;
        this.bobber.position.lerpVectors(tip, this.land, e);
        this.bobber.position.y += Math.sin(Math.PI * e) * 1.4;
        if (k >= 1) {
          this.state = 'wait'; this.t = 0;
          this.waitFor = 3.5 + Math.random() * 6; // 3.5~9.5초 기다림
          this.nibbles = [0.3, 0.6].filter(() => Math.random() < 0.6).map((q) => q * this.waitFor);
          this.sound.fishPlop && this.sound.fishPlop();
          this.ripple();
          this.say('찌를 지켜봐요… 쑥 들어가면 화면을 눌러요');
        }
      }
    } else if (this.state === 'wait') {
      let y = WATER_Y + Math.sin(now * 2.2) * 0.025;
      this.nibbles.forEach((q) => { const d = this.t - q; if (d > 0 && d < 0.35) y -= Math.sin((d / 0.35) * Math.PI) * 0.06; }); // 톡톡 건드림
      this.bobber.position.y = y;
      if (this.t > this.waitFor) {
        this.state = 'bite'; this.t = 0;
        this.sound.fishBite && this.sound.fishBite();
        this.ripple();
        this.say('지금이에요! 화면을 눌러요', true);
      }
    } else if (this.state === 'bite') {
      this.bobber.position.y = WATER_Y - 0.16 - Math.sin(now * 14) * 0.03; // 물속으로 쑥
      if (this.t > 1.5) { // 놓쳐도 벌칙 없이 다시 던지기
        this.state = 'missed'; this.t = 0;
        this.bobber.position.y = WATER_Y;
        this.say('아쉽게 놓쳤어요. 다시 던질게요');
      }
    } else if (this.state === 'missed') {
      if (this.t > 1.6) this.cast();
    } else if (this.state === 'caught') {
      // 찌(+물고기)를 끌어올림
      const e = Math.min(1, this.t / 0.6);
      this.bobber.position.lerp(tip, e * 0.25);
      if (e >= 1) this.bobber.visible = false;
    }
    // 물결
    if (this.ringT > 0) {
      this.ringT -= dt / 1.4;
      this.ring.visible = this.ringT > 0;
      this.ring.position.set(this.bobber.position.x, WATER_Y + 0.03, this.bobber.position.z);
      this.ring.scale.setScalar(1 + (1 - this.ringT) * 3);
      this.ring.material.opacity = Math.max(0, this.ringT) * 0.4;
    }
    // 낚싯줄: 끝 → 찌, 가운데가 살짝 처지게
    if (this.line.visible) {
      const b = this.bobber.position, n = this.linePts.length - 1;
      const sag = this.state === 'bite' ? 0.05 : 0.35;
      this.linePts.forEach((pt, i) => { const u = i / n; pt.lerpVectors(tip, b, u); pt.y -= Math.sin(Math.PI * u) * sag; });
      this.line.geometry.setFromPoints(this.linePts);
      this.line.visible = this.bobber.visible;
    }
  }
  ripple() { this.ringT = 1; this.ring.visible = true; }
}
