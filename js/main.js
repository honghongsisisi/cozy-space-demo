import * as THREE from 'three';
import { World, DEFAULT_ITEMS, snap, clampToPlot, newId } from './world.js?v=0.17';
import { Avatar } from './avatar.js?v=0.17';
import { Environment } from './environment.js?v=0.17';
import { ITEMS, ITEM_BY_TYPE, ITEM_GROUPS, buildItem } from './catalog.js?v=0.17';
import { saveState, loadState } from './storage.js?v=0.17';
import { Sound } from './sound.js?v=0.17';
import { Chat, PRESETS, FONTS } from './chat.js?v=0.17';
import { fmt } from './realtime.js?v=0.17';
import { icon, fillIcons } from './icons.js?v=0.17';
import { makeThumbnails } from './thumbs.js?v=0.17';

fillIcons(); // HTML 속 <i data-icon> 자리에 선 아이콘 넣기

// ---------- 기본 장면 ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // radius로 부드럽게 퍼지는 방식

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

const world = new World(scene);
const avatar = new Avatar(scene);
const env = new Environment(scene, world);

const viewport = document.getElementById('viewport');
function resize() {
  const w = Math.max(1, viewport.clientWidth), h = Math.max(1, viewport.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
// 창이 펼쳐지거나 접혀서 3D 화면 크기가 바뀌면 다시 맞춤
new ResizeObserver(resize).observe(viewport);
resize();

// ---------- 카메라 (아바타를 따라다님) ----------
const cam = { yaw: 0, pitch: 0.5, dist: 19, target: new THREE.Vector3(0, 1, 3) };
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
  // 아이템 창이 3D 화면 오른쪽을 가리는 동안, 보이는 왼쪽 부분 가운데에 캐릭터가 오도록 화면만 살짝 옆으로 밀기
  // (카메라를 움직이는 게 아니라 '그림을 그리는 자리'만 옮겨서 어지럽지 않음)
  const want2 = panelOpen && window.innerWidth > 900 ? panel.offsetWidth / 2 : 0;
  viewShift += (want2 - viewShift) * Math.min(1, dt * 5);
  const w = Math.max(1, viewport.clientWidth), h = Math.max(1, viewport.clientHeight);
  if (Math.abs(viewShift) > 0.5) camera.setViewOffset(w, h, viewShift, 0, w, h);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
}
let viewShift = 0;

// ---------- 저장 ----------
let saveTimer = null;
function currentState() {
  return { title: roomTitle, items: world.serialize(), env: env.serialize(), avatar: avatar.serialize(), cam: { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist } };
}
function saveNow(showToast) {
  const ok = saveState(currentState());
  if (showToast) toast(ok ? '저장했어요' : '이 브라우저에서는 저장할 수 없어요');
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(false), 600);
}
world.onChange(scheduleSave);

let roomTitle = '나의 작은 섬';
const saved = loadState();
if (saved) {
  if (saved.title) roomTitle = saved.title;
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
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
let lastTap = { key: null, t: 0 };
let lastClick = { x: 0, y: 0, t: 0 };
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  // 같은 이동 키를 빠르게 두 번 누르면 달리기
  if (MOVE_KEYS.has(k) && !e.repeat) {
    const now = performance.now();
    if (lastTap.key === k && now - lastTap.t < 350) avatar.running = true;
    lastTap = { key: k, t: now };
  }
  // 되돌리기 / 다시 하기 (윈도 Ctrl, 맥 Cmd)
  if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
    e.preventDefault();
    if (k === 'y' || e.shiftKey) redo(); else undo();
    return;
  }
  if (e.ctrlKey || e.metaKey) return; // 다른 단축키(새로 고침 등)는 브라우저에 맡김
  keys.add(k);
  if (k === ' ') { e.preventDefault(); avatar.jump(); }
  if (k === '1') avatar.wave();
  if (k === 'i') openPanel(panelOpen && currentPane === 'furniture' ? null : 'furniture');
  if (k === 'r') rotateCurrent(e.shiftKey ? 45 : 15);
  if (k === 'm' && selectedId) startMove(selectedId);
  if ((k === 'delete' || k === 'backspace') && selectedId) removeSelected();
  if (k === 'escape') {
    if (!help.classList.contains('hidden')) help.classList.add('hidden');
    else if (placing) stopPlacing(true);
    else if (selectedId) select(null);
    else if (panelOpen) openPanel(null);
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
  else if (!drag && e.pointerType === 'mouse') updateHover(e);
  lastShift = e.shiftKey;
});
canvas.addEventListener('pointerup', (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (drag && !drag.moved && drag.button === 0) handleClick(e);
  drag = null;
});
canvas.addEventListener('pointerleave', () => setHover(null));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY * 0.01); }, { passive: false });
function zoom(d) { cam.dist = Math.max(4, Math.min(32, cam.dist + d)); }

