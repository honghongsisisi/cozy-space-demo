import * as THREE from 'three';
import { World, DEFAULT_ITEMS, PLAZA_ITEMS, DEFAULT_ROOM_ITEMS, ROOM_DOOR, ROOM_SPAWN, ROOM_W, ROOM_D, ROOM_H, snap, clampToPlot, clampToRoom, newId } from './world.js?v=0.39';
import { Avatar } from './avatar.js?v=0.39';
import { Environment } from './environment.js?v=0.39';
import { ITEMS, ITEM_BY_TYPE, ITEM_GROUPS, buildItem } from './catalog.js?v=0.39';
import { saveState, loadState } from './storage.js?v=0.39';
import { Sound } from './sound.js?v=0.39';
import { Chat, PRESETS, FONTS } from './chat.js?v=0.39';
import { fmt } from './realtime.js?v=0.39';
import { icon, fillIcons } from './icons.js?v=0.39';
import { makeThumbnails } from './thumbs.js?v=0.39';
import { Party, myRoomId, savedName, saveName, cleanName, netConfigured } from './party.js?v=0.39';

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
  // 휴대폰에서 키보드가 3D 화면 아래쪽을 가리는 동안: 캐릭터가 보이는 위쪽 가운데에 오도록 그림만 살짝 위로
  let wantY = 0;
  if (document.body.classList.contains('typing-m')) {
    const r = viewport.getBoundingClientRect();
    const kb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb')) || 0;
    const visBottom = Math.min(r.bottom, window.innerHeight - kb - 56);
    wantY = Math.max(0, h / 2 - (visBottom - r.top) / 2);
  }
  viewShiftY += (wantY - viewShiftY) * Math.min(1, dt * 6);
  if (Math.abs(viewShift) > 0.5 || Math.abs(viewShiftY) > 0.5) camera.setViewOffset(w, h, viewShift, viewShiftY, w, h);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
}
let viewShift = 0, viewShiftY = 0;

// ---------- 내 섬인지, 친구 섬에 놀러 왔는지 ----------
// 초대 링크는 주소 끝에 ?visit=섬번호 가 붙어 있어요. 내 섬 번호가 아니면 '손님'으로 들어가요.
const MY_ROOM = myRoomId();
const visitId = (new URLSearchParams(location.search).get('visit') || '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
const IS_GUEST = !!visitId && visitId !== MY_ROOM;
let space = IS_GUEST ? 'visit' : 'home'; // 지금 있는 곳: home(내 섬) / visit(친구 섬) / plaza(광장)
// 집 안에 있는지 (내 섬·친구 섬 모두)
let inside = false;
let houseItems = DEFAULT_ROOM_ITEMS.map((i) => ({ ...i, id: newId() })); // 마당에 있는 동안 집 안 물건
let yardBack = null; // 집 안에 있는 동안 저장할 때 쓸 마당 자리 (집 문 바로 앞) { avatar }
const clampPos = (x, z) => (inside ? clampToRoom(x, z) : clampToPlot(x, z));
let myName = savedName();

// ---------- 저장 ----------
let saveTimer = null;
let party = null; // 친구와 함께 (아래 '친구와 같은 섬에서' 부분)
function currentState() {
  // 집 안에 있어도 마당과 집 안을 각각 제자리에 저장 (다시 열면 집 문 앞 마당에서 시작)
  return {
    title: roomTitle,
    items: yardList(),
    house: { items: houseList() },
    env: env.serialize(),
    avatar: inside && yardBack ? yardBack.avatar : avatar.serialize(),
    cam: { yaw: inside && world.houseT ? cam.yaw + world.houseT.a : cam.yaw, pitch: cam.pitch, dist: cam.dist },
  };
}
function saveNow(showToast) {
  // 친구 섬·광장을 내 섬에 덮어쓰지 않게, 내 섬에 있을 때만 저장
  if (space !== 'home') { if (showToast) toast(space === 'plaza' ? '광장은 저장되지 않아요. 내 섬은 그대로예요' : '친구 섬은 저장되지 않아요. 내 섬은 그대로예요'); return; }
  const ok = saveState(currentState());
  if (showToast) toast(ok ? '저장했어요' : '이 브라우저에서는 저장할 수 없어요');
}
function scheduleSave() {
  if (party) party.worldChanged(); // 친구가 와 있으면 바뀐 섬 모습을 보내 줌
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(false), 600);
}
world.onChange(scheduleSave);

