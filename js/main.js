import * as THREE from 'three';
import { World, DEFAULT_ITEMS, snap, clampToPlot, newId } from './world.js';
import { Avatar } from './avatar.js';
import { Environment } from './environment.js';
import { ITEMS, ITEM_BY_TYPE, buildItem } from './catalog.js';
import { saveState, loadState, clearState } from './storage.js';

// ---------- 기본 장면 ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

const world = new World(scene);
const avatar = new Avatar(scene);
const env = new Environment(scene, world);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- 카메라 (아바타를 따라다님) ----------
const cam = { yaw: 0, pitch: 0.55, dist: 17, target: new THREE.Vector3(0, 1, 3) };
function updateCamera(dt) {
  const want = avatar.position.clone().add(new THREE.Vector3(0, 1.3, 0));
  cam.target.lerp(want, Math.min(1, dt * 6));
  const cp = Math.cos(cam.pitch);
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * cp * cam.dist,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * cp * cam.dist
  );
  camera.lookAt(cam.target);
}

// ---------- 저장 ----------
let saveTimer = null;
function currentState() {
  return { items: world.serialize(), env: env.serialize(), avatar: avatar.serialize(), cam: { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist } };
}
function saveNow(showToast) {
  const ok = saveState(currentState());
  if (showToast) toast(ok ? '저장했어요 💾' : '이 브라우저에서는 저장할 수 없어요');
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(false), 600);
}
world.onChange(scheduleSave);

const saved = loadState();
if (saved) {
  world.apply({ type: 'replaceAll', items: saved.items || [] }, { silent: true });
  env.restore(saved.env);
  avatar.restore(saved.avatar);
  if (saved.cam) Object.assign(cam, { yaw: saved.cam.yaw, pitch: saved.cam.pitch, dist: saved.cam.dist });
} else {
  world.apply({ type: 'replaceAll', items: DEFAULT_ITEMS }, { silent: true });
}
cam.target.copy(avatar.position).add(new THREE.Vector3(0, 1.3, 0));
window.addEventListener('beforeunload', () => saveNow(false));

// ---------- 키보드 ----------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ') { e.preventDefault(); avatar.jump(); }
  if (k === '1') avatar.wave();
  if (k === 'i') setSide(!sideOpen);
  if (k === 'r') rotateCurrent();
  if (k === 'm' && selectedId) startMove(selectedId);
  if ((k === 'delete' || k === 'backspace') && selectedId) removeSelected();
  if (k === 'escape') {
    if (!help.classList.contains('hidden')) help.classList.add('hidden');
    else if (placing) stopPlacing(true);
    else if (selectedId) select(null);
    else if (sideOpen) setSide(false);
  }
  if (k.startsWith('arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

function moveInput() {
  let x = 0, y = 0;
  if (keys.has('w') || keys.has('arrowup')) y += 1;
  if (keys.has('s') || keys.has('arrowdown')) y -= 1;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  return { x, y };
}

// ---------- 마우스 / 터치 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pointers = new Map();
let drag = null;
let pinchDist = 0;

function setNdc(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function groundPoint(e) {
  setNdc(e);
  const hit = raycaster.intersectObject(world.groundPick, false)[0];
  return hit ? hit.point : null;
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    drag = null;
    return;
  }
  drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist) zoom((pinchDist - d) * 0.05);
    pinchDist = d;
    return;
  }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) {
      cam.yaw -= dx * 0.006;
      cam.pitch = Math.max(0.12, Math.min(1.35, cam.pitch + dy * 0.004));
      drag.x = e.clientX; drag.y = e.clientY;
    }
  }
  if (placing && e.pointerType === 'mouse') updateGhost(e);
});
canvas.addEventListener('pointerup', (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (drag && !drag.moved && drag.button === 0) handleClick(e);
  drag = null;
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY * 0.01); }, { passive: false });
function zoom(d) { cam.dist = Math.max(4, Math.min(32, cam.dist + d)); }

// 땅을 클릭했을 때 생기는 작은 표시
const marker = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
let markerT = 0;