// 땅을 클릭했을 때 생기는 작은 표시
// 도착할 때까지 은은하게 남아 있다가, 도착하면 천천히 사라짐
const marker = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.46, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
let markerT = 0;

// 마우스 아래 있는 물건 찾기. 정확히 못 눌러도 누른 곳 가까이 있는 물건을 골라 줌
function pickItem(e) {
  setNdc(e);
  const hit = raycaster.intersectObject(world.root, true)[0];
  let id = hit ? world.findItemFromObject(hit.object) : null;
  if (!id) {
    const p = groundPoint(e);
    let best = 1.0;
    if (p) world.items.forEach(({ data }) => {
      const d = Math.hypot(data.x - p.x, data.z - p.z);
      if (d < best) { best = d; id = data.id; }
    });
  }
  return id;
}

function handleClick(e) {
  if (placing) {
    updateGhost(e);
    placeGhost();
    return;
  }
  if (decorating) {
    select(pickItem(e));
    return;
  }
  const p = groundPoint(e);
  if (p) {
    const c = clampToPlot(p.x, p.z);
    // 땅을 빠르게 두 번 클릭하면 달려감
    const now = performance.now();
    avatar.running = now - lastClick.t < 350 && Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 40;
    lastClick = { x: e.clientX, y: e.clientY, t: now };
    avatar.moveTo(c.x, c.z);
    marker.position.set(avatar.target.x, 0.03, avatar.target.y);
    marker.visible = true;
    markerT = 1;
  }
}

// ---------- 되돌리기 / 다시 하기 ----------
// 원리: 물건을 바꿀 때마다 '거꾸로 되돌리는 방법'을 함께 적어 둡니다.
// 놓기 ↔ 치우기, 옮기기 ↔ 원래 자리로, 처음 모습으로 ↔ 그 전 모습 전체.
const undoStack = [], redoStack = [];
function inverseOf(a) {
  if (a.type === 'add') return { type: 'remove', id: a.item.id };
  if (a.type === 'remove') return { type: 'add', item: { ...world.items.get(a.id).data } };
  if (a.type === 'update') {
    const old = world.items.get(a.id).data, back = {};
    Object.keys(a.patch).forEach((k) => { back[k] = old[k]; });
    return { type: 'update', id: a.id, patch: back };
  }
  if (a.type === 'replaceAll') return { type: 'replaceAll', items: world.serialize() };
  return null;
}
function doAction(a, label) {
  const inv = inverseOf(a);
  world.apply(a);
  if (inv) { undoStack.push({ a, inv, label }); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
  refreshHistory();
}
function undo() {
  if (role === 'guest') return;
  const h = undoStack.pop();
  if (!h) return toast('되돌릴 것이 없어요');
  stopPlacing(true); select(null);
  world.apply(h.inv);
  redoStack.push(h);
  refreshHistory();
  toast(`되돌렸어요 (${h.label})`);
}
function redo() {
  if (role === 'guest') return;
  const h = redoStack.pop();
  if (!h) return toast('다시 할 것이 없어요');
  stopPlacing(true); select(null);
  h.inv = inverseOf(h.a);
  world.apply(h.a);
  undoStack.push(h);
  refreshHistory();
  toast(`다시 했어요 (${h.label})`);
}
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
function refreshHistory() {
  btnUndo.disabled = !undoStack.length;
  btnRedo.disabled = !redoStack.length;
}
btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);
refreshHistory();

let role = 'owner'; // 주인(owner) / 손님(guest). 아래 '주인 / 손님' 부분 참고