let roomTitle = '나의 작은 섬';
// 내 섬 불러오기 (처음 열 때, 그리고 광장·친구 섬에서 돌아올 때)
function loadHome() {
  const saved = loadState();
  roomTitle = '나의 작은 섬';
  houseItems = saved && saved.house ? saved.house.items.map((i) => ({ ...i, ...clampToRoom(i.x, i.z, 0.3) })) : DEFAULT_ROOM_ITEMS.map((i) => ({ ...i, id: newId() }));
  if (saved) {
    if (saved.title) roomTitle = saved.title;
    world.apply({ type: 'replaceAll', items: saved.items || [] }, { silent: true });
    env.restore(saved.env);
    avatar.restore({ x: 0, z: 0, facing: 0 }); // 켤 때는 언제나 마당 가운데에서 시작 (마지막 자리 말고)
    if (saved.cam) Object.assign(cam, { yaw: saved.cam.yaw, pitch: saved.cam.pitch, dist: saved.cam.dist });
  } else {
    world.apply({ type: 'replaceAll', items: DEFAULT_ITEMS }, { silent: true });
    env.restore({ time: 13, weather: 'clear', realTime: false, flowing: false });
    avatar.restore({ x: 0, z: 3, facing: 0 });
  }
}
if (IS_GUEST) {
  // 친구 섬: 주인이 섬 모습을 보내 줄 때까지 빈 섬으로 기다림. 시작 자리는 앞쪽 산책길 근처 아무 데나
  roomTitle = '친구의 섬';
  world.apply({ type: 'replaceAll', items: [] }, { silent: true });
  avatar.restore({ x: (Math.random() - 0.5) * 3, z: 3 + Math.random() * 2, facing: 0 });
} else loadHome();
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
  if (k === ' ') { e.preventDefault(); doJump(); }
  if (k === '1') doWave();
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
function zoom(d) { cam.dist = Math.max(4, Math.min(44, cam.dist + d)); }

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