function handleClick(e) {
  if (placing) {
    updateGhost(e);
    placeGhost();
    return;
  }
  if (decorating) {
    setNdc(e);
    const hit = raycaster.intersectObject(world.root, true)[0];
    let id = hit ? world.findItemFromObject(hit.object) : null;
    if (!id) {
      // 물건을 정확히 못 눌러도, 누른 곳 가까이 있는 물건을 골라 줌
      const p = groundPoint(e);
      let best = 1.0;
      if (p) world.items.forEach(({ data }) => {
        const d = Math.hypot(data.x - p.x, data.z - p.z);
        if (d < best) { best = d; id = data.id; }
      });
    }
    select(id);
    return;
  }
  const p = groundPoint(e);
  if (p) {
    const c = clampToPlot(p.x, p.z);
    avatar.moveTo(c.x, c.z);
    marker.position.set(avatar.target.x, 0.03, avatar.target.y);
    marker.visible = true;
    markerT = 1;
  }
}

// ---------- 꾸미기 ----------
const side = document.getElementById('side');
const sideTabs = document.getElementById('side-tabs');
const drawerHint = document.getElementById('drawer-hint');
const btnCancel = document.getElementById('btn-cancel-place');
const itemGrid = document.getElementById('item-grid');
const tools = document.getElementById('item-tools');

let decorating = false;
let placing = null; // { type, rot, movingId, ghost }
let selectedId = null;

ITEMS.forEach((it) => {
  const b = document.createElement('button');
  b.className = 'item-card';
  b.dataset.type = it.type;
  b.innerHTML = `<span class="emoji">${it.emoji}</span><span>${it.name}</span>`;
  b.addEventListener('click', () => startPlacing(it.type));
  itemGrid.appendChild(b);
});

// 서랍이 열려 있고 '가구' 탭일 때만 꾸미기 상태
let sideOpen = false, sideTab = 'furniture';
function setDecorating(on) {
  decorating = on;
  world.grid.visible = on;
  if (!on) { stopPlacing(true); select(null); }
}
function setSide(open, tab = sideTab) {
  sideOpen = open; sideTab = tab;
  side.classList.toggle('open', open);
  sideTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  side.querySelectorAll('.side-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== tab));
  setDecorating(open && tab === 'furniture');
}
document.getElementById('side-handle').addEventListener('click', () => setSide(!sideOpen));
document.getElementById('side-close').addEventListener('click', () => setSide(false));
sideTabs.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (b) setSide(true, b.dataset.tab);
});

function makeGhost(type) {
  const g = buildItem(type);
  g.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.55;
      o.castShadow = false;
    }
  });
  g.visible = false;
  scene.add(g);
  return g;
}

function startPlacing(type, movingId = null, rot = 0) {
  stopPlacing(true);
  select(null);
  placing = { type, rot, movingId, ghost: makeGhost(type) };
  placing.ghost.rotation.y = rot * Math.PI / 4;
  if (movingId) world.items.get(movingId).obj.visible = false;
  drawerHint.textContent = movingId ? '옮길 곳을 클릭하세요 · R 돌리기' : `${ITEM_BY_TYPE[type].name}: 놓을 곳을 클릭하세요 · R 돌리기`;
  btnCancel.classList.remove('hidden');
  itemGrid.querySelectorAll('.item-card').forEach((c) => c.classList.toggle('on', c.dataset.type === type && !movingId));
  // 터치 화면에서는 마우스 따라다니기가 없으니 아바타 앞에 미리 보여 줌
  const fx = avatar.position.x + Math.sin(avatar.facing) * 1.5, fz = avatar.position.z + Math.cos(avatar.facing) * 1.5;
  const c = clampToPlot(snap(fx), snap(fz));
  placing.ghost.position.set(c.x, 0, c.z);
  placing.ghost.visible = true;
}

