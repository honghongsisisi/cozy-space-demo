// 친구와 같은 섬에서 만나기 (첫 버전)
// - 섬 주인이 초대 링크를 보내면, 친구가 그 링크로 같은 섬에 들어와요.
// - 서로 걷고 뛰는 모습, 점프·인사, 채팅 말풍선이 보여요.
// - 섬 꾸밈과 시간·날씨는 주인 것만 쓰고, 손님은 구경만 해요.
// - 주인이 섬을 켜 둔 동안에만 들어올 수 있어요 (섬 꾸밈을 주인 화면이 직접 보내 주기 때문).
//
// 주고받는 쪽지 종류 (t):
//   hi    : 들어왔어요 (손님은 섬 꾸밈을 받을 때까지 3초마다 다시 보냄)
//   st    : 내 위치·방향·달리는 중인지 (움직이는 동안 1초에 6번쯤, 가만히 있으면 3초에 한 번)
//   act   : 점프 / 인사
//   chat  : 채팅 한 줄
//   world : 섬 꾸밈·이름·시간·날씨 (주인만 보냄)
//   bye   : 나가요
import * as THREE from 'three';
import { Avatar } from './avatar.js?v=0.26';
import { PRESETS } from './chat.js?v=0.26';
import { openLink, netConfigured } from './net.js?v=0.26';

const ROOM_KEY = 'cozy-space-demo:room';
const NAME_KEY = 'cozy-space-demo:name';

const randId = (n) => {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return [...a].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
};

// 내 섬 번호: 처음 한 번 만들어 이 브라우저에 기억해 둠 (초대 링크에 들어감)
export function myRoomId() {
  try {
    let id = localStorage.getItem(ROOM_KEY);
    if (!id) { id = randId(10); localStorage.setItem(ROOM_KEY, id); }
    return id;
  } catch (e) { return 'nosave'; }
}
export function savedName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
export function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* 무시 */ } }
export function cleanName(n) { return String(n || '').replace(/\s+/g, ' ').trim().slice(0, 10); }
export { netConfigured };

const num = (v, lim = 100) => { v = Number(v); return Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0; };
const r2 = (v) => Math.round(v * 100) / 100;

export class Party {
  constructor({ scene, camera, viewport, avatar, chat, roomId, role, getName, getWorld, onWorld, onPeople, toast }) {
    Object.assign(this, { scene, camera, viewport, avatar, chat, roomId, role, getName, getWorld, onWorld, onPeople, toast });
    this.id = randId(8); // 이 창의 이름표 (창마다 다름)
    this.peers = new Map(); // id → { name, role, av, tag, tx, tz, f, r, last }
    this.link = null;
    this.gotWorld = false;
    this.ownerHere = false;
    this.lastSent = { t: 0, key: '' };
    this.hiT = 0;
    this.worldTimer = null;
    this.layer = document.getElementById('bubble-layer');
    this.myTag = this.makeTag(true);
    this.hookChat();
  }

  get count() { return this.peers.size + 1; }

  start() {
    if (this.link || !netConfigured()) return false;
    this.link = openLink(this.roomId, (m) => this.handle(m), (s) => this.status(s));
    window.addEventListener('pagehide', () => this.leave());
    return true;
  }

  leave() {
    if (!this.link) return;
    this.send({ t: 'bye' });
    this.link.close();
    this.link = null;
  }

  status(s) {
    if (s === 'on') {
      this.connected = true;
      this.sayHi();
    } else if (s === 'error' && !this.warned) {
      this.warned = true;
      this.toast('친구와 연결이 잠깐 끊겼어요. 다시 이어 볼게요');
    }
  }

  send(msg) {
    if (!this.link || !this.connected) return;
    this.link.send({ ...msg, id: this.id, name: this.getName(), role: this.role });
  }

  sayHi() { this.send({ t: 'hi' }); this.sendState(true); }