function clickedDoor(e) {
  if (space === 'plaza') return null;
  setNdc(e);
  if (inside) {
    const hit = world.roomDoor.visible && raycaster.intersectObject(world.roomDoor, true)[0];
    return hit ? { x: 0, z: ROOM_D / 2 + 1.3 } : null;
  }
  const hit = raycaster.intersectObject(world.root, true)[0];
  const id = hit ? world.findItemFromObject(hit.object) : null;
  if (!id || !ITEM_BY_TYPE[world.items.get(id).data.type].door) return null;
  const d = world.doors().find((x) => x.id === id);
  if (!d) return null;
  const a = d.rot * Math.PI / 180;
  return { x: d.x - Math.sin(a) * 0.15, z: d.z - Math.cos(a) * 0.15 }; // 문 바로 앞 (조금 안쪽)
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
  route.length = 0;
  // 집 안에서 마당을 누르면: 문까지 걸어가 밖으로 나간 뒤 그 자리까지 이어서 걸어가요 (따로 나가는 버튼 없이)
  if (inside) {
    const fp = groundPoint(e);
    if (!fp) {
      setNdc(e);
      const hit = raycaster.intersectObject(world.islandTop, false)[0];
      if (hit) {
        const out = hit.point.z > ROOM_D / 2 || Math.abs(hit.point.x) > ROOM_W / 2 || hit.point.z < -ROOM_D / 2;
        if (out) { walkOut(clampToPlotLocal(hit.point.x, hit.point.z)); markAt(hit.point.x, hit.point.z); return; }
      }
    } else if (fp.z > ROOM_D / 2 - 0.9 && Math.abs(fp.x) < 1.3) { walkOut(); markAt(0, ROOM_D / 2 + 1.3); return; }
  }
  const door = clickedDoor(e);
  if (door) {
    if (inside) { walkOut(); return; }
    avatar.running = false;
    avatar.moveTo(door.x, door.z);
    marker.position.set(door.x, 0.03, door.z); marker.visible = true; markerT = 1;
    return;
  }
  const p = groundPoint(e);
  if (p) {
    const c = clampPos(p.x, p.z);
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

let role = IS_GUEST ? 'guest' : 'owner'; // 주인(owner) / 손님(guest). 아래 '주인 / 손님' 부분 참고

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
function refreshGridBtn() { gridToggle.checked = gridOn; world.grid.visible = false; world.roomGrid.visible = false; world.activeGrid.visible = decorating && gridOn; }
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
  const c = clampPos(fx, fz);
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
  const c = e.shiftKey ? clampPos(snap(p.x), snap(p.z)) : clampPos(p.x, p.z);
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
  if (ITEM_BY_TYPE[world.items.get(selectedId).data.type].fixed) { toast('집은 치울 수 없어요. 옮기기와 돌리기는 돼요'); return; }
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
function refreshEnvButtons() {
  timeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on',
    b.dataset.time === 'real' ? env.realTime : (!env.realTime && !env.flowing && Math.abs(env.time - parseFloat(b.dataset.time)) < 0.01)));
  // 현재 시간일 때: 버튼에는 '골랐다' 표시만
  weatherSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', env.weather === b.dataset.weather));
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
env.flowing = false; // '시간이 흐르게'는 홍시 님 요청으로 뺐음 (예전에 켜 둔 섬도 멈춘 시간으로)
refreshEnvButtons();

// ---------- 주인 / 손님 ----------
// 규칙: 섬의 시간·날씨·꾸미기는 주인(방장)이 정하고, 놀러 온 손님은 바꿀 수 없음.
// 지금은 언제나 주인. 나중에 방문 기능을 만들면 친구 섬에 들어갈 때 setRole('guest')만 부르면 됨.
function setRole(r) {
  role = r;
  const guest = r === 'guest';
  document.querySelectorAll('#env-panel button, #env-panel input').forEach((el) => { el.disabled = guest; });
  document.getElementById('env-panel').title = guest ? '시간과 날씨는 섬 주인이 정해요' : '';
  document.querySelectorAll('.rail-sub [data-sub="furniture"], #btn-reset, #btn-title-edit, #btn-undo, #btn-redo, #btn-save').forEach((el) => { el.disabled = guest; });
  if (!guest) refreshHistory();
  refreshEnvButtons();
  if (guest && currentPane === 'furniture') openPanel(null);
}
setRole(role);

// ---------- 기타 버튼 ----------
// 점프·인사는 친구 화면에도 보이게
function doJump() { if (avatar.y <= 0.001 && party) party.act('jump'); avatar.jump(); }
function doWave() { avatar.wave(); if (party) party.act('wave'); }
document.getElementById('btn-respawn').addEventListener('click', () => { avatar.restore(inside ? { ...ROOM_SPAWN, facing: Math.PI } : { x: 0, z: 3, facing: 0 }); avatar.target = null; toast('처음 자리로 왔어요'); });
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
function showTitle() { titleEl.textContent = inside ? `${roomTitle} · 집 안` : roomTitle; document.title = `${roomTitle} (데모)`; }
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
const resetName = () => (inside ? '방을 처음 모습으로' : '섬을 처음 모습으로');
const resetLabel = btnReset.querySelector('span');
let resetArmed = null;
btnReset.addEventListener('click', () => {
  if (!resetArmed) {
    resetLabel.textContent = '정말 처음으로? 한 번 더 누르기';
    resetArmed = setTimeout(() => { resetArmed = null; resetLabel.textContent = resetName(); }, 3000);
    return;
  }
  clearTimeout(resetArmed); resetArmed = null;
  resetLabel.textContent = resetName();
  stopPlacing(true); select(null);
  doAction({ type: 'replaceAll', items: (inside ? DEFAULT_ROOM_ITEMS : DEFAULT_ITEMS).map((i) => ({ ...i, id: newId() })) }, '처음 모습으로');
  avatar.restore(inside ? { ...ROOM_SPAWN, facing: Math.PI } : { x: 0, z: 3, facing: 0 });
  toast('처음 모습으로 돌아왔어요 · Ctrl+Z로 되돌릴 수 있어요');
});

const help = document.getElementById('help');
document.getElementById('btn-help2').addEventListener('click', () => help.classList.remove('hidden'));
document.getElementById('btn-help-close').addEventListener('click', () => {
  help.classList.add('hidden');
  try { localStorage.setItem('cozy-space-demo:helped', '1'); } catch (e) { /* 무시 */ }
});
try { if (space === 'home' && !localStorage.getItem('cozy-space-demo:helped')) help.classList.remove('hidden'); } catch (e) { help.classList.remove('hidden'); }

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
  const hidden = [selRing, hoverRing, marker, world.activeGrid, placing && placing.ghost].filter((o) => o && o.visible);
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
  myName: () => myName || '나',
  // 말한 사람의 머리 위 위치 (나 또는 친구 아바타)
  getSpeaker: (id) => (id === 'me' ? avatar.position.clone().add(new THREE.Vector3(0, 2.15 + avatar.y, 0)) : party ? party.headOf(id) : null),
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

// ---- 휴대폰: 키보드가 올라와도 3D 화면은 그대로, 채팅 입력줄만 키보드 위에 붙어 올라옴 (카카오톡처럼) ----
// 원리: ① 화면 전체 높이를 키보드가 없을 때 크기로 '고정'해 두고(--app-h),
// ② 키보드 높이(--kb) = 브라우저 창 높이 − 실제로 보이는 부분 높이 를 재서, 입력줄만 그만큼 위로 밀어 올립니다.
// ③ 채팅 기록 창은 입력하는 동안에만 반투명하게 떠 있다가, 키보드를 내리면 천천히 사라집니다.
const isPhone = () => window.matchMedia('(max-width: 900px)').matches;
const rootEl = document.documentElement;
function lockAppHeight() {
  if (isPhone() && document.activeElement === chatInput) return; // 키보드가 떠 있는 동안에는 높이를 바꾸지 않음
  rootEl.style.setProperty('--app-h', `${window.innerHeight}px`);
}
window.addEventListener('resize', lockAppHeight);
lockAppHeight();
const vv = window.visualViewport;
function placeChatbar() {
  if (!document.body.classList.contains('typing-m')) return;
  const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  rootEl.style.setProperty('--kb', `${Math.round(kb)}px`);
  if (window.scrollY) window.scrollTo(0, 0); // 브라우저가 화면을 끌어올리지 못하게
}
if (vv) { vv.addEventListener('resize', placeChatbar); vv.addEventListener('scroll', placeChatbar); }
chatInput.addEventListener('focus', () => {
  if (!isPhone()) return;
  document.body.classList.add('typing-m');
  placeChatbar();
});
chatInput.addEventListener('blur', () => {
  document.body.classList.remove('typing-m');
  rootEl.style.setProperty('--kb', '0px');
});
// 보내기 버튼을 눌러도 키보드가 내려가지 않게 (계속 이어서 말할 수 있게)
document.getElementById('chat-send').addEventListener('pointerdown', (e) => { if (document.activeElement === chatInput) e.preventDefault(); });
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
  motionEl.classList.add('hidden'); btnMotion.classList.remove('on');
  chatStyleEl.classList.toggle('hidden');
  btnChatStyle.classList.toggle('on', !chatStyleEl.classList.contains('hidden'));
});
refreshChatStyle();