function stopPlacing(cancel) {
  if (!placing) return;
  if (cancel && placing.movingId && world.items.has(placing.movingId)) world.items.get(placing.movingId).obj.visible = true;
  scene.remove(placing.ghost);
  placing = null;
  drawerHint.textContent = '놓고 싶은 물건을 고르세요';
  btnCancel.classList.add('hidden');
  itemGrid.querySelectorAll('.item-card').forEach((c) => c.classList.remove('on'));
}
btnCancel.addEventListener('click', () => stopPlacing(true));

function updateGhost(e) {
  const p = groundPoint(e);
  if (!p || !placing) return;
  const c = clampToPlot(snap(p.x), snap(p.z));
  placing.ghost.position.set(c.x, 0, c.z);
  placing.ghost.visible = true;
}

function placeGhost() {
  if (!placing || !placing.ghost.visible) return;
  const { x, z } = placing.ghost.position;
  if (placing.movingId) {
    const id = placing.movingId;
    world.apply({ type: 'update', id, patch: { x, z, rot: placing.rot } });
    world.items.get(id).obj.visible = true;
    placing.movingId = null;
    stopPlacing(false);
    select(id);
  } else {
    world.apply({ type: 'add', item: { id: newId(), type: placing.type, x, z, rot: placing.rot } });
    // 같은 물건을 계속 놓을 수 있게 그대로 둠
  }
}

function rotateCurrent() {
  if (placing) {
    placing.rot = (placing.rot + 1) % 8;
    placing.ghost.rotation.y = placing.rot * Math.PI / 4;
  } else if (selectedId) {
    const it = world.items.get(selectedId);
    world.apply({ type: 'update', id: selectedId, patch: { rot: (it.data.rot + 1) % 8 } });
  }
}

// 선택 표시 고리
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
selRing.rotation.x = -Math.PI / 2;
selRing.visible = false;
scene.add(selRing);

function select(id) {
  selectedId = id && world.items.has(id) ? id : null;
  selRing.visible = !!selectedId;
  tools.classList.toggle('hidden', !selectedId);
}
function startMove(id) {
  const it = world.items.get(id);
  startPlacing(it.data.type, id, it.data.rot);
}
function removeSelected() {
  if (!selectedId) return;
  world.apply({ type: 'remove', id: selectedId });
  select(null);
  toast('치웠어요');
}
tools.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.tool === 'rotate') rotateCurrent();
  if (t.dataset.tool === 'move') startMove(selectedId);
  if (t.dataset.tool === 'remove') removeSelected();
});

function updateTools() {
  if (!selectedId) return;
  const it = world.items.get(selectedId);
  if (!it) return select(null);
  const r = Math.max(0.6, ITEM_BY_TYPE[it.data.type].radius + 0.3);
  selRing.scale.setScalar(r / 0.7);
  selRing.position.set(it.data.x, 0.03, it.data.z);
  const v = new THREE.Vector3(it.data.x, 2.6, it.data.z).project(camera);
  tools.style.left = ((v.x + 1) / 2) * window.innerWidth + 'px';
  tools.style.top = ((1 - v.y) / 2) * window.innerHeight + 'px';
}

// ---------- 시간·날씨 버튼 ----------
const timeSeg = document.getElementById('time-seg');
const weatherSeg = document.getElementById('weather-seg');
const timeFlow = document.getElementById('time-flow');
function refreshEnvButtons() {
  timeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', !env.flowing && Math.abs(env.time - parseFloat(b.dataset.time)) < 0.01));
  weatherSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', env.weather === b.dataset.weather));
  timeFlow.checked = env.flowing;
}
timeSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  env.flowing = false;
  env.setTime(parseFloat(b.dataset.time));
  refreshEnvButtons(); scheduleSave();
});
weatherSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  env.setWeather(b.dataset.weather);
  refreshEnvButtons(); scheduleSave();
});
timeFlow.addEventListener('change', () => { env.flowing = timeFlow.checked; refreshEnvButtons(); scheduleSave(); });
refreshEnvButtons();

// ---------- 기타 버튼 ----------
document.getElementById('btn-wave').addEventListener('click', () => avatar.wave());
document.getElementById('btn-save').addEventListener('click', () => saveNow(true));