// ---------- 꾸미기 ----------
const drawerHint = document.getElementById('drawer-hint');
const btnCancel = document.getElementById('btn-cancel-place');
const folders = document.getElementById('item-folders');
const tools = document.getElementById('item-tools');

let decorating = false;
let placing = null; // { type, rot, movingId, ghost }
let selectedId = null;
let gridOn = false;   // 격자 보이기 (배치는 격자와 상관없이 자유)
let lastShift = false;

// 격자 켜기/끄기 (창 아래쪽 작은 스위치)
const gridToggle = document.getElementById('grid-toggle');
function refreshGridBtn() { gridToggle.checked = gridOn; world.grid.visible = decorating && gridOn; }
gridToggle.addEventListener('change', () => { gridOn = gridToggle.checked; refreshGridBtn(); });

// 분류 폴더별로 물건 카드 만들기
const THUMBS = makeThumbnails(ITEMS.map((it) => it.type)); // 게임 속 모양 그대로 찍은 카드 그림
ITEM_GROUPS.forEach((g) => {
  const list = ITEMS.filter((it) => it.group === g.id);
  const f = document.createElement('div');
  f.className = 'folder';
  f.innerHTML = `<div class="folder-head" title="눌러서 접기/펴기">${icon('folder')}${g.name} <span class="count">${list.length}</span>${icon('chevron', 'chev')}</div><div class="item-grid"></div>`;
  f.querySelector('.folder-head').addEventListener('click', () => f.classList.toggle('closed'));
  const grid = f.querySelector('.item-grid');
  list.forEach((it) => {
    const b = document.createElement('button');
    b.className = 'item-card';
    b.dataset.type = it.type;
    b.title = it.name;
    b.innerHTML = THUMBS[it.type] ? `<img class="thumb" alt="" src="${THUMBS[it.type]}"><span>${it.name}</span>` : `<span class="thumb"></span><span>${it.name}</span>`;
    b.addEventListener('click', () => startPlacing(it.type));
    grid.appendChild(b);
  });
  folders.appendChild(f);
});

function setDecorating(on) {
  decorating = on;
  refreshGridBtn();
  if (!on) { stopPlacing(true); select(null); setHover(null); }
}

// ---------- 오른쪽 메뉴와 펼쳐지는 창 ----------
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panel-title');
const rail = document.getElementById('rail');
const railSub = document.getElementById('rail-sub');
const PANES = {
  space: '내 공간', friends: '친구', manage: '관리',
  furniture: '아이템 · 가구', closet: '아이템 · 옷장', shop: '아이템 · 상점',
};
let panelOpen = false, currentPane = null;
function openPanel(pane) {
  if (pane === 'furniture' && role === 'guest') { toast('꾸미기는 섬 주인만 할 수 있어요'); return; }
  panelOpen = !!pane; currentPane = pane;
  panel.classList.toggle('closed', !pane); // 3D 화면은 그대로, 창만 살며시 나타나고 사라짐
  if (pane) {
    panelTitle.textContent = PANES[pane];
    panel.querySelectorAll('.pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== pane));
    if (pane === 'space') refreshSpaceInfo();
  }
  const isItem = ['furniture', 'closet', 'shop'].includes(pane);
  rail.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('on', b.dataset.cat === pane || (b.dataset.cat === 'items' && isItem)));
  rail.querySelector('.rail-group').classList.toggle('open', isItem);
  railSub.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.sub === pane));
  setDecorating(pane === 'furniture');
}
rail.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  let pane = b.dataset.sub || b.dataset.cat;
  if (pane === 'items') pane = 'furniture';
  // 같은 메뉴를 다시 누르면 접힘
  if (panelOpen && (pane === currentPane || (b.dataset.cat === 'items' && ['furniture', 'closet', 'shop'].includes(currentPane)))) openPanel(null);
  else openPanel(pane);
});
document.getElementById('panel-close').addEventListener('click', () => openPanel(null));

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
  placing.ghost.rotation.y = rot * Math.PI / 180;
  if (movingId) world.items.get(movingId).obj.visible = false;
  drawerHint.textContent = movingId ? '옮길 곳을 클릭하세요' : `${ITEM_BY_TYPE[type].name}: 놓을 곳을 클릭하세요`;
  btnCancel.classList.remove('hidden');
  folders.querySelectorAll('.item-card').forEach((c) => c.classList.toggle('on', c.dataset.type === type && !movingId));
  // 터치 화면에서는 마우스 따라다니기가 없으니 아바타 앞에 미리 보여 줌
  const fx = avatar.position.x + Math.sin(avatar.facing) * 1.5, fz = avatar.position.z + Math.cos(avatar.facing) * 1.5;
  const c = clampToPlot(fx, fz);
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
  folders.querySelectorAll('.item-card').forEach((c) => c.classList.remove('on'));
}
btnCancel.addEventListener('click', () => stopPlacing(true));