// ---------- 함께 있기: 내 섬 · 친구 섬 · 광장 ----------
// 섬 주인: 내 섬에 있는 동안 자기 섬 채널에 들어가 있고, 초대 링크로 들어온 친구를 맞아요.
// 손님: 초대 링크로 들어오면 이름을 적고, 주인이 보내 주는 섬 모습을 그대로 봐요 (꾸미기·시간·날씨는 못 바꿈).
// 광장: 누구나 같은 채널 'plaza'에 모여요. 모습은 코드에 정해져 있어서 주인이 없어도 열려 있어요.
const joinEl = document.getElementById('join');
const joinName = document.getElementById('join-name');
const waitEl = document.getElementById('party-wait');
const peopleEl = document.getElementById('people-list');
const myNameInput = document.getElementById('my-name');
const inviteInput = document.getElementById('invite-link');
const fadeEl = document.getElementById('fade');
const goBtn = document.getElementById('btn-go');
const inviteLink = () => `${location.origin}${location.pathname}?visit=${MY_ROOM}`;
const nameOr = () => myName || (space === 'visit' ? '손님' : space === 'plaza' ? '나그네' : '섬 주인');

// 채팅: 내 화면에 뜨는 건 그대로, 같은 공간 사람들에게도 보내기
const localSend = chat.transport.send.bind(chat.transport);
chat.transport.send = (msg) => {
  localSend(msg);
  if (party) party.sendChat(msg);
  if (/안녕/.test(msg.text)) doWave(); // "안녕"이라고 말하면 손 흔들기 (친구 화면에도)
};

function renderPeople(list) {
  document.getElementById('visitors-now').textContent = `지금 ${list.length}명`;
  peopleEl.innerHTML = '';
  list.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'person-row';
    row.innerHTML = `<i data-icon="person"></i><span></span>${p.role === 'owner' ? '<em>섬 주인</em>' : ''}${p.me ? '<em class="me">나</em>' : ''}`;
    row.querySelector('span').textContent = p.name;
    peopleEl.appendChild(row);
  });
  fillIcons(peopleEl);
}

function startParty() {
  if (party || !netConfigured()) return;
  const partyRole = space === 'home' ? 'owner' : space === 'visit' ? 'guest' : 'visitor';
  party = new Party({
    scene, camera, viewport, avatar, chat, toast, role: partyRole,
    roomId: space === 'home' ? MY_ROOM : space === 'visit' ? visitId : 'plaza',
    getName: nameOr,
    getWorld: () => ({ title: roomTitle, items: yardList(), house: houseList(), env: env.serialize() }),
    getInside: () => inside,
    // 친구 자리를 내 화면 자리로: 친구가 마당·나는 집 안이면 집 기준 자리로 바꿔서 보여 줌, 친구가 집 안·나는 마당이면 지붕에 가려 안 보임
    view: (x, z, f, peerInside) => {
      if (peerInside === inside) return { x, z, f };
      if (peerInside) return null;
      const l = world.toLocal(x, z);
      return { x: l.x, z: l.z, f: f - world.houseT.a };
    },
    onWorld: (w) => {
      roomTitle = w.title; showTitle();
      // 주인이 보내 준 마당·집 안 모습 중, 지금 내가 있는 곳 것을 보여 줌
      if (inside) { world.setYard(w.items); world.apply({ type: 'replaceAll', items: w.house }, { silent: true }); }
      else { houseItems = w.house; world.apply({ type: 'replaceAll', items: w.items }, { silent: true }); }
      if (w.env) { env.restore(w.env); refreshEnvButtons(); }
      if (currentPane === 'space') refreshSpaceInfo();
    },
    onPeople: renderPeople,
  });
  party.start();
  party.peopleChanged();
}
function stopParty() {
  if (party) { party.dispose(); party = null; }
  renderPeople([{ name: nameOr(), role: space === 'home' ? 'owner' : 'guest', me: true }]);
}

