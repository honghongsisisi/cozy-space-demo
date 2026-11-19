// 채팅: 지금은 '혼자 써보기'. 메시지는 send → transport → receive 순서로 흐릅니다.
// 2단계(친구와 함께)에서는 transport만 서버로 바꾸면, 남이 보낸 메시지도 같은 receive로 들어와
// 그 사람 캐릭터 머리 위에 말풍선이 뜨게 됩니다.
import * as THREE from 'three';

const PREF_KEY = 'cozy-space-demo:chat';

// 눈이 편한 말풍선 색 / 글자 색
export const BUBBLE_COLORS = ['#fffdf7', '#fbe9ea', '#eef4e6', '#e8f0fa', '#f1ebfa', '#fdf3dc'];
export const TEXT_COLORS = ['#4a4458', '#6b4f3f', '#3f5e4a', '#3f5170', '#7a4a66'];
// 글씨체: 모두 SIL 오픈 폰트 라이선스(OFL) — 무료, 상업적 사용 가능 (Google Fonts에서 불러옴)
export const FONTS = [
  { id: 'basic', name: '기본', css: '"Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif' },
  { id: 'gowun', name: '고운돋움', css: '"Gowun Dodum", sans-serif' },
  { id: 'jua', name: '주아', css: '"Jua", sans-serif' },
  { id: 'pen', name: '손글씨', css: '"Nanum Pen Script", cursive', scale: 1.45 },
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
    this.style = { bubble: BUBBLE_COLORS[0], color: TEXT_COLORS[0], font: 'basic' };
    this.logVisible = true;
    try { Object.assign(this, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* 무시 */ }
    this.log = document.getElementById('chat-log');
    this.layer = document.getElementById('bubble-layer');
  }

  savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ style: this.style, logVisible: this.logVisible })); } catch (e) { /* 무시 */ }
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