function updateGhost(e) {
  const p = groundPoint(e);
  if (!p || !placing) return;
  // 기본은 어디든 자유롭게. Shift를 누르고 있을 때만 격자 칸에 맞춤
  const c = e.shiftKey ? clampToPlot(snap(p.x), snap(p.z)) : clampToPlot(p.x, p.z);
  placing.ghost.position.set(c.x, 0, c.z);
  placing.ghost.visible = true;
}

function placeGhost() {
  if (!placing || !placing.ghost.visible) return;
  const { x, z } = placing.ghost.position;
  if (placing.movingId) {
    const id = placing.movingId;
    world.items.get(id).obj.visible = true;
    doAction({ type: 'update', id, patch: { x, z, rot: placing.rot } }, '옮기기');
    placing.movingId = null;
    stopPlacing(false);
    select(id);
  } else {
    doAction({ type: 'add', item: { id: newId(), type: placing.type, x, z, rot: placing.rot } }, `${ITEM_BY_TYPE[placing.type].name} 놓기`);
    // 같은 물건을 계속 놓을 수 있게 그대로 둠
  }
}

// 돌리기: R은 15도씩, Shift+R은 45도씩
function rotateCurrent(step = 15) {
  if (placing) {
    placing.rot = (placing.rot + step) % 360;
    placing.ghost.rotation.y = placing.rot * Math.PI / 180;
  } else if (selectedId) {
    const it = world.items.get(selectedId);
    doAction({ type: 'update', id: selectedId, patch: { rot: (it.data.rot + step) % 360 } }, '돌리기');
  }
}

// 선택 표시 고리
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
selRing.rotation.x = -Math.PI / 2;
selRing.visible = false;
scene.add(selRing);

// 마우스를 올린 물건 아래에 옅은 고리 (꾸미기 중에만, 누를 수 있다는 표시)
const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
hoverRing.rotation.x = -Math.PI / 2;
hoverRing.visible = false;
scene.add(hoverRing);
let hoverId = null;
function setHover(id) {
  hoverId = id && id !== selectedId ? id : null;
  hoverRing.visible = !!hoverId;
  canvas.classList.toggle('can-pick', !!id);
  if (hoverId) {
    const it = world.items.get(hoverId);
    const r = Math.max(0.6, ITEM_BY_TYPE[it.data.type].radius + 0.3);
    hoverRing.scale.setScalar(r / 0.72);
    hoverRing.position.set(it.data.x, 0.025, it.data.z);
  }
}
function updateHover(e) { setHover(decorating && !placing ? pickItem(e) : null); }

function select(id) {
  selectedId = id && world.items.has(id) ? id : null;
  selRing.visible = !!selectedId;
  tools.classList.toggle('hidden', !selectedId);
  if (selectedId && hoverId === selectedId) setHover(null);
}
function startMove(id) {
  const it = world.items.get(id);
  startPlacing(it.data.type, id, it.data.rot);
}
function removeSelected() {
  if (!selectedId) return;
  doAction({ type: 'remove', id: selectedId }, '치우기');
  select(null);
  toast('치웠어요 · Ctrl+Z로 되돌릴 수 있어요');
}
tools.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.tool === 'rotate') rotateCurrent(e.shiftKey ? 45 : 15);
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
  tools.style.left = ((v.x + 1) / 2) * viewport.clientWidth + 'px';
  tools.style.top = ((1 - v.y) / 2) * viewport.clientHeight + 'px';
}