// 지금 있는 곳에 맞춰 화면 고치기 (친구 창 안내, 위쪽 이동 버튼)
function refreshSpaceUI() {
  document.getElementById('guest-card').classList.toggle('hidden', space !== 'visit');
  document.getElementById('plaza-card').classList.toggle('hidden', space !== 'plaza');
  goBtn.innerHTML = space === 'plaza' ? `${icon('home')}<span>우리 집 가기</span>` : `${icon('plaza')}<span>광장 가기</span>`;
  goBtn.title = space === 'plaza' ? '내 섬으로 돌아가요' : '누구나 모이는 광장으로 가요';
  resetLabel.textContent = resetName();
  document.body.dataset.space = space;
}

// 손님에게 보이는 안내: 주인을 기다리는 중이면 화면 위쪽에 작게
let joinedAt = 0;
setInterval(() => {
  let msg = '';
  if (space !== 'home' && party && !party.connected) msg = space === 'plaza' ? '광장에 연결하고 있어요…' : '친구 섬에 연결하고 있어요…';
  else if (space === 'visit' && party) {
    if (!party.gotWorld && performance.now() - joinedAt > 2500) msg = '섬 주인이 지금 게임을 켜 두지 않았어요. 주인이 켜면 바로 만나요';
    else if (party.gotWorld && !party.ownerHere) msg = '섬 주인이 잠깐 자리를 비웠어요';
  }
  waitEl.textContent = msg;
  waitEl.classList.toggle('hidden', !msg);
}, 500);

// 이름 묻기 (친구 섬·광장에 처음 갈 때). 이미 이름이 있으면 바로 넘어감
let afterName = null;
function askName(title, then, always = false) {
  if (myName && !always) return then();
  document.getElementById('join-title').textContent = title;
  joinName.value = myName;
  afterName = then;
  joinEl.classList.remove('hidden');
  setTimeout(() => joinName.focus(), 50);
}
function enterName() {
  const n = cleanName(joinName.value);
  if (!n) { toast('이름을 적어 주세요'); joinName.focus(); return; }
  myName = n; saveName(n); myNameInput.value = n;
  joinEl.classList.add('hidden');
  const f = afterName; afterName = null;
  if (f) f();
}
document.getElementById('btn-join').addEventListener('click', enterName);
joinName.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); enterName(); } });
document.getElementById('btn-join-cancel').addEventListener('click', () => {
  if (space === 'visit' && !party) { location.href = location.pathname; return; } // 초대 링크로 왔다가 그만두면 내 섬으로
  joinEl.classList.add('hidden'); afterName = null;
});

