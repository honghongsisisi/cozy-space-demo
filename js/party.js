// 친구와 같은 섬에서 만나기 (첫 버전)
// - 섬 주인이 초대 링크를 보내면, 친구가 그 링크로 같은 섬에 들어와요.
// - 서로 걷고 뛰는 모습, 점프·인사, 채팅 말풍선이 보여요.
// - 섬 꾸밈과 시간·날씨는 주인 것만 쓰고, 손님은 구경만 해요.
// - v0.42부터 주인이 없어도 서버에 저장된 섬을 구경해요. 주인이 켜 두면 주인 화면이 보내 주는 지금 모습으로 바뀌어요.
//
// 주고받는 쪽지 종류 (t):
//   hi    : 들어왔어요 (손님은 섬 꾸밈을 받을 때까지 3초마다 다시 보냄)
//   st    : 내 위치·방향·달리는 중인지 (움직이는 동안 1초에 6번쯤, 가만히 있으면 3초에 한 번)
//   act   : 점프 / 인사
//   chat  : 채팅 한 줄
//   world : 섬 꾸밈·이름·시간·날씨 (주인만 보냄)
//   bye   : 나가요
import * as THREE from 'three';
import { Avatar } from './avatar.js?v=0.43';
import { PRESETS } from './chat.js?v=0.43';
import { openLink, netConfigured } from './net.js?v=0.43';

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
  constructor({ scene, camera, viewport, avatar, chat, roomId, role, ghost, getName, getRoom, getWorld, getInside, view, onWorld, onPeople, toast }) {
    Object.assign(this, { scene, camera, viewport, avatar, chat, roomId, role, getName, getWorld, onWorld, onPeople, toast });
    this.ghost = !!ghost; // 가입하지 않은 손님(유령)인지. 친구 화면에도 유령 모습으로 보여요
    this.getInside = getInside || (() => false); // 내가 집 안에 있는지
    this.getRoom = getRoom || (() => ''); // 내 섬 번호 (친구 신청·놀러 가기에 씀. 유령은 없음)
    // 친구 자리(친구 기준)를 내 화면 자리로 바꾸기. null이면 안 보임 (친구는 집 안, 나는 마당 → 지붕에 가려짐)
    this.view = view || ((x, z, f, pin) => (pin === this.getInside() ? { x, z, f } : null));
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
  }

  get count() { return this.peers.size + 1; }

  start() {
    if (this.link || !netConfigured()) return false;
    this.link = openLink(this.roomId, (m) => this.handle(m), (s) => this.status(s));
    if (!Party.hooked) { Party.hooked = true; window.addEventListener('pagehide', () => Party.current && Party.current.leave()); }
    Party.current = this;
    return true;
  }

  leave() {
    if (!this.link) return;
    this.send({ t: 'bye' });
    this.link.close();
    this.link = null;
  }

  // 다른 공간으로 옮겨 갈 때: 연결을 끊고 친구 캐릭터·이름표를 모두 치움 (알림 없이)
  dispose() {
    this.leave();
    clearTimeout(this.worldTimer);
    this.peers.forEach((p) => { this.scene.remove(p.av.root); p.tag.remove(); this.chat.dropSpeaker(p.id); });
    this.peers.clear();
    this.myTag.remove();
    this.disposed = true;
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
    this.link.send({ ...msg, id: this.id, name: this.getName(), role: this.role, g: this.ghost ? 1 : 0, rm: this.ghost ? '' : this.getRoom() });
  }

  sayHi() { this.send({ t: 'hi' }); this.sendState(true); }

  sendState(force) {
    const a = this.avatar;
    const s = { t: 'st', x: r2(a.position.x), z: r2(a.position.z), f: r2(a.facing), r: a.running ? 1 : 0, s: this.getInside() ? 1 : 0 };
    const key = `${s.x},${s.z},${s.f},${s.r},${s.s}`;
    const now = performance.now();
    if (!force && key === this.lastSent.key && now - this.lastSent.t < 3000) return; // 그대로면 3초에 한 번만
    if (!force && now - this.lastSent.t < 160) return; // 움직여도 1초에 6번까지만
    this.lastSent = { t: now, key };
    this.send(s);
  }

  // 내가 집에 들어가거나 나와서 '내 화면 자리'가 바뀌면, 친구들을 새 자리로 바로 옮겨 놓음
  frameChanged() { this.peers.forEach((p) => { p.jumpNext = true; }); }

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
    const role = m.role === 'owner' ? 'owner' : m.role === 'visitor' ? 'visitor' : 'guest';
    let p = this.peers.get(m.id);
    if (m.t === 'bye') { if (p) this.removePeer(m.id, true); return; }
    if (!p) {
      p = this.addPeer(m.id, name, role);
      // 새 친구가 오면: 나도 여기 있다고 알려 주고, 주인이면 섬 모습을 보내 줌
      this.sendState(true);
      if (this.role === 'owner') this.sendWorld();
    }
    p.last = performance.now();
    if (!!m.g !== p.ghost) { p.ghost = !!m.g; p.av.setGhost(p.ghost); this.peopleChanged(); }
    if (p.name !== name) { p.name = name; p.tag.textContent = name; this.peopleChanged(); }
    const rm = typeof m.rm === 'string' && /^[a-z0-9]{1,16}$/.test(m.rm) && !m.g ? m.rm : '';
    if (rm !== p.room) { p.room = rm; this.peopleChanged(); }
    switch (m.t) {
      case 'hi':
        this.sendState(true);
        if (this.role === 'owner') this.sendWorld();
        break;
      case 'st':
        p.tx = num(m.x, 30); p.tz = num(m.z, 30); p.f = num(m.f, 10); p.r = !!m.r;
        p.inside = !!m.s;
        if (!p.placed) { p.placed = true; p.jumpNext = true; }
        break;
      case 'act':
        if (m.a === 'jump') p.av.jump();
        if (m.a === 'wave') p.av.wave();
        break;
      case 'chat': {
        if (p.ghost) break; // 유령은 말할 수 없어요
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
          const clean = (list) => (Array.isArray(list) ? list : []).slice(0, 600).map((it) => ({ id: String(it.id || '').slice(0, 40), type: String(it.type || ''), x: num(it.x, 30), z: num(it.z, 30), rot: num(it.rot, 720) }));
          this.onWorld({
            title: String(m.title || '친구의 섬').slice(0, 20),
            items: clean(m.items),
            house: clean(m.house),
            env: m.env && typeof m.env === 'object' ? { time: num(m.env.time, 24), weather: String(m.env.weather || 'clear'), realTime: !!m.env.realTime, flowing: false } : null,
            ghosts: m.ghosts !== false, // 섬 주인이 유령 손님을 받는지 (v0.42)
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
    const p = { id, name, role, av, tag, tx: 0, tz: 3, f: 0, r: false, last: performance.now(), placed: false, inside: false, ghost: false, room: '' };
    this.peers.set(id, p);
    if (role === 'owner') this.ownerHere = true;
    if (this.role !== 'visitor' || this.peers.size < 8) this.toast(this.role === 'visitor' ? `${name}님이 광장에 왔어요` : role === 'owner' && this.role === 'guest' ? `섬 주인 ${name}님이 여기 있어요` : `${name}님이 놀러 왔어요`);
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
      if (this.role !== 'visitor' || this.peers.size < 8) this.toast(`${p.name}님이 ${said ? '돌아갔어요' : '보이지 않아요'}`); // 광장이 붐비면 알림은 줄임
    }
    this.peopleChanged();
  }

  peopleChanged() {
    const list = [{ name: this.getName(), role: this.role, me: true, ghost: this.ghost }, ...[...this.peers.values()].map((p) => ({ id: p.id, name: p.name, role: p.role, ghost: p.ghost, room: p.room }))];
    this.onPeople(list);
  }

  // 채팅: 내 화면에는 원래대로 뜨고, 같은 공간 사람들에게도 보냄 (main.js에서 불러 줌)
  sendChat(msg) { this.send({ t: 'chat', text: msg.text, preset: this.chat.preset }); }

  // 화면을 누른 자리에 있는 친구 캐릭터 (없으면 null)
  pickPeer(raycaster) {
    let best = null, bestD = Infinity;
    this.peers.forEach((p) => {
      if (!p.placed || !p.av.root.visible) return;
      const hit = raycaster.intersectObject(p.av.root, true)[0];
      if (hit && hit.distance < bestD) { best = p; bestD = hit.distance; }
    });
    return best;
  }

  headOf(id) {
    const p = this.peers.get(id);
    return p && p.placed && p.av.root.visible ? p.av.position.clone().add(new THREE.Vector3(0, 2.15 + p.av.y, 0)) : null;
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
      // 나와 다른 곳(집 안 / 마당)에 있는 친구는 안 보이게
      const v = this.view(p.tx, p.tz, p.f, p.inside);
      if (!v) { av.root.visible = false; p.tag.style.display = 'none'; p.jumpNext = true; return; }
      const tx = v.x, tz = v.z, tf = v.f;
      if (p.jumpNext) { av.restore({ x: tx, z: tz, facing: tf }); av.target = null; p.jumpNext = false; }
      av.root.visible = true;
      const d = Math.hypot(tx - pos.x, tz - pos.z);
      if (d > 8) { av.restore({ x: tx, z: tz, facing: tf }); av.target = null; }
      else if (d > 0.1) { av.moveTo(tx, tz); av.running = p.r || d > 2.5; }
      else if (!av.target) {
        // 멈춰 있으면 친구가 보는 방향으로 천천히 몸을 돌림
        let diff = tf - av.facing; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
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