// ---------- 시간·날씨 버튼 ----------
const timeSeg = document.getElementById('time-seg');
const weatherSeg = document.getElementById('weather-seg');
const timeFlow = document.getElementById('time-flow');
const timeFlowLabel = document.getElementById('time-flow-label');
function refreshEnvButtons() {
  timeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on',
    b.dataset.time === 'real' ? env.realTime : (!env.realTime && !env.flowing && Math.abs(env.time - parseFloat(b.dataset.time)) < 0.01)));
  // 현재 시간일 때: 버튼에는 '골랐다' 표시만. '시간이 흐르게'는 자리는 그대로 두고 흐리게만
  timeFlowLabel.classList.toggle('dim', env.realTime);
  timeFlow.disabled = env.realTime || role === 'guest';
  timeFlowLabel.title = env.realTime ? '현재 시간을 쓰는 동안에는 저절로 흘러요' : '';
  weatherSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', env.weather === b.dataset.weather));
  timeFlow.checked = env.flowing;
}
timeSeg.addEventListener('click', (e) => {
  if (role === 'guest') return;
  const b = e.target.closest('button'); if (!b) return;
  env.flowing = false;
  if (b.dataset.time === 'real') { env.realTime = true; env.update(0, avatar.position); }
  else { env.realTime = false; env.setTime(parseFloat(b.dataset.time)); }
  refreshEnvButtons(); scheduleSave();
});
weatherSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  env.setWeather(b.dataset.weather);
  refreshEnvButtons(); scheduleSave();
});
timeFlow.addEventListener('change', () => { env.flowing = timeFlow.checked; if (env.flowing) env.realTime = false; refreshEnvButtons(); scheduleSave(); });
refreshEnvButtons();

// ---------- 주인 / 손님 ----------
// 규칙: 섬의 시간·날씨·꾸미기는 주인(방장)이 정하고, 놀러 온 손님은 바꿀 수 없음.
// 지금은 언제나 주인. 나중에 방문 기능을 만들면 친구 섬에 들어갈 때 setRole('guest')만 부르면 됨.
function setRole(r) {
  role = r;
  const guest = r === 'guest';
  document.querySelectorAll('#env-panel button, #env-panel input').forEach((el) => { el.disabled = guest; });
  document.getElementById('env-panel').title = guest ? '시간과 날씨는 섬 주인이 정해요' : '';
  document.querySelectorAll('.rail-sub [data-sub="furniture"], #btn-reset, #btn-title-edit, #btn-undo, #btn-redo').forEach((el) => { el.disabled = guest; });
  if (!guest) refreshHistory();
  refreshEnvButtons();
  if (guest && currentPane === 'furniture') openPanel(null);
}
setRole(role);

// ---------- 기타 버튼 ----------
document.getElementById('btn-wave').addEventListener('click', () => avatar.wave());
document.getElementById('btn-jump').addEventListener('click', () => avatar.jump());
document.getElementById('btn-respawn').addEventListener('click', () => { avatar.restore({ x: 0, z: 3, facing: 0 }); avatar.target = null; toast('처음 자리로 왔어요'); });
document.getElementById('btn-full').addEventListener('click', () => {
  const app = document.getElementById('app');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (app.requestFullscreen) app.requestFullscreen().catch(() => toast('이 브라우저에서는 전체화면을 쓸 수 없어요'));
});
// 아직 없는 기능 버튼들
document.querySelectorAll('.soon').forEach((b) => b.addEventListener('click', () => toast(`${b.dataset.soon || '이 기능'}은(는) 준비 중이에요`)));