// ---- 공간 옮기기: 화면을 부드럽게 덮었다가, 바꾸고, 다시 걷어 냄 ----
let moving = false;
function moveTo(dest) {
  if (moving || dest === space) return;
  if (dest === 'plaza' && !netConfigured()) { toast('광장은 서버 연결을 마친 뒤에 열려요'); return; }
  const go = () => {
    moving = true;
    document.getElementById('fade-text').textContent = dest === 'plaza' ? '광장으로 가는 중…' : '우리 집으로 가는 중…';
    fadeEl.classList.add('on');
    setTimeout(() => {
      if (space === 'home') saveNow(false); // 떠나기 전에 내 섬 저장
      leaveHouseNow(); // 집 안에서 바로 떠나도 다음엔 마당에서 시작
      stopParty();
      stopPlacing(true); select(null);
      if (currentPane === 'furniture') openPanel(null);
      undoStack.length = 0; redoStack.length = 0;
      space = dest;
      if (dest === 'plaza') {
        roomTitle = '광장';
        world.apply({ type: 'replaceAll', items: PLAZA_ITEMS }, { silent: true });
        env.restore({ time: 13, weather: 'clear', realTime: true, flowing: false }); // 광장은 한국 실제 시간, 맑음
        avatar.restore({ x: (Math.random() - 0.5) * 2.4, z: 9.5 + Math.random() * 1.5, facing: Math.PI });
      } else {
        loadHome();
        if (location.search) history.replaceState(null, '', location.pathname); // 초대 링크 주소 지우기
      }
      avatar.target = null;
      setRole(dest === 'home' ? 'owner' : 'guest');
      cam.target.copy(avatar.position).add(new THREE.Vector3(0, 1.3, 0));
      showTitle(); refreshEnvButtons(); refreshSpaceUI();
      if (currentPane === 'space') refreshSpaceInfo();
      startParty();
      requestAnimationFrame(() => requestAnimationFrame(() => { fadeEl.classList.remove('on'); moving = false; }));
      toast(dest === 'plaza' ? '광장에 왔어요' : '우리 집에 왔어요');
    }, 380);
  };
  go(); // 광장은 이름을 묻지 않고 바로 감 (이름이 없으면 '나그네', 친구 메뉴에서 언제든 바꿀 수 있음)
}
goBtn.addEventListener('click', () => moveTo(space === 'plaza' ? 'home' : 'plaza'));
document.getElementById('btn-home').addEventListener('click', (e) => { e.preventDefault(); moveTo('home'); });

refreshSpaceUI();
if (space === 'visit') {
  if (!netConfigured()) { document.getElementById('join-off').classList.remove('hidden'); document.getElementById('btn-join').disabled = true; }
  askName('친구 섬에 놀러 가요', () => { joinedAt = performance.now(); startParty(); }, true);
} else {
  startParty();
}
inviteInput.value = inviteLink();
if (!netConfigured()) {
  document.getElementById('net-off').classList.remove('hidden');
  document.getElementById('btn-invite').disabled = true;
}
myNameInput.value = myName;
myNameInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') myNameInput.blur(); });
myNameInput.addEventListener('change', () => {
  myName = cleanName(myNameInput.value); myNameInput.value = myName; saveName(myName);
  if (party) { party.peopleChanged(); party.sendState(true); }
});
document.getElementById('btn-invite').addEventListener('click', () => {
  if (!myName) { toast('먼저 친구에게 보일 내 이름을 적어 주세요'); myNameInput.focus(); return; }
  const link = inviteLink();
  const done = () => toast('초대 링크를 복사했어요. 친구에게 붙여 넣어 보내 주세요');
  if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => { inviteInput.select(); toast('링크를 직접 복사해 주세요 (Ctrl+C)'); });
  else { inviteInput.select(); toast('링크를 직접 복사해 주세요 (Ctrl+C)'); }
});
inviteInput.addEventListener('focus', () => inviteInput.select());
if (!party) renderPeople([{ name: nameOr(), role, me: true }]);