const btnReset = document.getElementById('btn-reset');
let resetArmed = null;
btnReset.addEventListener('click', () => {
  if (!resetArmed) {
    btnReset.textContent = '정말 처음으로? 한 번 더 누르기';
    resetArmed = setTimeout(() => { resetArmed = null; btnReset.textContent = '↺ 처음으로'; }, 3000);
    return;
  }
  clearTimeout(resetArmed); resetArmed = null;
  btnReset.textContent = '↺ 처음으로';
  stopPlacing(true); select(null);
  clearState();
  world.apply({ type: 'replaceAll', items: DEFAULT_ITEMS.map((i) => ({ ...i, id: newId() })) });
  avatar.restore({ x: 0, z: 3, facing: 0 });
  toast('처음 모습으로 돌아왔어요');
});

const help = document.getElementById('help');
document.getElementById('btn-help').addEventListener('click', () => help.classList.remove('hidden'));
document.getElementById('btn-help-close').addEventListener('click', () => {
  help.classList.add('hidden');
  try { localStorage.setItem('cozy-space-demo:helped', '1'); } catch (e) { /* 무시 */ }
});
try { if (!localStorage.getItem('cozy-space-demo:helped')) help.classList.remove('hidden'); } catch (e) { help.classList.remove('hidden'); }

const toastEl = document.getElementById('toast');
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1800);
}

// ---------- 사진 ----------
const photoModal = document.getElementById('photo-modal');
const photoImg = document.getElementById('photo-img');
const photoDl = document.getElementById('photo-download');
const flash = document.getElementById('flash');

document.getElementById('btn-photo').addEventListener('click', takePhoto);
document.getElementById('photo-close').addEventListener('click', () => photoModal.classList.add('hidden'));

function takePhoto() {
  // 선택 표시 같은 꾸미기 도구는 사진에서 빼기
  const hidden = [selRing, marker, world.grid, placing && placing.ghost].filter((o) => o && o.visible);
  hidden.forEach((o) => (o.visible = false));
  renderer.render(scene, camera);
  const shot = canvas.toDataURL('image/png');
  hidden.forEach((o) => (o.visible = true));

  const img = new Image();
  img.onload = () => {
    // 폴라로이드처럼 흰 테두리 + 날짜
    const pad = Math.round(img.width * 0.025), bottom = Math.round(img.width * 0.07);
    const c = document.createElement('canvas');
    c.width = img.width + pad * 2;
    c.height = img.height + pad + bottom;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fffaf2';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, pad, pad);
    const d = new Date();
    const stamp = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    ctx.fillStyle = '#9a8a7a';
    ctx.font = `${Math.round(bottom * 0.36)}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('🌱 나의 작은 마당', pad, img.height + pad + bottom / 2);
    ctx.textAlign = 'right';
    ctx.fillText(stamp, c.width - pad, img.height + pad + bottom / 2);
    const url = c.toDataURL('image/png');
    photoImg.src = url;
    photoDl.href = url;
    photoDl.download = `마당사진_${stamp.replace(/\./g, '')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.png`;
    photoModal.classList.remove('hidden');
  };
  img.src = shot;
  flash.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove('on')));
}

// ---------- 매 프레임 ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (keys.has('q')) cam.yaw += dt * 1.8;
  if (keys.has('e')) cam.yaw -= dt * 1.8;
  const typing = !help.classList.contains('hidden');
  avatar.update(dt, typing ? { x: 0, y: 0 } : moveInput(), cam.yaw, world.colliders());
  world.update(dt);
  updateCamera(dt);
  env.update(dt, avatar.position);
  if (env.flowing) refreshEnvButtons();
  if (markerT > 0) {
    markerT -= dt * 1.5;
    marker.material.opacity = Math.max(0, markerT);
    marker.scale.setScalar(1 + (1 - markerT) * 0.6);
    if (markerT <= 0 || !avatar.target) marker.visible = false;
  }
  updateTools();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
document.getElementById('loading').classList.add('done');

// 디버그·테스트용 (나중에 멀티 기능을 붙일 때도 이 통로를 씁니다)
window.cozy = { world, avatar, env, cam, saveNow };