// 섬 제목 고치기
const titleEl = document.getElementById('room-title');
const titleInput = document.getElementById('room-title-input');
const titleBtn = document.getElementById('btn-title-edit');
function showTitle() { titleEl.textContent = roomTitle; document.title = `${roomTitle} (데모)`; }
function finishTitle(save) {
  if (save) { roomTitle = titleInput.value.trim() || roomTitle; scheduleSave(); }
  titleInput.classList.add('hidden'); titleEl.classList.remove('hidden'); titleBtn.innerHTML = icon('pencil'); titleBtn.title = '섬 이름 고치기';
  showTitle();
}
titleBtn.addEventListener('click', () => {
  if (!titleInput.classList.contains('hidden')) return finishTitle(true);
  titleInput.value = roomTitle;
  titleEl.classList.add('hidden'); titleInput.classList.remove('hidden'); titleBtn.innerHTML = icon('check'); titleBtn.title = '다 고쳤어요';
  titleInput.focus(); titleInput.select();
});
titleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') finishTitle(true);
  if (e.key === 'Escape') finishTitle(false);
  e.stopPropagation();
});
showTitle();
const TIME_NAMES = { 7: '아침', 13: '낮', 18.3: '노을', 22: '밤' };
const WEATHER_NAMES = { clear: '맑음', cloudy: '흐림', rain: '비', snow: '눈', petals: '꽃잎' };
function refreshSpaceInfo() {
  document.getElementById('space-title').textContent = roomTitle;
  document.getElementById('space-count').textContent = `${world.items.size}개`;
  const counts = {};
  world.items.forEach(({ data }) => { const g = ITEM_BY_TYPE[data.type].group; counts[g] = (counts[g] || 0) + 1; });
  document.getElementById('space-groups').innerHTML = ITEM_GROUPS.map((g) => `<span>${g.name}<b>${counts[g.id] || 0}</b></span>`).join('');
  document.getElementById('space-time').textContent = env.realTime ? '현재 시간 (한국)' : env.flowing ? '흐르는 시간' : (TIME_NAMES[Math.round(env.time * 10) / 10] || `${fmt(env.time)}`);
  document.getElementById('space-weather').textContent = WEATHER_NAMES[env.weather] || env.weather;
}
world.onChange(() => { if (currentPane === 'space') refreshSpaceInfo(); });

document.getElementById('btn-save').addEventListener('click', () => saveNow(true));

// 소리
const sound = new Sound();
avatar.onStep = () => sound.footstep();
const btnSound = document.getElementById('btn-sound');
const btnSound2 = document.getElementById('btn-sound2');
function refreshSoundBtn() {
  btnSound.innerHTML = `${icon(sound.enabled ? 'soundOn' : 'soundOff')}<span>${sound.enabled ? '소리' : '소리 꺼짐'}</span>`;
  btnSound.classList.toggle('off', !sound.enabled);
  btnSound2.innerHTML = `${icon(sound.enabled ? 'soundOn' : 'soundOff')}<span>${sound.enabled ? '소리 끄기' : '소리 켜기'}</span>`;
}
const toggleSound = () => { sound.setEnabled(!sound.enabled); refreshSoundBtn(); toast(sound.enabled ? '소리를 켰어요' : '소리를 껐어요'); };
btnSound.addEventListener('click', toggleSound);
btnSound2.addEventListener('click', toggleSound);
refreshSoundBtn();

const btnReset = document.getElementById('btn-reset');
const resetLabel = btnReset.querySelector('span');
let resetArmed = null;
btnReset.addEventListener('click', () => {
  if (!resetArmed) {
    resetLabel.textContent = '정말 처음으로? 한 번 더 누르기';
    resetArmed = setTimeout(() => { resetArmed = null; resetLabel.textContent = '섬을 처음 모습으로'; }, 3000);
    return;
  }
  clearTimeout(resetArmed); resetArmed = null;
  resetLabel.textContent = '섬을 처음 모습으로';
  stopPlacing(true); select(null);
  doAction({ type: 'replaceAll', items: DEFAULT_ITEMS.map((i) => ({ ...i, id: newId() })) }, '처음 모습으로');
  avatar.restore({ x: 0, z: 3, facing: 0 });
  toast('처음 모습으로 돌아왔어요 · Ctrl+Z로 되돌릴 수 있어요');
});