// ---------- 우리 집: 문으로 들어가고 나오기 (화면 전환 없이) ----------
// 원리: 바깥 집과 집 안 방은 크기가 같아요. 문 앞에 닿으면 바깥 집을 숨기고 같은 자리에 방을 보여 주는데,
// 방 위에 바깥 집과 똑같은 지붕을 덮어 두었다가 스르륵 투명하게 걷어 내고, 카메라 쪽 벽은 천천히 낮춰요.
// 그래서 집이 '열리면서' 안이 보이고, 둘레의 마당과 친구들도 그대로 보여요. 나올 때는 거꾸로 지붕이 다시 덮여요.
// 집 안에서는 '집 가운데 = (0,0)'인 집 기준 자리를 쓰고, 마당 전체를 그만큼 돌려 놓아요 (world.enterHouse).
let doorArmed = false; // 방금 나온 문에 바로 다시 들어가지 않게, 문에서 조금 떨어져야 다시 켜짐
let leaving = false;   // 집 밖으로 걸어 나가는 중 (지붕이 덮이는 중)
const yardList = () => (inside ? [...world.yardMap.values()].map(({ data }) => ({ ...data })) : world.serialize());
const houseList = () => (inside ? world.serialize() : houseItems);
function frameCam(toLocal) {
  // 카메라도 같은 자리에서 같은 방향을 보도록 자리만 바꿔 줌 (화면이 튀지 않게)
  const t = toLocal ? world.toLocal(cam.target.x, cam.target.z) : world.toYard(cam.target.x, cam.target.z);
  cam.target.set(t.x, cam.target.y, t.z);
  cam.yaw += toLocal ? -world.houseT.a : world.houseT.a;
}
function enterHouse(door) {
  if (placing) return;
  const h = world.items.get(door.id);
  if (!h) return;
  stopPlacing(true); select(null); setHover(null);
  undoStack.length = 0; redoStack.length = 0; refreshHistory();
  const a = h.data.rot * Math.PI / 180;
  const out = { x: door.x + Math.sin(a) * 0.9, z: door.z + Math.cos(a) * 0.9 };
  yardBack = { avatar: { ...out, facing: a } };
  const p = avatar.position, f = avatar.facing;
  world.enterHouse(h.data, houseItems);
  const lp = world.toLocal(p.x, p.z);
  avatar.restore({ x: lp.x, z: lp.z, facing: f - a });
  frameCam(true);
  inside = true; leaving = false;
  env.indoor = true; env.frameRot = -a;
  env.roomBox = { hw: ROOM_W / 2 + 0.3, hd: ROOM_D / 2 + 0.3, h: ROOM_H + 1.2 };
  avatar.bounds = (x, z) => clampToRoom(x, z, 0.45, true);
  avatar.running = false;
  avatar.moveTo(ROOM_SPAWN.x, ROOM_SPAWN.z); // 문을 지나 방 안으로 몇 걸음
  marker.visible = false;
  doorArmed = false;
  refreshGridBtn(); showTitle(); refreshSpaceUI();
  if (currentPane === 'space') refreshSpaceInfo();
  if (party) { party.frameChanged(); party.sendState(true); }
}
// 지붕이 다 덮이면 마당으로 (집 기준 자리 → 마당 자리)
function finishExit() {
  const p = avatar.position, f = avatar.facing, a = world.houseT.a;
  const wp = world.toYard(p.x, p.z);
  frameCam(false);
  houseItems = world.exitHouse();
  inside = false; leaving = false;
  env.indoor = false; env.frameRot = 0; env.roomBox = null;
  avatar.bounds = null;
  const t = avatar.target ? world.toYard(avatar.target.x, avatar.target.y) : null;
  avatar.restore({ x: wp.x, z: wp.z, facing: f + a });
  if (t) avatar.moveTo(t.x, t.z);
  route.forEach((q, i) => { route[i] = world.toYard(q.x, q.z); }); // 남은 걸음도 마당 자리로
  if (marker.visible) { const m = world.toYard(marker.position.x, marker.position.z); marker.position.set(m.x, 0.03, m.z); }
  stopPlacing(true); select(null); setHover(null);
  undoStack.length = 0; redoStack.length = 0; refreshHistory();
  doorArmed = false;
  refreshGridBtn(); showTitle(); refreshSpaceUI();
  if (currentPane === 'space') refreshSpaceInfo();
  if (party) { party.frameChanged(); party.sendState(true); }
  if (space === 'home') saveNow(false);
}
// 집 안에서 바로 다른 곳(광장 등)으로 떠날 때: 지붕을 기다리지 않고 곧장 마당 상태로
function leaveHouseNow() { if (inside) finishExit(); }
// 문으로 걸어 나가기: (필요하면) 문 안쪽 앞 → 문 밖 → 누른 마당 자리. 벽에 막히지 않게 나눠서 걸어요
// route: 다음에 걸어갈 자리들 (지금 쓰는 자리 기준). 집을 드나들면 자리 기준도 같이 바꿔 줌
const route = [];
function walkOut(final) {
  if (!inside) return;
  const p = avatar.position;
  avatar.running = false;
  route.length = 0;
  if (!(Math.abs(p.x) < 0.5 && p.z > ROOM_D / 2 - 1.2)) route.push({ x: 0, z: ROOM_D / 2 - 0.9 });
  route.push({ x: 0, z: ROOM_D / 2 + 1.3 });
  if (final) route.push(final);
  const q = route.shift();
  avatar.moveTo(q.x, q.z);
}
// 집 안 기준 자리에서 본 마당 자리를 섬 밖으로 나가지 않게
function clampToPlotLocal(x, z) {
  const y = world.toYard(x, z), c = clampToPlot(y.x, y.z);
  return world.toLocal(c.x, c.z);
}
function markAt(x, z) { marker.position.set(x, 0.03, z); marker.visible = true; markerT = 1; }
// 다른 데서 부르는 이름 (시험용)
function goThroughDoor(door) { if (!inside) enterHouse(door || world.doors()[0]); else walkOut(); }

