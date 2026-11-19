// 채팅: 지금은 '혼자 써보기'. 메시지는 send → transport → receive 순서로 흐릅니다.
// 2단계(친구와 함께)에서는 transport만 서버로 바꾸면, 남이 보낸 메시지도 같은 receive로 들어와
// 그 사람 캐릭터 머리 위에 말풍선이 뜨게 됩니다.
import * as THREE from 'three';

const PREF_KEY = 'cozy-space-demo:chat';

// 글씨체: 모두 SIL 오픈 폰트 라이선스(OFL) — 무료, 상업적 사용 가능 (Google Fonts에서 불러옴)
export const FONTS = [
  { id: 'basic', name: '기본', css: '"Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif' },
  { id: 'gowun', name: '고운돋움', css: '"Gowun Dodum", sans-serif' },
  { id: 'jua', name: '주아', css: '"Jua", sans-serif' },
  { id: 'pen', name: '손글씨', css: '"Nanum Pen Script", cursive', scale: 1.45 },
];

// 말풍선은 '잘 어울리는 조합' 4가지 중에서만 고름. 색은 따뜻하고 차분한 계열, 글씨는 읽기 쉬운 것만.
export const PRESETS = [
  { id: 'cream', name: '크림', bubble: '#fffdf7', color: '#4a4458', font: 'basic' },
  { id: 'blossom', name: '벚꽃', bubble: '#fbe9ea', color: '#7a4a66', font: 'gowun' },
  { id: 'leaf', name: '풀잎', bubble: '#eef4e6', color: '#3f5e4a', font: 'jua' },
  { id: 'dusk', name: '노을', bubble: '#fdf0dc', color: '#6b4f3f', font: 'gowun' },
];

// 지금은 내 화면에서만 되돌려 주는 '가짜 서버'
class LocalTransport {
  constructor() { this.handlers = []; }
  onMessage(fn) { this.handlers.push(fn); }
  send(msg) { setTimeout(() => this.handlers.forEach((fn) => fn(msg)), 0); }
}

export class Chat {
  constructor({ viewport, camera, getSpeaker, myName }) {
    this.viewport = viewport;
    this.camera = camera;
    this.getSpeaker = getSpeaker; // id → 머리 위치(Vector3)를 알려 주는 함수
    this.myName = myName;
    this.transport = new LocalTransport();
    this.transport.onMessage((m) => this.receive(m));
    this.bubbles = new Map(); // 말한 사람 id → 말풍선
    this.preset = PRESETS[0].id;
    this.logVisible = true;
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (typeof saved.logVisible === 'boolean') this.logVisible = saved.logVisible;
      if (PRESETS.some((p) => p.id === saved.preset)) this.preset = saved.preset; // 예전 '따로 고르기' 설정은 크림으로
    } catch (e) { /* 무시 */ }
    this.setPreset(this.preset, false);
    this.log = document.getElementById('chat-log');
    this.layer = document.getElementById('bubble-layer');
  }

  setPreset(id, save = true) {
    const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
    this.preset = p.id;
    this.style = { bubble: p.bubble, color: p.color, font: p.font };
    if (save) this.savePrefs();
  }

  savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ preset: this.preset, logVisible: this.logVisible })); } catch (e) { /* 무시 */ }
  }

  send(text) {
    text = text.trim().slice(0, 80);
    if (!text) return;
    this.transport.send({ from: 'me', name: this.myName(), text, style: { ...this.style }, t: Date.now() });
  }

  receive(m) {
    this.addLog(m);
    this.showBubble(m);
  }

  fontCss(id) { return (FONTS.find((f) => f.id === id) || FONTS[0]); }

  addLog(m) {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const d = new Date(m.t);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    line.innerHTML = `<span class="chat-time">${time}</span> <b></b> <span class="chat-text"></span>`;
    line.querySelector('b').textContent = m.name;
    line.querySelector('.chat-text').textContent = m.text;
    this.log.appendChild(line);
    while (this.log.children.length > 60) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  showBubble(m) {
    let b = this.bubbles.get(m.from);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'speech';
      this.layer.appendChild(el);
      b = { el };
      this.bubbles.set(m.from, b);
    }
    const f = this.fontCss(m.style.font);
    b.el.textContent = m.text;
    b.el.style.background = m.style.bubble;
    b.el.style.color = m.style.color;
    b.el.style.fontFamily = f.css;
    b.el.style.fontSize = `${13 * (f.scale || 1)}px`;
    b.el.style.setProperty('--bubble', m.style.bubble);
    b.until = performance.now() + 4000 + m.text.length * 120; // 긴 말은 조금 더 오래
    b.el.classList.remove('gone');
  }

  // 매 프레임: 말풍선을 말한 사람 머리 위에 따라 붙이기
  update() {
    const now = performance.now();
    const w = this.viewport.clientWidth, h = this.viewport.clientHeight;
    this.bubbles.forEach((b, id) => {
      if (now > b.until) { b.el.classList.add('gone'); return; }
      const p = this.getSpeaker(id);
      if (!p) return;
      const v = p.clone().project(this.camera);
      const behind = v.z > 1;
      b.el.style.display = behind ? 'none' : '';
      b.el.style.left = `${((v.x + 1) / 2) * w}px`;
      b.el.style.top = `${((1 - v.y) / 2) * h}px`;
    });
  }
}

export const headTop = new THREE.Vector3();