const help = document.getElementById('help');
document.getElementById('btn-help').addEventListener('click', () => help.classList.remove('hidden'));
document.getElementById('btn-help2').addEventListener('click', () => help.classList.remove('hidden'));
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
  const hidden = [selRing, hoverRing, marker, world.grid, placing && placing.ghost].filter((o) => o && o.visible);
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
    ctx.font = `${Math.round(bottom * 0.36)}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(roomTitle, pad, img.height + pad + bottom / 2);
    ctx.textAlign = 'right';
    ctx.fillText(stamp, c.width - pad, img.height + pad + bottom / 2);
    const url = c.toDataURL('image/png');
    photoImg.src = url;
    photoDl.href = url;
    photoDl.download = `섬사진_${stamp.replace(/\./g, '')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.png`;
    photoModal.classList.remove('hidden');
  };
  img.src = shot;
  flash.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove('on')));
}

// ---------- 채팅 ----------
const chat = new Chat({
  viewport, camera,
  myName: () => '나',
  // 말한 사람의 머리 위 위치 (지금은 나뿐, 나중엔 친구 아바타도)
  getSpeaker: (id) => (id === 'me' ? avatar.position.clone().add(new THREE.Vector3(0, 2.15 + avatar.y, 0)) : null),
});
const chatInput = document.getElementById('chat-input');
const chatLogEl = document.getElementById('chat-log');
const btnChatLog = document.getElementById('btn-chatlog');
const chatStyleEl = document.getElementById('chat-style');
function sendChat() { chat.send(chatInput.value); chatInput.value = ''; }
document.getElementById('chat-send').addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation(); // 글자를 치는 동안 캐릭터가 움직이지 않게
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendChat(); }
  if (e.key === 'Escape') chatInput.blur();
});
chatInput.addEventListener('focus', () => keys.clear());
window.addEventListener('keydown', (e) => {
  // 화면에서 Enter를 누르면 바로 채팅 입력
  if (e.key === 'Enter' && document.activeElement !== chatInput && e.target.tagName !== 'INPUT') { e.preventDefault(); chatInput.focus(); }
});
function refreshChatLog() {
  chatLogEl.classList.toggle('hidden', !chat.logVisible);
  btnChatLog.classList.toggle('off', !chat.logVisible);
  btnChatLog.querySelector('span').textContent = chat.logVisible ? '기록' : '기록 숨김';
}
btnChatLog.addEventListener('click', () => { chat.logVisible = !chat.logVisible; chat.savePrefs(); refreshChatLog(); });
refreshChatLog();
// 말풍선 꾸미기: 잘 어울리는 조합 4가지 중에서 하나만 고름 (선택지는 적게, 고르기는 쉽게)
const csList = document.getElementById('cs-presets');
function refreshChatStyle() {
  csList.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === chat.preset));
}
PRESETS.forEach((pr) => {
  const f = FONTS.find((x) => x.id === pr.font) || FONTS[0];
  const b = document.createElement('button');
  b.className = 'cs-preset';
  b.dataset.v = pr.id;
  b.innerHTML = `<span class="speech static"></span><em></em>`;
  const sp = b.querySelector('.speech');
  sp.textContent = '안녕하세요!';
  Object.assign(sp.style, { background: pr.bubble, color: pr.color, fontFamily: f.css, fontSize: `${13 * (f.scale || 1)}px` });
  sp.style.setProperty('--bubble', pr.bubble);
  b.querySelector('em').textContent = pr.name;
  b.addEventListener('click', () => { chat.setPreset(pr.id); refreshChatStyle(); });
  csList.appendChild(b);
});
const btnChatStyle = document.getElementById('btn-chatstyle');
btnChatStyle.addEventListener('click', () => {
  chatStyleEl.classList.toggle('hidden');
  btnChatStyle.classList.toggle('on', !chatStyleEl.classList.contains('hidden'));
});
refreshChatStyle();

// ---------- 매 프레임 ----------
const clock = new THREE.Clock();
let realTick = 0;
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
  if (marker.visible) {
    if (avatar.target) {
      // 가는 동안: 은은하게 숨 쉬듯
      const t = performance.now() / 1000;
      marker.material.opacity = 0.55 + Math.sin(t * 4) * 0.15;
      marker.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
    } else {
      // 도착하면: 조금 커지며 천천히 사라짐
      markerT -= dt * 1.4;
      marker.material.opacity = Math.max(0, markerT * 0.7);
      marker.scale.setScalar(1 + (1 - markerT) * 0.5);
      if (markerT <= 0) marker.visible = false;
    }
  }
  updateTools();
  chat.update();
  sound.setRain(env.weather === 'rain'); // 비가 오면 빗소리
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
document.getElementById('loading').classList.add('done');

// 디버그·테스트용 (나중에 멀티 기능을 붙일 때도 이 통로를 씁니다)
window.cozy = { world, avatar, env, cam, camera, saveNow, sound, setRole, chat, undo, redo };