// 매 프레임: 문 앞에 닿았는지 보기
function checkDoors() {
  if (space === 'plaza' || moving) return;
  const p = avatar.position;
  if (inside) {
    // 문 밖으로 몇 걸음 나가면 바로 마당으로
    const outside = p.z > ROOM_D / 2 + 0.35;
    if (!leaving && outside && doorArmed) {
      leaving = true; world.closing = true;
      if (!avatar.target) avatar.moveTo(0, ROOM_D / 2 + 1.3); // 문을 막 지나면 몇 걸음 더 나가요
    }
    if (leaving && !outside) { leaving = false; world.closing = false; } // 다시 들어오면 그대로 집 안
    if (!outside) doorArmed = true;
    if (leaving && p.z > ROOM_D / 2 + 0.7) { finishExit(); return true; } // 문 밖 몇 걸음이면 바로 마당 (지붕 모션 없이)
    return false;
  }
  if (placing) return;
  let near = Infinity, hit = null;
  world.doors().forEach((d) => { const dd = Math.hypot(p.x - d.x, p.z - d.z); if (dd < near) { near = dd; hit = d; } });
  if (!doorArmed) { if (near > 1.3) doorArmed = true; return; }
  if (hit && near < 0.55) { enterHouse(hit); return inside; }
  return false;
}

// ---------- 모션 ----------
// 새 모션은 이 목록에 한 줄 더하면 버튼이 생겨요 (목록은 짧게 유지)
const MOTIONS = [
  { id: 'wave', name: '인사', icon: 'hand', key: '1', run: doWave },
];
const motionEl = document.getElementById('motion-panel');
const btnMotion = document.getElementById('btn-motion');
MOTIONS.forEach((m) => {
  const b = document.createElement('button');
  b.className = 'motion-btn';
  b.title = `${m.name} (${m.key})`;
  b.innerHTML = `${icon(m.icon)}<span></span>`;
  b.querySelector('span').textContent = m.name;
  b.addEventListener('click', () => m.run());
  document.getElementById('motion-list').appendChild(b);
});
btnMotion.addEventListener('click', () => {
  chatStyleEl.classList.add('hidden'); btnChatStyle.classList.remove('on');
  motionEl.classList.toggle('hidden');
  btnMotion.classList.toggle('on', !motionEl.classList.contains('hidden'));
});

// ---------- 매 프레임 ----------
const clock = new THREE.Clock();
let realTick = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (keys.has('q')) cam.yaw += dt * 1.8;
  if (keys.has('e')) cam.yaw -= dt * 1.8;
  const typing = !help.classList.contains('hidden') || !joinEl.classList.contains('hidden');
  avatar.update(dt, typing ? { x: 0, y: 0 } : moveInput(), cam.yaw, world.colliders());
  world.update(dt);
  updateCamera(dt);
  world.updateWalls(dt, camera.position);
  // 이어 걷기: 지금 걸음이 끝나면 다음 자리로. 키보드로 움직이면 그만
  if (route.length) {
    const mi = moveInput();
    if (mi.x || mi.y) route.length = 0;
    else if (!avatar.target) { const q = route.shift(); avatar.moveTo(q.x, q.z); }
  }
  if (checkDoors()) { updateCamera(0); world.updateWalls(0, camera.position); } // 들어가고 나온 그 순간에도 카메라·벽을 바로 맞춰서 한 프레임 튀는 것(지직) 없게
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
  if (party) party.update(dt);
  chat.update();
  sound.setRain(env.weather === 'rain', inside); // 비가 오면 빗소리 (집 안에서는 작게)
  sound.setChime(env.weather === 'clear', inside); // 맑으면 풍경 소리 (집 안에서는 작게)
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
document.getElementById('loading').classList.add('done');

// ---------- 새 버전 확인 ----------
// 휴대폰 브라우저는 예전 화면을 오래 기억해 두는 일이 많아요. 그래서 켤 때 한 번, 그리고 다시 화면으로 돌아올 때
// 서버의 최신 버전 번호를 (기억해 둔 것 말고) 새로 받아 보고, 지금 것보다 새것이면 한 번만 새로 고쳐요.
const MY_VERSION = (document.querySelector('.version') || {}).textContent || '';
function checkNewVersion() {
  fetch(`${location.pathname}?vc=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).then((html) => {
    const m = html.match(/class="version"[^>]*>(v[\d.]+)</);
    if (!m || m[1] === MY_VERSION) return;
    let tried = '';
    try { tried = sessionStorage.getItem('cozy-reloaded-for') || ''; } catch (e) { /* 무시 */ }
    if (tried === m[1]) return; // 같은 버전 때문에 계속 새로 고치지 않게
    try { sessionStorage.setItem('cozy-reloaded-for', m[1]); } catch (e) { /* 무시 */ }
    saveNow(false);
    location.reload();
  }).catch(() => {});
}
setTimeout(checkNewVersion, 1500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNewVersion(); });

// 디버그·테스트용 (나중에 멀티 기능을 붙일 때도 이 통로를 씁니다)
window.cozy = { world, avatar, env, cam, camera, saveNow, sound, setRole, chat, undo, redo, get party() { return party; }, moveTo, get space() { return space; }, get inside() { return inside; }, goThroughDoor };