  sendState(force) {
    const a = this.avatar;
    const s = { t: 'st', x: r2(a.position.x), z: r2(a.position.z), f: r2(a.facing), r: a.running ? 1 : 0 };
    const key = `${s.x},${s.z},${s.f},${s.r}`;
    const now = performance.now();
    if (!force && key === this.lastSent.key && now - this.lastSent.t < 3000) return; // 그대로면 3초에 한 번만
    if (!force && now - this.lastSent.t < 160) return; // 움직여도 1초에 6번까지만
    this.lastSent = { t: now, key };
    this.send(s);
  }

  // 점프·인사를 친구에게도
  act(a) { this.send({ t: 'act', a }); }

  // 섬 주인: 섬이 바뀌면 손님에게 새 모습 보내기 (0.4초 모아서 한 번)
  worldChanged() {
    if (this.role !== 'owner' || !this.peers.size) return;
    clearTimeout(this.worldTimer);
    this.worldTimer = setTimeout(() => this.sendWorld(), 400);
  }
  sendWorld() { if (this.role === 'owner') this.send({ t: 'world', ...this.getWorld() }); }

  // ---- 받은 쪽지 처리 ----
  handle(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || m.id === this.id) return;
    const name = cleanName(m.name) || '이름 없음';
    const role = m.role === 'owner' ? 'owner' : 'guest';
    let p = this.peers.get(m.id);
    if (m.t === 'bye') { if (p) this.removePeer(m.id, true); return; }
    if (!p) {
      p = this.addPeer(m.id, name, role);
      // 새 친구가 오면: 나도 여기 있다고 알려 주고, 주인이면 섬 모습을 보내 줌
      this.sendState(true);
      if (this.role === 'owner') this.sendWorld();
    }
    p.last = performance.now();
    if (p.name !== name) { p.name = name; p.tag.textContent = name; this.peopleChanged(); }
    switch (m.t) {
      case 'hi':
        this.sendState(true);
        if (this.role === 'owner') this.sendWorld();
        break;
      case 'st':
        p.tx = num(m.x, 30); p.tz = num(m.z, 30); p.f = num(m.f, 10); p.r = !!m.r;
        if (!p.placed) { p.av.restore({ x: p.tx, z: p.tz, facing: p.f }); p.placed = true; p.av.root.visible = true; p.tag.style.display = ''; }
        break;
      case 'act':
        if (m.a === 'jump') p.av.jump();
        if (m.a === 'wave') p.av.wave();
        break;
      case 'chat': {
        const text = String(m.text || '').slice(0, 80).trim();
        if (!text) break;
        const pr = PRESETS.find((x) => x.id === m.preset) || PRESETS[0];
        this.chat.receive({ from: m.id, name, text, style: { bubble: pr.bubble, color: pr.color, font: pr.font }, t: Date.now() });
        break;
      }
      case 'world':
        if (this.role === 'guest' && role === 'owner' && Array.isArray(m.items)) {
          const first = !this.gotWorld;
          this.gotWorld = true;
          this.onWorld({
            title: String(m.title || '친구의 섬').slice(0, 20),
            items: m.items.slice(0, 600).map((it) => ({ id: String(it.id || '').slice(0, 40), type: String(it.type || ''), x: num(it.x, 30), z: num(it.z, 30), rot: num(it.rot, 720) })),
            env: m.env && typeof m.env === 'object' ? { time: num(m.env.time, 24), weather: String(m.env.weather || 'clear'), realTime: !!m.env.realTime, flowing: false } : null,
          }, first);
        }
        break;
    }
  }

  addPeer(id, name, role) {
    const av = new Avatar(this.scene);
    av.root.visible = false; // 위치를 받기 전에는 숨김
    const tag = this.makeTag(false, role === 'owner');
    tag.textContent = name;
    tag.style.display = 'none';
    const p = { id, name, role, av, tag, tx: 0, tz: 3, f: 0, r: false, last: performance.now(), placed: false };
    this.peers.set(id, p);
    if (role === 'owner') this.ownerHere = true;
    this.toast(role === 'owner' && this.role === 'guest' ? `${name}님의 섬에 들어왔어요` : `${name}님이 놀러 왔어요`);
    this.peopleChanged();
    return p;
  }

  removePeer(id, said) {
    const p = this.peers.get(id);
    if (!p) return;
    this.scene.remove(p.av.root);
    p.tag.remove();
    this.chat.dropSpeaker && this.chat.dropSpeaker(id);
    this.peers.delete(id);
    if (p.role === 'owner') {
      this.ownerHere = [...this.peers.values()].some((q) => q.role === 'owner');
      if (this.role === 'guest' && !this.ownerHere) this.toast(`섬 주인 ${p.name}님이 섬을 나갔어요`);
    } else {
      this.toast(`${p.name}님이 ${said ? '돌아갔어요' : '보이지 않아요'}`);
    }
    this.peopleChanged();
  }

  peopleChanged() {
    const list = [{ name: this.getName(), role: this.role, me: true }, ...[...this.peers.values()].map((p) => ({ name: p.name, role: p.role }))];
    this.onPeople(list);
  }

  // 채팅: 내 화면에 바로 띄우고(기존 그대로), 친구들에게도 보냄
  hookChat() {
    const t = this.chat.transport;
    const orig = t.send.bind(t);
    t.send = (msg) => { orig(msg); this.send({ t: 'chat', text: msg.text, preset: this.chat.preset }); };
  }

  headOf(id) {
    const p = this.peers.get(id);
    return p && p.placed ? p.av.position.clone().add(new THREE.Vector3(0, 2.15 + p.av.y, 0)) : null;
  }

  makeTag(me, owner) {
    const el = document.createElement('div');
    el.className = 'name-tag' + (me ? ' me' : '') + (owner ? ' owner' : '');
    el.style.display = 'none';
    this.layer.appendChild(el);
    return el;
  }

  placeTag(el, pos) {
    const v = pos.clone().project(this.camera);
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = `${((v.x + 1) / 2) * this.viewport.clientWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * this.viewport.clientHeight}px`;
  }

  // ---- 매 프레임 ----
  update(dt) {
    if (!this.link) return;
    const now = performance.now();
    // 손님: 섬 모습을 받을 때까지 3초마다 "들어왔어요" 다시 말하기 (주인이 나중에 와도 만날 수 있게)
    if (this.role === 'guest' && !this.gotWorld && this.connected && now - this.hiT > 3000) { this.hiT = now; this.send({ t: 'hi' }); }
    if (this.peers.size || this.role === 'guest') this.sendState(false);

    this.peers.forEach((p, id) => {
      if (now - p.last > 10000) { this.removePeer(id, false); return; } // 10초 동안 소식이 없으면 나간 걸로
      if (!p.placed) return;
      const av = p.av, pos = av.position;
      const d = Math.hypot(p.tx - pos.x, p.tz - pos.z);
      if (d > 8) { av.restore({ x: p.tx, z: p.tz, facing: p.f }); av.target = null; }
      else if (d > 0.1) { av.moveTo(p.tx, p.tz); av.running = p.r || d > 2.5; }
      else if (!av.target) {
        // 멈춰 있으면 친구가 보는 방향으로 천천히 몸을 돌림
        let diff = p.f - av.facing; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        av.facing += diff * Math.min(1, dt * 8); av.root.rotation.y = av.facing;
      }
      av.update(dt, { x: 0, y: 0 }, 0, []);
      this.placeTag(p.tag, pos.clone().setY(-0.15));
    });
    // 내 이름표는 친구가 있을 때만
    if (this.peers.size) this.placeTag(this.myTag, this.avatar.position.clone().setY(-0.15));
    else this.myTag.style.display = 'none';
    this.myTag.textContent = this.getName();
  }
}
