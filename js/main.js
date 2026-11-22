import * as THREE from 'three';
import { World, DEFAULT_ITEMS, PLAZA_ITEMS, DEFAULT_ROOM_ITEMS, ROOM_DOOR, ROOM_SPAWN, ROOM_W, ROOM_D, ROOM_H, snap, clampToPlot, clampToRoom, newId } from './world.js?v=0.49';
import { Avatar } from './avatar.js?v=0.49';
import { Environment } from './environment.js?v=0.49';
import { ITEMS, ITEM_BY_TYPE, ITEM_GROUPS, buildItem } from './catalog.js?v=0.49';
import { restoreOwned, serializeOwned, ownedOf, countUsed } from './inventory.js?v=0.49';
import { saveState, loadState, packState, userKey, takeLegacy, migrate } from './storage.js?v=0.49';
import { authReady, currentUser, signIn, signUp, signOut, setNickname, loadIsland, saveIsland, visitIsland, guestbookList, guestbookWrite, guestbookDelete, friendCode, friendList, friendRequest, friendAnswer, friendRemove } from './auth.js?v=0.49';
import { Sound } from './sound.js?v=0.49';
import { Chat, PRESETS, FONTS } from './chat.js?v=0.49';
import { fmt } from './realtime.js?v=0.49';
import { icon, fillIcons } from './icons.js?v=0.49';
import { makeThumbnails } from './thumbs.js?v=0.49';
import { Party, savedName, saveName, cleanName, netConfigured } from './party.js?v=0.49';

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
// v0.41: 섬 번호는 내 계정에서 만들어져서, 어느 컴퓨터·휴대폰에서 로그인해도 같아요.
let MY_ROOM = '';
let visitId = (new URLSearchParams(location.search).get('visit') || '').replace(/[^a-z0-9]/gi, '').slice(0, 16).toLowerCase(); // 지금 구경 중인 친구 섬 번호
let ghostsOk = true; // 내 섬 설정: 유령 손님 받기 (v0.42)
// 로그인 창이 떠 있는 동안에는 광장을 뒤에 배경으로 보여 줘요 (아직 아무것도 저장하지 않음)
let space = 'plaza'; // 지금 있는 곳: home(내 섬) / visit(친구 섬) / plaza(광장)
let account = null;  // 로그인한 사람 { id, email, nickname }
let ghost = false;   // 가입하지 않은 손님(유령)
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
    inventory: { owned: serializeOwned() }, // 가진 물건 개수 (나중에 상점에서 늘어남)
    settings: { ghosts: ghostsOk }, // 섬 주인 설정 (v0.42): 유령 손님 받기
    env: env.serialize(),
    avatar: inside && yardBack ? yardBack.avatar : avatar.serialize(),
    cam: { yaw: inside && world.houseT ? cam.yaw + world.houseT.a : cam.yaw, pitch: cam.pitch, dist: cam.dist },
  };
}
function saveNow(showToast) {
  if (ghost || !account) return; // 유령 손님은 저장할 섬이 없어요
  // 친구 섬·광장을 내 섬에 덮어쓰지 않게, 내 섬에 있을 때만 저장
  if (space !== 'home') { if (showToast) toast(space === 'plaza' ? '광장은 저장되지 않아요. 내 섬은 그대로예요' : '친구 섬은 저장되지 않아요. 내 섬은 그대로예요'); return; }
  const packed = packState(currentState());
  const ok = saveState(packed, userKey(account.id)); // ① 이 컴퓨터에 바로 (빠른 임시 보관)
  queueCloud(packed);                                 // ② 서버에는 잠깐 모았다가 한 번에 (진짜 보관)
  if (showToast) toast(ok || !cloudOff ? '저장했어요' : '이 브라우저에서는 저장할 수 없어요');
}
// ---- 서버에 저장 (v0.41) ----
// 원리: 물건을 옮길 때마다 서버에 보내면 너무 잦아서, 1.5초 동안 모았다가 마지막 모습만 보내요.
// 창을 닫거나 다른 창으로 넘어갈 때는 기다리지 않고 바로 보내요.
let cloudPending = null, cloudTimer = null, cloudBusy = false, cloudOff = false, cloudWarned = false;
function queueCloud(packed, now = false) {
  if (!account || cloudOff) return;
  cloudPending = packed;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(flushCloud, now ? 0 : 1500);
}
async function flushCloud() {
  clearTimeout(cloudTimer);
  if (!account || !cloudPending || cloudOff) return;
  if (cloudBusy) { cloudTimer = setTimeout(flushCloud, 500); return; }
  const p = cloudPending, uid = account.id;
  cloudPending = null; cloudBusy = true;
  try {
    await saveIsland(uid, myName, p);
    if (cloudWarned) { cloudWarned = false; toast('서버에 다시 저장했어요'); }
  } catch (e) {
    if (e && e.missing) { cloudOff = true; toast('서버 저장소가 아직 준비 중이라, 이 컴퓨터에만 저장해 둘게요'); refreshSaveLabel(); }
    else {
      if (!cloudPending) cloudPending = p;
      if (!cloudWarned) { cloudWarned = true; toast('서버에 저장하지 못했어요. 이 컴퓨터엔 저장해 두었고, 곧 다시 해 볼게요'); }
      cloudTimer = setTimeout(flushCloud, 10000);
    }
  }
  cloudBusy = false;
}
function refreshSaveLabel() {
  const el = document.getElementById('space-save');
  if (el) el.textContent = cloudOff ? '이 컴퓨터에만 저장 (서버 준비 중)' : '내 계정에 자동 저장';
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { if (space === 'home') saveNow(false); flushCloud(); }
});
function scheduleSave() {
  if (party) party.worldChanged(); // 친구가 와 있으면 바뀐 섬 모습을 보내 줌
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(false), 600);
}
world.onChange(scheduleSave);

let roomTitle = '나의 작은 섬';
// 내 섬 불러오기 (처음 열 때, 그리고 광장·친구 섬에서 돌아올 때)
function loadHome() {
  const saved = account ? loadState(userKey(account.id)) : null; // 로그인할 때 서버와 맞춰 둔 내 섬
  roomTitle = '나의 작은 섬';
  ghostsOk = !(saved && saved.settings && saved.settings.ghosts === false);
  document.getElementById('ghost-toggle').checked = ghostsOk;
  restoreOwned(saved && saved.inventory && saved.inventory.owned);
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
// 광장 모습 (로그인 창 뒤 배경, 그리고 광장에 갈 때)
function showPlaza() {
  roomTitle = '광장';
  world.apply({ type: 'replaceAll', items: PLAZA_ITEMS }, { silent: true });
  env.restore({ time: 13, weather: 'clear', realTime: true, flowing: false }); // 광장은 한국 실제 시간, 맑음
  // 광장 입구 둘레 아무 데나 (여러 사람이 한 자리에 겹쳐 서지 않게 넓게 흩어 줌)
  const a = (Math.random() - 0.5) * 0.7, r = 9.4 + Math.random() * 1.8;
  avatar.restore({ x: Math.sin(a) * r, z: Math.cos(a) * r, facing: Math.PI });
}
showPlaza();
cam.target.copy(avatar.position).add(new THREE.Vector3(0, 1.3, 0));
window.addEventListener('beforeunload', () => { saveNow(false); flushCloud(); });

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
  if (k === ' ') { e.preventDefault(); if (avatar.pose) standUp(); else doJump(); }
  if (k === '1') { if (avatar.pose) standUp(); doWave(); }
  if (k === 'i') openPanel(panelOpen && currentPane === 'furniture' ? null : 'furniture');
  if (k === 'r') rotateCurrent(e.shiftKey ? 45 : 15);
  if (k === 'm' && selectedId) startMove(selectedId);
  if ((k === 'delete' || k === 'backspace') && selectedId) removeSelected();
  if (k === 'escape') {
    if (!help.classList.contains('hidden')) help.classList.add('hidden');
    else if (useShown) hideUseCard();
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

// 누른 자리에 딱 맞은 물건 종류 (없으면 '')
// (휴대폰에서는 가는 기둥을 정확히 누르기 어려워서, 못 맞혔으면 누른 땅에서 0.8칸 안의 물건도 쳐 줘요)
function clickedType(e) {
  setNdc(e);
  let id = null;
  for (const hit of raycaster.intersectObject(world.root, true)) { id = world.findItemFromObject(hit.object); if (id) break; }
  if (!id) {
    const p = groundPoint(e);
    let best = 0.8;
    if (p) world.items.forEach(({ data }) => { const d = Math.hypot(data.x - p.x, data.z - p.z); if (d < best) { best = d; id = data.id; } });
  }
  return id && world.items.get(id) ? world.items.get(id).data.type : '';
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
  // 친구 캐릭터를 누르면: 친구 신청 · 그 사람 섬 구경 가기 카드 (v0.42)
  if (party) { setNdc(e); const pp = party.pickPeer(raycaster); if (pp) { showPeerCard(pp); return; } }
  // 우체통을 누르면 방명록 (v0.43)
  if (space !== 'plaza' && clickedType(e) === 'mailbox') { openPanel('guestbook'); return; }
  // 의자·침대·책장·창문을 누르면 '사용하기' 카드 (v0.49)
  const u = pickUse(e);
  if (u) { showUseCard(u); return; }
  hideUseCard();
  pendingUse = null;
  if (avatar.pose) standUp();
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

let role = 'guest'; // 주인(owner) / 손님(guest). 아래 '주인 / 손님' 부분 참고. 로그인해서 내 섬에 가면 주인

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
    b.innerHTML = (THUMBS[it.type] ? `<img class="thumb" alt="" src="${THUMBS[it.type]}"><span>${it.name}</span>` : `<span class="thumb"></span><span>${it.name}</span>`) + '<span class="stock"></span>';
    b.addEventListener('click', () => startPlacing(it.type));
    grid.appendChild(b);
  });
  folders.appendChild(f);
});

// ---------- 물건 개수: 카드 오른쪽 아래 '쓴 개수/가진 개수' ----------
// 마당과 집 안에 놓인 물건을 모두 세요. 다 쓴 물건 카드는 흐려지고 더 놓을 수 없어요.
const usedNow = () => countUsed([yardList(), houseList()]);
function isFull(type) { return (usedNow()[type] || 0) >= ownedOf(type); }
function refreshStock() {
  const used = usedNow();
  folders.querySelectorAll('.item-card').forEach((c) => {
    const t = c.dataset.type, u = used[t] || 0, n = ownedOf(t);
    c.querySelector('.stock').textContent = `${u}/${n}`;
    c.classList.toggle('full', u >= n);
    c.title = u >= n ? `${ITEM_BY_TYPE[t].name} · 다 썼어요 (치우면 다시 놓을 수 있어요)` : `${ITEM_BY_TYPE[t].name} · ${n}개 중 ${u}개 놓음`;
  });
}
world.onChange(refreshStock);
refreshStock();

function setDecorating(on) {
  if (on) { hideUseCard(); pendingUse = null; if (avatar.pose) standUp(); }
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
  space: '내 공간', friends: '친구', guestbook: '방명록', manage: '관리',
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
    if (pane === 'friends') { refreshRecent(); friendsRefresh(); }
    if (pane === 'guestbook') gbRefresh();
  }
  const isItem = ['furniture', 'closet', 'shop'].includes(pane);
  rail.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('on', b.dataset.cat === pane || (b.dataset.cat === 'items' && isItem)));
  rail.querySelector('.rail-group').classList.toggle('open', isItem);
  railSub.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.sub === pane));
  setDecorating(pane === 'furniture');
  if (pane === 'furniture') refreshStock();
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
  if (!movingId && isFull(type)) { toast(`${ITEM_BY_TYPE[type].name}: 다 썼어요. 하나 치우면 다시 놓을 수 있어요`); return; }
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
    const type = placing.type;
    if (isFull(type)) { stopPlacing(true); toast(`${ITEM_BY_TYPE[type].name}: 다 썼어요`); return; }
    doAction({ type: 'add', item: { id: newId(), type, x, z, rot: placing.rot } }, `${ITEM_BY_TYPE[type].name} 놓기`);
    // 같은 물건을 계속 놓을 수 있게 그대로 둠 (다 쓰면 손에서 내려놓음)
    if (isFull(type)) { stopPlacing(true); toast(`${ITEM_BY_TYPE[type].name}: 가진 만큼 모두 놓았어요`); }
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
function doWave() { if (avatar.pose) standUp(); avatar.wave(); if (party) party.act('wave'); }
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
avatar.onStep = () => { if (!avatar.isGhost) sound.footstep(); }; // 유령은 발소리가 없어요
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
// 조작법은 처음 내 섬에 왔을 때 한 번 보여 줘요 (아래 enterAccount)
function maybeHelp() { try { if (!localStorage.getItem('cozy-space-demo:helped')) help.classList.remove('hidden'); } catch (e) { help.classList.remove('hidden'); } }

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
const nameOr = () => (ghost ? '유령' : myName || (space === 'visit' ? '손님' : space === 'plaza' ? '나그네' : '섬 주인'));

// 채팅: 내 화면에 뜨는 건 그대로, 같은 공간 사람들에게도 보내기
const localSend = chat.transport.send.bind(chat.transport);
chat.transport.send = (msg) => {
  if (ghost) return; // 유령은 말할 수 없어요
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
    const st = p.room ? friendStatus(p.room) : '';
    row.innerHTML = `<i data-icon="person"></i><span></span>${p.role === 'owner' ? '<em>섬 주인</em>' : ''}${p.me ? '<em class="me">나</em>' : ''}${st === 'friend' ? '<em class="me">친구</em>' : ''}`;
    row.querySelector('span').textContent = p.name;
    // 만난 사람에게 바로 친구 신청 (가입한 사람끼리만)
    if (!p.me && account && p.room && st !== 'friend') {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = st === 'sent' ? '신청 보냄' : st === 'received' ? '수락하기' : '친구 신청';
      b.disabled = st === 'sent';
      b.addEventListener('click', () => askFriend({ room: p.room }, p.name));
      row.appendChild(b);
    }
    peopleEl.appendChild(row);
  });
  fillIcons(peopleEl);
}

function startParty() {
  if (party || !netConfigured()) return;
  const partyRole = space === 'home' ? 'owner' : space === 'visit' ? 'guest' : 'visitor';
  party = new Party({
    scene, camera, viewport, avatar, chat, toast, role: partyRole, ghost,
    roomId: space === 'home' ? MY_ROOM : space === 'visit' ? visitId : 'plaza',
    getName: nameOr,
    getRoom: () => (account ? MY_ROOM : ''),
    getWorld: () => ({ title: roomTitle, items: yardList(), house: houseList(), env: env.serialize(), ghosts: ghostsOk }),
    getInside: () => inside,
    // 친구 자리를 내 화면 자리로: 친구가 마당·나는 집 안이면 집 기준 자리로 바꿔서 보여 줌, 친구가 집 안·나는 마당이면 지붕에 가려 안 보임
    view: (x, z, f, peerInside) => {
      if (peerInside === inside) return { x, z, f };
      if (peerInside) return null;
      const l = world.toLocal(x, z);
      return { x: l.x, z: l.z, f: f - world.houseT.a };
    },
    onWorld: (w) => {
      if (ghost && w.ghosts === false) { turnGhostAway('이 섬은 지금 유령 손님을 받지 않아요'); return; }
      showVisitWorld(w);
      rememberVisit(visitId, w.title, party && [...party.peers.values()].find((p) => p.role === 'owner')?.name);
    },
    onPeople: renderPeople,
  });
  party.start();
  party.peopleChanged();
}
function stopParty() {
  if (party) { party.dispose(); party = null; }
  renderPeople([{ name: nameOr(), role: space === 'home' ? 'owner' : 'guest', me: true, ghost }]);
}

// 지금 있는 곳에 맞춰 화면 고치기 (친구 창 안내, 위쪽 이동 버튼)
function refreshSpaceUI() {
  document.getElementById('guest-card').classList.toggle('hidden', space !== 'visit');
  document.getElementById('plaza-card').classList.toggle('hidden', space !== 'plaza');
  goBtn.innerHTML = space === 'plaza' ? `${icon('home')}<span>우리 집 가기</span>` : `${icon('plaza')}<span>광장 가기</span>`;
  goBtn.title = space === 'plaza' ? '내 섬으로 돌아가요' : '누구나 모이는 광장으로 가요';
  goBtn.classList.toggle('hidden', ghost && space === 'plaza'); // 유령은 돌아갈 섬이 없어서, 대신 '가입하고 내 섬 받기' 버튼이 보여요
  resetLabel.textContent = resetName();
  document.body.dataset.space = space;
  if (space === 'plaza' && currentPane === 'guestbook') openPanel(null); // 광장에는 방명록이 없어요
}

// 손님에게 보이는 안내: 주인을 기다리는 중이면 화면 위쪽에 작게
let joinedAt = 0;
setInterval(() => {
  let msg = '';
  if (space !== 'home' && party && !party.connected) msg = space === 'plaza' ? '광장에 연결하고 있어요…' : '친구 섬에 연결하고 있어요…';
  else if (space === 'visit' && party) {
    const since = performance.now() - joinedAt;
    const has = party.gotWorld || (visitInfo && visitInfo.found);
    if (!has && since > 2500 && visitInfo && !visitInfo.loading) {
      msg = visitInfo.error && !visitInfo.missing ? '친구 섬을 불러오지 못했어요. 조금 뒤에 다시 열어 주세요'
        : visitInfo.missing ? '섬 주인이 지금 게임을 켜 두지 않았어요. 주인이 켜면 바로 만나요'
        : '아직 꾸며진 적 없는 섬이에요. 주인이 게임을 켜면 바로 만나요';
    } else if (has && !party.ownerHere && since > 1500 && since < 9000) msg = `${(visitInfo && visitInfo.owner) || '섬 주인'}님은 지금 섬에 없어요. 천천히 구경하고 방명록을 남겨 보세요`;
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
function moveTo(dest, room) {
  if (moving || (dest === space && (dest !== 'visit' || room === visitId))) return;
  if (dest === 'visit' && (!room || room === MY_ROOM)) { if (room === MY_ROOM) moveTo('home'); return; }
  if (dest === 'home' && ghost) { openAuth('signup', '가입하면 바로 내 섬이 생겨요. 꾸민 섬은 계정에 저장돼요', true); return; }
  if (dest === 'plaza' && !netConfigured()) { toast('광장은 서버 연결을 마친 뒤에 열려요'); return; }
  const go = () => {
    moving = true;
    hideUseCard(); pendingUse = null;
    document.getElementById('fade-text').textContent = dest === 'plaza' ? '광장으로 가는 중…' : dest === 'visit' ? '친구 섬으로 가는 중…' : '우리 집으로 가는 중…';
    fadeEl.classList.add('on');
    setTimeout(() => {
      if (space === 'home') saveNow(false); // 떠나기 전에 내 섬 저장
      leaveHouseNow(); // 집 안에서 바로 떠나도 다음엔 마당에서 시작
      stopParty();
      stopPlacing(true); select(null);
      if (currentPane === 'furniture') openPanel(null);
      undoStack.length = 0; redoStack.length = 0;
      space = dest;
      if (dest === 'plaza') { showPlaza(); clearVisitParam(); }
      else if (dest === 'visit') { visitId = room; setVisitParam(room); prepVisit(); }
      else {
        loadHome();
        clearVisitParam(); // 초대 링크 주소 지우기
      }
      avatar.target = null;
      setRole(dest === 'home' ? 'owner' : 'guest');
      cam.target.copy(avatar.position).add(new THREE.Vector3(0, 1.3, 0));
      showTitle(); refreshEnvButtons(); refreshSpaceUI();
      if (currentPane === 'space') refreshSpaceInfo();
      startParty();
      if (dest === 'visit') { joinedAt = performance.now(); loadVisit(room); }
      hidePeerCard();
      gbRefresh(); refreshRecent();
      if (dest === 'home') { checkNewGuestbook(); checkFriendRequests(); }
      requestAnimationFrame(() => requestAnimationFrame(() => { fadeEl.classList.remove('on'); moving = false; }));
      toast(dest === 'plaza' ? '광장에 왔어요' : dest === 'visit' ? '친구 섬에 놀러 왔어요' : '우리 집에 왔어요');
    }, 380);
  };
  go(); // 광장은 이름을 묻지 않고 바로 감 (이름이 없으면 '나그네', 친구 메뉴에서 언제든 바꿀 수 있음)
}
goBtn.addEventListener('click', () => moveTo(space === 'plaza' ? 'home' : 'plaza'));
document.getElementById('btn-home').addEventListener('click', (e) => { e.preventDefault(); moveTo('home'); });

refreshSpaceUI();
function clearVisitParam() {
  const q = new URLSearchParams(location.search);
  if (!q.has('visit')) return;
  q.delete('visit');
  history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : ''));
}
function setVisitParam(room) {
  const q = new URLSearchParams(location.search);
  q.set('visit', room);
  history.replaceState(null, '', `${location.pathname}?${q}`);
}
// ---- 친구 섬 구경 (v0.42) ----
// 원리: 친구 섬은 서버에 저장되어 있어서, 주인이 게임을 꺼 두어도 서버에서 꺼내 보여 줘요.
// 주인이 켜 두었으면 주인 화면이 보내 주는 지금 모습이 더 새것이라 그걸 써요 (같이 놀 수도 있고요).
let visitInfo = null; // { loading } / { found, owner } / { error, missing }
function prepVisit() {
  roomTitle = '친구의 섬';
  visitInfo = { loading: true };
  houseItems = [];
  world.apply({ type: 'replaceAll', items: [] }, { silent: true });
  avatar.restore({ x: (Math.random() - 0.5) * 3, z: 3 + Math.random() * 2, facing: 0 });
  avatar.target = null;
}
// 친구 섬 모습 보여 주기 (서버에서 꺼낸 것이든, 주인 화면이 보내 준 것이든)
function showVisitWorld(w) {
  roomTitle = w.title; showTitle();
  // 마당·집 안 모습 중, 지금 내가 있는 곳 것을 보여 줌
  if (inside) { world.setYard(w.items); world.apply({ type: 'replaceAll', items: w.house }, { silent: true }); }
  else { houseItems = w.house; world.apply({ type: 'replaceAll', items: w.items }, { silent: true }); }
  if (w.env) { env.restore(w.env); refreshEnvButtons(); }
  if (currentPane === 'space') refreshSpaceInfo();
}
async function loadVisit(room) {
  // 유령은 한 섬에 5명까지: 들어와서 3초쯤 뒤, 먼저 와 있던 유령 수를 세어 봄
  if (ghost) setTimeout(() => {
    if (space === 'visit' && visitId === room && party && [...party.peers.values()].filter((p) => p.ghost).length >= GHOST_LIMIT) turnGhostAway('이 섬은 유령 손님이 꽉 찼어요');
  }, 3000);
  let row = null;
  try { row = await visitIsland(room); }
  catch (e) { if (space === 'visit' && visitId === room) visitInfo = { error: true, missing: !!(e && e.missing) }; return; }
  if (space !== 'visit' || visitId !== room) return; // 그사이 다른 곳으로 갔으면 그만
  const s = row && migrate(row.data);
  if (!s) { visitInfo = { found: false }; return; }
  visitInfo = { found: true, owner: cleanName(row.nickname) };
  if (ghost && s.settings && s.settings.ghosts === false) { turnGhostAway('이 섬은 지금 유령 손님을 받지 않아요'); return; }
  rememberVisit(room, s.title, visitInfo.owner);
  if (party && party.gotWorld) return; // 주인 화면이 보내 준 게 더 새것
  showVisitWorld({
    title: String(s.title || '친구의 섬').slice(0, 20),
    items: s.items || [],
    house: (s.house && s.house.items) || [],
    env: s.env ? { ...s.env, flowing: false } : null,
  });
}
// 유령 손님을 받지 않는 섬이거나 유령이 꽉 찼으면, 광장으로 살며시 보내 줌
const GHOST_LIMIT = 5;
function turnGhostAway(msg) {
  if (space !== 'visit') return;
  moveTo('plaza');
  setTimeout(() => toast(`${msg}. 가입하면 들어갈 수 있어요`), 700);
}
// 친구 섬에 들어가기 (초대 링크로 왔을 때)
function enterVisit() {
  space = 'visit';
  setVisitParam(visitId);
  prepVisit();
  cam.target.copy(avatar.position).add(new THREE.Vector3(0, 1.3, 0));
  setRole('guest'); showTitle(); refreshEnvButtons(); refreshSpaceUI();
  joinedAt = performance.now();
  if (!netConfigured()) toast('아직 친구 섬과 연결할 수 없어요. 조금 뒤에 다시 열어 주세요');
  startParty();
  loadVisit(visitId);
  gbRefresh(); refreshRecent();
}
inviteInput.value = '';
if (!netConfigured()) {
  document.getElementById('net-off').classList.remove('hidden');
  document.getElementById('btn-invite').disabled = true;
}
myNameInput.value = myName;
myNameInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') myNameInput.blur(); });
myNameInput.addEventListener('change', () => {
  const n = cleanName(myNameInput.value);
  if (!n) { myNameInput.value = myName; toast('별명을 적어 주세요'); return; }
  myName = n; myNameInput.value = myName; saveName(myName);
  if (account) { setNickname(myName); document.getElementById('acc-name').textContent = myName; if (space === 'home') saveNow(false); }
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

// ---------- 유령 손님 받기 설정 (v0.42, 섬 주인만) ----------
document.getElementById('ghost-toggle').addEventListener('change', (e) => {
  ghostsOk = e.target.checked;
  scheduleSave(); // 저장하면서, 와 있는 친구들에게도 바로 알려 줌
  toast(ghostsOk ? '유령 손님도 구경 올 수 있어요' : '이제 가입한 친구만 놀러 올 수 있어요');
});

// ---------- 방명록 (v0.42) ----------
// 친구 섬에서는 한마디 남기고, 내 섬에서는 남겨진 글을 봐요. 새 글이 와도 빨간 표시는 없고, 집에 오면 한 번만 조용히 알려 줘요.
const gbCard = document.getElementById('gb-card');
const gbList = document.getElementById('gb-list');
const gbInput = document.getElementById('gb-input');
const gbSend = document.getElementById('gb-send');
const gbRoom = () => (space === 'home' ? MY_ROOM : space === 'visit' ? visitId : '');
const gbSeenKey = () => `cozy-space-demo:gbseen:${account ? account.id : ''}`;
// 방명록 글 시각: '11월 22일 오후 9:07' (한국 시간)
const gbDay = (iso) => new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });
let gbShownFor = '';
async function gbRefresh() {
  const room = gbRoom();
  gbCard.classList.toggle('hidden', !room);
  if (!room) return;
  document.getElementById('gb-title').textContent = space === 'home' ? '내 섬 방명록' : `${roomTitle} 방명록`;
  // 손님도, 섬 주인도 쓸 수 있어요 (v0.44). 유령은 읽기만
  document.getElementById('gb-write').classList.toggle('hidden', ghost || !account);
  gbInput.placeholder = space === 'home' ? '놀러 올 친구들에게 한마디 남겨요 (100자까지)' : '섬 주인에게 한마디 남겨요 (100자까지)';
  document.getElementById('gb-ghost-note').classList.toggle('hidden', space !== 'visit' || !ghost);
  if (gbShownFor !== room) gbList.innerHTML = '<div class="gb-empty">불러오는 중…</div>';
  let rows;
  try { rows = await guestbookList(room); }
  catch (e) { if (gbRoom() === room) gbList.innerHTML = `<div class="gb-empty">${e && e.missing ? '방명록은 곧 열려요' : `방명록을 불러오지 못했어요 (${String((e && (e.code || e.message)) || '').slice(0, 30).replace(/[<>&]/g, '')})`}</div>`; return; }
  if (gbRoom() !== room) return;
  gbShownFor = room;
  gbList.innerHTML = '';
  if (!rows.length) gbList.innerHTML = `<div class="gb-empty">${space === 'home' ? '아직 남겨진 글이 없어요. 초대 링크를 보내 보세요' : '첫 번째로 한마디 남겨 보세요'}</div>`;
  rows.forEach((g) => {
    const el = document.createElement('div');
    el.className = 'gb-item';
    el.innerHTML = '<div class="gb-meta"><b></b><span></span></div><p></p>';
    el.querySelector('b').textContent = g.author_name || '이름 없음';
    el.querySelector('span').textContent = gbDay(g.created_at);
    el.querySelector('p').textContent = g.body;
    if (g.mine || (space === 'home' && account)) {
      // 지우기는 한 번 더 눌러야 해요 (실수로 지우지 않게)
      const del = document.createElement('button');
      del.textContent = '지우기';
      del.addEventListener('click', async () => {
        if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = '한 번 더 누르면 지워요'; setTimeout(() => { del.dataset.sure = ''; del.textContent = '지우기'; }, 3000); return; }
        del.disabled = true;
        if (await guestbookDelete(g.id)) { toast('방명록 글을 지웠어요'); gbRefresh(); } else { toast('지우지 못했어요. 조금 뒤에 다시 해 주세요'); del.disabled = false; }
      });
      el.querySelector('.gb-meta').appendChild(del);
    }
    gbList.appendChild(el);
  });
  if (space === 'home' && rows[0]) { try { localStorage.setItem(gbSeenKey(), rows[0].created_at); } catch (e) { /* 무시 */ } }
}
let gbBusy = false;
async function gbWrite() {
  const body = gbInput.value.replace(/\s+/g, ' ').trim();
  if (!body) { toast('남길 말을 적어 주세요'); gbInput.focus(); return; }
  const room = gbRoom();
  if (gbBusy || !room || ghost || !account) return;
  gbBusy = true; gbSend.disabled = true;
  const r = await guestbookWrite(room, body, nameOr());
  gbBusy = false; gbSend.disabled = false;
  const msgEl = document.getElementById('gb-msg');
  msgEl.textContent = r.error || ''; msgEl.classList.toggle('hidden', !r.error); // 실패하면 글 아래에 남겨 둬요 (금방 사라지지 않게)
  if (r.error) { toast(r.error); return; }
  gbInput.value = ''; gbLeft();
  toast('방명록에 남겼어요');
  gbRefresh();
}
const gbLeft = () => { document.getElementById('gb-left').textContent = `${gbInput.value.length}/100`; };
gbInput.addEventListener('input', gbLeft);
gbInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); gbWrite(); } });
gbSend.addEventListener('click', gbWrite);
// 집에 왔을 때: 지난번에 본 뒤로 새 글이 있으면 한 번만 알려 줌
let gbToldTop = '';
async function checkNewGuestbook() {
  if (!account || !MY_ROOM) return;
  let rows; try { rows = await guestbookList(MY_ROOM); } catch (e) { return; }
  if (space !== 'home' || !rows.length || rows[0].created_at === gbToldTop) return;
  let seen = ''; try { seen = localStorage.getItem(gbSeenKey()) || ''; } catch (e) { /* 무시 */ }
  const n = rows.filter((g) => !g.mine && (!seen || g.created_at > seen)).length;
  if (!n) return;
  gbToldTop = rows[0].created_at;
  setTimeout(() => toast(`방명록에 새 글이 ${n}개 있어요. 오른쪽 방명록에서 볼 수 있어요`), 1600);
}

// ---------- 친구 맺기 (v0.42) ----------
// 섬·광장에서 만난 사람은 캐릭터(또는 '지금 섬에 있는 사람' 목록)를 눌러 신청하고, 밖에서 아는 사람은 6글자 친구 코드로 신청해요.
// 상대가 수락하면 서로 친구가 되고, 친구 목록의 '놀러 가기'로 그 친구 섬에 바로 가요 (친구가 게임을 꺼 두어도 구경할 수 있어요).
// 받은 신청은 빨간 표시 없이 친구 창에만 조용히 떠요. 친구를 끊어도 상대에게 알리지 않아요.
let friends = [];        // [{ room, nickname, title, status }]
let friendsOff = false;  // 서버 준비 전 (SQL을 아직 안 돌렸을 때)
const friendStatus = (room) => (friends.find((f) => f.room === room) || {}).status || '';
let myCode = '';
async function friendsRefresh() {
  const on = !!account;
  document.getElementById('ghost-friend-note').classList.toggle('hidden', on);
  ['friend-card', 'req-card', 'sent-card'].forEach((id) => { if (!on) document.getElementById(id).classList.add('hidden'); });
  if (!on) return;
  try { friends = await friendList(); friendsOff = false; }
  catch (e) { friendsOff = !!(e && e.missing); if (!friendsOff) return; friends = []; }
  if (!myCode && !friendsOff) { try { myCode = await friendCode(); } catch (e) { /* 무시 */ } }
  document.getElementById('my-code').textContent = myCode || (friendsOff ? '준비 중' : '저장 후 생겨요');
  const ok = friends.filter((f) => f.status === 'friend'), got = friends.filter((f) => f.status === 'received'), sent = friends.filter((f) => f.status === 'sent');
  document.getElementById('friend-card').classList.remove('hidden');
  document.getElementById('friend-count').textContent = ok.length ? `${ok.length}명` : '';
  const fl = document.getElementById('friend-list');
  fl.innerHTML = '';
  if (friendsOff) fl.innerHTML = '<div class="friend-empty">친구 맺기는 곧 열려요.</div>';
  else if (!ok.length) fl.innerHTML = '<div class="friend-empty">아직 친구가 없어요. 광장에서 만난 사람을 눌러 친구 신청해 보세요.</div>';
  ok.forEach((f) => fl.appendChild(friendRow(f, [
    space === 'visit' && visitId === f.room ? ['지금 여기', null, true] : ['놀러 가기', () => moveTo('visit', f.room)],
    ['끊기', async () => { if (await friendRemove(f.room)) { toast(`${f.nickname || '친구'}님과 친구를 끊었어요`); friendsRefresh(); } }, false, true],
  ])));
  document.getElementById('req-card').classList.toggle('hidden', !got.length);
  const rl = document.getElementById('req-list'); rl.innerHTML = '';
  got.forEach((f) => rl.appendChild(friendRow(f, [
    ['수락', async () => { if (await friendAnswer(f.room, true)) { toast(`${f.nickname || '친구'}님과 친구가 됐어요`); friendsRefresh(); } }, false, false, true],
    ['괜찮아요', async () => { if (await friendAnswer(f.room, false)) friendsRefresh(); }, false, true],
  ])));
  document.getElementById('sent-card').classList.toggle('hidden', !sent.length);
  const sl = document.getElementById('sent-list'); sl.innerHTML = '';
  sent.forEach((f) => sl.appendChild(friendRow(f, [['거두기', async () => { if (await friendRemove(f.room)) friendsRefresh(); }, false, true]])));
  if (party) party.peopleChanged();
}
// 친구 한 줄: 이름 · 섬 이름 · 버튼들 [글자, 누르면 할 일, 막힘, 조용한 버튼(두 번 눌러 확인), 강조]
function friendRow(f, buttons) {
  const row = document.createElement('div');
  row.className = 'friend-row';
  row.innerHTML = '<div class="who"><b></b><span></span></div>';
  row.querySelector('b').textContent = f.nickname || '이름 없음';
  row.querySelector('span').textContent = f.title || '';
  buttons.forEach(([label, fn, off, quiet, strong]) => {
    const b = document.createElement('button');
    b.className = quiet ? 'quiet' : strong ? 'btn btn-accent' : 'btn';
    b.textContent = label; b.disabled = !!off;
    b.addEventListener('click', () => {
      if (quiet && label === '끊기' && b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '정말 끊기'; setTimeout(() => { b.dataset.sure = ''; b.textContent = label; }, 3000); return; }
      b.disabled = true; fn && fn();
    });
    row.appendChild(b);
  });
  return row;
}
async function askFriend(target, name) {
  if (!account) { openAuth('signup', '가입하면 친구를 맺고, 친구 섬에 바로 놀러 갈 수 있어요', true); return; }
  const r = await friendRequest(target);
  if (r.error) { toast(r.error); return; }
  const who = name ? `${name}님` : '친구';
  toast(r.status === 'friend' ? `${who}과(와) 친구가 됐어요` : r.status === 'already' ? (friendStatus(target.room) === 'friend' ? `이미 ${who}과(와) 친구예요` : '이미 신청을 보냈어요. 답을 기다려요') : `${who}에게 친구 신청을 보냈어요`);
  await friendsRefresh();
  if (peerShown) showPeerCard(peerShown);
}
const codeInput = document.getElementById('code-input');
codeInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendCode(); } });
function sendCode() {
  const code = codeInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) { toast('친구 코드 6글자를 적어 주세요'); codeInput.focus(); return; }
  codeInput.value = '';
  askFriend({ code });
}
document.getElementById('code-send').addEventListener('click', sendCode);
document.getElementById('my-code').addEventListener('click', () => { if (myCode && navigator.clipboard) navigator.clipboard.writeText(myCode).then(() => toast('내 친구 코드를 복사했어요'), () => {}); });
// 집에 왔을 때: 받은 친구 신청이 있으면 한 번만 조용히 알려 줌
let reqTold = '';
async function checkFriendRequests() {
  await friendsRefresh();
  const got = friends.filter((f) => f.status === 'received');
  const key = got.map((f) => f.room).join(',');
  if (space !== 'home' || !got.length || key === reqTold) return;
  reqTold = key;
  setTimeout(() => toast(`친구 신청이 ${got.length}개 와 있어요. 오른쪽 친구 창에서 볼 수 있어요`), 3600);
}
// 친구 캐릭터 카드
const peerCard = document.getElementById('peer-card');
let peerShown = null;
function showPeerCard(p) {
  peerShown = p;
  const st = p.room ? friendStatus(p.room) : '';
  document.getElementById('peer-name').textContent = p.name;
  document.getElementById('peer-state').textContent = p.ghost ? '유령 손님' : st === 'friend' ? '친구' : p.role === 'owner' ? '섬 주인' : '';
  const add = document.getElementById('peer-add');
  add.classList.toggle('hidden', !account || p.ghost || !p.room || st === 'friend');
  add.textContent = st === 'sent' ? '신청 보냄' : st === 'received' ? '친구 수락' : '친구 신청';
  add.disabled = st === 'sent';
  const here = space === 'visit' ? visitId : space === 'home' ? MY_ROOM : '';
  document.getElementById('peer-visit').classList.toggle('hidden', !p.room || p.room === here);
  peerCard.classList.remove('hidden');
}
const hidePeerCard = () => { peerCard.classList.add('hidden'); peerShown = null; };
document.getElementById('peer-close').addEventListener('click', hidePeerCard);
document.getElementById('peer-add').addEventListener('click', () => peerShown && askFriend({ room: peerShown.room }, peerShown.name));
document.getElementById('peer-visit').addEventListener('click', () => { const p = peerShown; hidePeerCard(); if (p) moveTo('visit', p.room); });

// ---------- 다녀온 섬 (v0.42) ----------
// 한 번 놀러 간 섬은 최근 5개까지 이 브라우저에 기억해 둬요. 링크를 다시 찾지 않아도 바로 갈 수 있게.
const recentKey = () => `cozy-space-demo:recent:${account ? account.id : 'ghost'}`;
function readRecent() { try { const a = JSON.parse(localStorage.getItem(recentKey()) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function rememberVisit(room, title, owner) {
  if (!room || room === MY_ROOM) return;
  const old = readRecent().find((r) => r.room === room) || {};
  const list = [{ room, title: String(title || old.title || '친구의 섬').slice(0, 20), owner: cleanName(owner) || old.owner || '' }, ...readRecent().filter((r) => r.room !== room)].slice(0, 5);
  try { localStorage.setItem(recentKey(), JSON.stringify(list)); } catch (e) { /* 무시 */ }
  refreshRecent();
}
function refreshRecent() {
  const list = readRecent().filter((r) => r && /^[a-z0-9]{1,16}$/.test(r.room) && r.room !== MY_ROOM);
  const box = document.getElementById('recent-list');
  document.getElementById('recent-card').classList.toggle('hidden', !list.length);
  box.innerHTML = '';
  list.forEach((r) => {
    const here = space === 'visit' && r.room === visitId;
    const b = document.createElement('button');
    b.className = 'wide-btn';
    b.innerHTML = `${icon('home')}<span></span><em></em>`;
    b.querySelector('span').textContent = r.title;
    b.querySelector('em').textContent = here ? '지금 여기' : r.owner ? `${r.owner}님` : '';
    b.disabled = here;
    b.addEventListener('click', () => moveTo('visit', r.room));
    box.appendChild(b);
  });
}
if (!party) renderPeople([{ name: nameOr(), role, me: true }]);

// ---------- 우리 집: 문으로 들어가고 나오기 (화면 전환 없이) ----------
// 원리: 바깥 집과 집 안 방은 크기가 같아요. 문 앞에 닿으면 바깥 집을 숨기고 같은 자리에 방을 보여 주는데,
// 방 위에 바깥 집과 똑같은 지붕을 덮어 두었다가 스르륵 투명하게 걷어 내고, 카메라 쪽 벽은 천천히 낮춰요.
// 그래서 집이 '열리면서' 안이 보이고, 둘레의 마당과 친구들도 그대로 보여요. 나올 때는 거꾸로 지붕이 다시 덮여요.
// 집 안에서는 '집 가운데 = (0,0)'인 집 기준 자리를 쓰고, 마당 전체를 그만큼 돌려 놓아요 (world.enterHouse).
let doorArmed = false; // 방금 나온 문에 바로 다시 들어가지 않게, 문에서 조금 떨어져야 다시 켜짐
let leaving = false;   // 집 밖으로 걸어 나가는 중 (지붕이 덮이는 중)
function yardList() { return inside ? [...world.yardMap.values()].map(({ data }) => ({ ...data })) : world.serialize(); }
function houseList() { return inside ? world.serialize() : houseItems; }
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

// ---------- 가구 사용하기 (v0.49) ----------
// 꾸미기 중이 아닐 때 가구를 한 번 누르면 작은 '사용하기' 카드가 떠요. 고르면 캐릭터가 걸어가서 그 동작을 해요.
// 움직이거나(땅 누르기·방향키) 점프·인사를 하면 일어나요. 친구 화면에도 같은 자세로 보여요(party.js의 st 쪽지).
// 가구마다 고를 건 1~2개만. 새 동작은 USES에 한 줄, 자리는 useSpot에서 정해요.
const USES = {
  chair: [{ kind: 'sit', name: '앉기' }, { kind: 'doze', name: '꾸벅꾸벅 졸기' }],
  bench: [{ kind: 'sit', name: '앉기' }, { kind: 'doze', name: '꾸벅꾸벅 졸기' }],
  bed: [{ kind: 'lie', name: '눕기' }, { kind: 'sleep', name: '이불 덮고 자기' }],
  shelf: [{ kind: 'read', name: '책 읽기' }],
};
const WINDOW_USES = [{ kind: 'look', name: '창밖 보기' }];
const USE_NAMES = { chair: '나무 의자', bench: '벤치', bed: '작은 침대', shelf: '책장', window: '창문' };
const useCard = document.getElementById('use-card');
let useShown = null;   // 카드에 띄운 가구 { id | win, x, z, type }
let pendingUse = null; // 걸어가는 중인 사용하기 { kind, x, z, facing, h, exit, approach, id }
const canUse = () => !ghost && !decorating && !placing && !avatar.swimming && !avatar.fishing;

// 누른 자리의 쓸 수 있는 가구 (없으면 null)
function pickUse(e) {
  if (!canUse()) return null;
  setNdc(e);
  if (inside) {
    const wins = world.walls.flatMap((w) => w.userData.windows).filter((g) => g.visible);
    const hit = raycaster.intersectObjects(wins, true)[0];
    const furn = raycaster.intersectObject(world.root, true)[0];
    if (hit && (!furn || hit.distance <= furn.distance + 0.01)) {
      let g = hit.object; while (g && !wins.includes(g)) g = g.parent;
      const wall = g.parent.parent, n = wall.userData.normal; // 바깥 방향
      const wp = g.getWorldPosition(new THREE.Vector3());
      return { win: true, type: 'window', x: wp.x - n.x * 0.15, z: wp.z - n.z * 0.15, n };
    }
  }
  let id = null;
  for (const h of raycaster.intersectObject(world.root, true)) { id = world.findItemFromObject(h.object); if (id) break; }
  const ok = (i) => i && world.items.get(i) && USES[world.items.get(i).data.type];
  if (!ok(id)) {
    id = null;
    const p = groundPoint(e);
    let best = 0.8;
    if (p) world.items.forEach(({ data }) => { if (!USES[data.type]) return; const d = Math.hypot(data.x - p.x, data.z - p.z); if (d < best) { best = d; id = data.id; } });
  }
  if (!ok(id)) return null;
  const d = world.items.get(id).data;
  return { id, type: d.type, x: d.x, z: d.z };
}

// 가구 자리 계산: 가구 기준 자리(lx, lz)를 지금 화면 자리로
function useSpot(u, kind) {
  if (u.win) {
    const f = Math.atan2(u.n.x, u.n.z); // 창밖을 바라봐요
    const at = clampPos(u.x - u.n.x * 0.55, u.z - u.n.z * 0.55);
    return { kind, x: at.x, z: at.z, facing: f, h: 0, exit: at, approach: at };
  }
  const it = world.items.get(u.id);
  if (!it) return null;
  const { x, z, rot } = it.data, a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const L = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  const me = avatar.position;
  const myLx = (me.x - x) * c - (me.z - z) * s; // 내가 가구의 왼쪽/오른쪽 어디에 있는지
  const base = { kind, facing: a, id: u.id, key: `${x},${z},${rot}` };
  const fix = (o) => { o.exit = clampPos(o.exit.x, o.exit.z); o.approach = o.approach || o.exit; return o; };
  if (u.type === 'chair') { const seat = L(0, 0.04); return fix({ ...base, ...seat, h: 0.54, exit: L(0, 0.8) }); }
  if (u.type === 'bench') {
    // 긴 벤치는 세 자리. 내 쪽에서 가까운 빈자리에 앉아요
    const spots = [-0.42, 0, 0.42].sort((p, q) => Math.abs(p - myLx) - Math.abs(q - myLx));
    const lx = spots.find((v) => !taken(L(v, 0.02))) ?? spots[0];
    return fix({ ...base, ...L(lx, 0.02), h: 0.46, exit: L(lx, 0.85) });
  }
  if (u.type === 'bed') {
    const side = myLx < 0 ? -1 : 1; // 내가 선 쪽으로 내려와요
    return fix({ ...base, ...L(0, 0.85), h: 0.62, exit: L(side * 1.05, 0.3) });
  }
  if (u.type === 'shelf') { const at = L(0, 0.78); return fix({ ...base, ...at, h: 0, exit: at }); }
  return null;
}
// 친구가 이미 그 자리를 쓰고 있는지
function taken(pt) {
  if (!party) return false;
  return [...party.peers.values()].some((p) => p.av.pose && p.av.root.visible && Math.hypot(p.av.pose.x - pt.x, p.av.pose.z - pt.z) < 0.35);
}

function showUseCard(u) {
  useShown = u;
  document.getElementById('use-name').textContent = USE_NAMES[u.type] || '';
  const list = document.getElementById('use-actions');
  list.innerHTML = '';
  (u.win ? WINDOW_USES : USES[u.type]).forEach((m) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = m.name;
    b.addEventListener('click', () => startUse(u, m.kind));
    list.appendChild(b);
  });
  useCard.classList.remove('hidden');
  placeUseCard();
}
function hideUseCard() { useShown = null; useCard.classList.add('hidden'); }
document.getElementById('use-close').addEventListener('click', hideUseCard);
// 카드는 가구 바로 위에 떠 있어요 (화면을 돌려도 따라가요)
function placeUseCard() {
  if (!useShown) return;
  const v = new THREE.Vector3(useShown.x, useShown.win ? 2.7 : 1.7, useShown.z).project(camera);
  if (v.z > 1) { useCard.style.visibility = 'hidden'; return; }
  useCard.style.visibility = '';
  const W = viewport.clientWidth, H = viewport.clientHeight;
  const cw = useCard.offsetWidth, ch = useCard.offsetHeight;
  const px = Math.max(cw / 2 + 8, Math.min(W - cw / 2 - 8, ((v.x + 1) / 2) * W));
  const py = Math.max(ch + 8, Math.min(H - 8, ((1 - v.y) / 2) * H));
  useCard.style.left = `${px}px`; useCard.style.top = `${py}px`;
}

function startUse(u, kind) {
  hideUseCard();
  const sp = useSpot(u, kind);
  if (!sp) return;
  if (taken(sp)) { toast('친구가 쓰고 있어요'); return; }
  if (avatar.pose) avatar.clearPose(true);
  route.length = 0;
  pendingUse = { ...sp, where: `${space}:${inside}`, t0: performance.now() };
  avatar.running = false;
  avatar.moveTo(sp.approach.x, sp.approach.z);
  marker.visible = false;
}
function standUp() {
  if (!avatar.pose) return;
  avatar.clearPose(false);
  if (party) party.sendState(true);
}
// 매 프레임: 가구 앞에 닿으면 자세 잡기, 가구가 옮겨지거나 치워지면 일어나기
function updateUse() {
  placeUseCard();
  if (pendingUse) {
    const pu = pendingUse;
    if (pu.where !== `${space}:${inside}` || (pu.id && !world.items.get(pu.id)) || performance.now() - pu.t0 > 12000) { pendingUse = null; return; }
    const d = Math.hypot(avatar.position.x - pu.approach.x, avatar.position.z - pu.approach.z);
    // 가구에 몸이 닿았으면(뒤나 옆에서 왔어도) 바로 앉아요. 둥근 부딪힘에 걸려 빙빙 돌지 않게
    const it = pu.id && world.items.get(pu.id);
    const touch = it && Math.hypot(avatar.position.x - it.data.x, avatar.position.z - it.data.z) < (ITEM_BY_TYPE[it.data.type].radius || 0) + 0.5;
    if (d < 0.3 || touch || (!avatar.target && d < 1.3)) {
      pendingUse = null;
      avatar.setPose(pu);
      if (party) party.sendState(true);
    } else if (!avatar.target) { pendingUse = null; toast('가까이 갈 수 없어요. 둘레 물건을 조금 옮겨 보세요'); } // 길이 막혀 못 갔어요
  }
  const ap = avatar.pose;
  if (ap && ap.id) {
    const it = world.items.get(ap.id);
    if (!it || `${it.data.x},${it.data.z},${it.data.rot}` !== ap.key) standUp();
  }
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

// ---------- 로그인 · 가입 · 유령 손님 (v0.41) ----------
// 처음 켜면: 예전에 로그인해 둔 적이 있으면 바로 내 섬으로, 아니면 로그인 창이 떠요 (뒤에는 광장이 보여요).
// 손님으로 구경하기를 누르면 유령 모습으로 광장에서 시작해요. 유령은 걷기·점프·인사만 되고,
// 말하기·꾸미기·저장은 안 돼요. 언제든 위쪽 '가입하고 내 섬 받기'로 가입할 수 있어요.
const authEl = document.getElementById('auth');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPw = document.getElementById('auth-pw');
const authNick = document.getElementById('auth-nick');
const authMsg = document.getElementById('auth-msg');
const authSubmit = document.getElementById('auth-submit');
const authSub = document.getElementById('auth-sub');
const AUTH_SUB = authSub.textContent;
let authMode = 'login', authBusy = false;

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('on', mode === 'login');
  document.getElementById('tab-signup').classList.toggle('on', mode === 'signup');
  authEl.querySelectorAll('.signup-only').forEach((el) => el.classList.toggle('hidden', mode !== 'signup'));
  authSubmit.textContent = mode === 'login' ? '로그인' : '가입하고 내 섬 받기';
  authPw.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  showAuthMsg('');
}
function showAuthMsg(text, ok) {
  authMsg.textContent = text;
  authMsg.classList.toggle('ok', !!ok);
  authMsg.classList.toggle('hidden', !text);
}
function openAuth(mode = 'login', sub = '', closable = false) {
  setAuthMode(mode);
  authSub.textContent = sub || (visitId ? '친구가 섬에 초대했어요. 로그인하거나 손님으로 들어가요' : AUTH_SUB);
  document.getElementById('auth-close').classList.toggle('hidden', !closable);
  // 이미 유령으로 놀고 있으면 '손님으로 구경하기'는 필요 없음
  document.getElementById('auth-ghost').classList.toggle('hidden', ghost);
  document.getElementById('auth-ghost-note').classList.toggle('hidden', ghost);
  authEl.querySelector('.auth-or').classList.toggle('hidden', ghost);
  authEl.classList.remove('hidden');
  if (!isPhone()) setTimeout(() => authEmail.focus(), 60);
}
const closeAuth = () => authEl.classList.add('hidden');
document.getElementById('tab-login').addEventListener('click', () => setAuthMode('login'));
document.getElementById('tab-signup').addEventListener('click', () => setAuthMode('signup'));
document.getElementById('auth-close').addEventListener('click', closeAuth);
authEl.addEventListener('keydown', (e) => e.stopPropagation()); // 글자를 치는 동안 캐릭터·단축키가 움직이지 않게

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (authBusy) return;
  const email = authEmail.value.trim(), pw = authPw.value, nick = cleanName(authNick.value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthMsg('이메일 주소를 다시 확인해 주세요'); authEmail.focus(); return; }
  if (pw.length < 6) { showAuthMsg('비밀번호는 6자 이상으로 적어 주세요'); authPw.focus(); return; }
  if (authMode === 'signup' && !nick) { showAuthMsg('섬에서 보일 별명을 적어 주세요'); authNick.focus(); return; }
  authBusy = true; authSubmit.disabled = true;
  showAuthMsg(authMode === 'login' ? '로그인하고 있어요…' : '가입하고 있어요…', true);
  const r = authMode === 'login' ? await signIn(email, pw) : await signUp(email, pw, nick);
  authBusy = false; authSubmit.disabled = false;
  if (r.error) { showAuthMsg(r.error); return; }
  if (r.confirm) {
    setAuthMode('login');
    authEmail.value = email; authPw.value = '';
    showAuthMsg('메일함에 가입 확인 메일을 보냈어요. 메일 속 링크를 누른 뒤, 여기서 로그인해 주세요', true);
    return;
  }
  authPw.value = '';
  // 유령으로 놀다가 가입했으면: 새로 열어서 깨끗하게 내 섬으로 (로그인은 브라우저가 기억해 둠)
  if (ghost) { location.reload(); return; }
  closeAuth();
  enterAccount(r.user, authMode === 'signup');
});

document.getElementById('auth-ghost').addEventListener('click', () => { closeAuth(); enterGhost(); });
document.getElementById('btn-ghost-join').addEventListener('click', () => openAuth('signup', '가입하면 바로 내 섬이 생기고, 친구와 이야기도 나눌 수 있어요', true));

// 유령 손님으로 시작
function enterGhost() {
  ghost = true; account = null;
  document.body.classList.add('ghost');
  avatar.setGhost(true);
  chatInput.disabled = true;
  document.getElementById('chat-send').disabled = true;
  chatInput.placeholder = isPhone() ? '유령은 말할 수 없어요' : '유령은 말할 수 없어요 · 가입하면 이야기할 수 있어요';
  myNameInput.disabled = true;
  if (visitId) { enterVisit(); toast('유령 모습으로 친구 섬에 구경 왔어요'); return; }
  space = 'plaza';
  setRole('guest'); showTitle(); refreshSpaceUI();
  startParty();
  toast('유령 모습으로 광장에 왔어요. 천천히 둘러보세요');
}

// 로그인한 사람으로 시작: 서버의 내 섬과 이 컴퓨터의 임시 보관 중 더 새것을 골라 열어요
async function enterAccount(user, isNew) {
  account = user; ghost = false;
  document.body.classList.remove('ghost');
  MY_ROOM = user.id.replace(/[^a-z0-9]/gi, '').slice(0, 16);
  inviteInput.value = inviteLink();
  myName = user.nickname || myName || user.email.split('@')[0].slice(0, 10);
  fadeEl.classList.add('on');
  document.getElementById('fade-text').textContent = '내 섬을 불러오고 있어요…';
  let cloud = null, cloudErr = null;
  try {
    const row = await loadIsland(user.id);
    if (row) { cloud = migrate(row.data); if (!user.nickname && row.nickname) myName = cleanName(row.nickname); }
  } catch (e) { cloudErr = e || {}; if (cloudErr.missing) cloudOff = true; }
  const local = loadState(userKey(user.id));
  let pick = cloud && local ? ((local.savedAt || 0) > (cloud.savedAt || 0) ? local : cloud) : (cloud || local);
  let moved = false;
  // 처음 로그인: 서버에 섬이 없으면, 로그인 없던 때 이 컴퓨터에 꾸며 둔 섬을 내 계정으로 옮겨 줘요 (한 계정에만 한 번)
  if (!pick && (!cloudErr || cloudErr.missing)) { pick = takeLegacy(user.id); moved = !!pick; }
  if (pick) {
    saveState(pick, userKey(user.id));
    if (pick !== cloud) queueCloud(pick, true);
  }
  saveName(myName); myNameInput.value = myName;
  document.getElementById('acc-name').textContent = myName;
  document.getElementById('acc-email').textContent = user.email;
  refreshSaveLabel();
  if (visitId && visitId !== MY_ROOM) { fadeEl.classList.remove('on'); enterVisit(); return; }
  clearVisitParam();
  moveTo('home');
  setTimeout(() => {
    if (moved) toast('이 컴퓨터에 꾸며 둔 섬을 내 계정으로 옮겼어요');
    else if (cloudOff) toast('서버 저장소가 아직 준비 중이라, 이 컴퓨터에만 저장해 둘게요');
    else if (cloudErr) toast('서버에 연결하지 못해서, 이 컴퓨터에 있던 섬을 열었어요');
    else if (isNew) toast(`${myName}님, 환영해요! 내 섬이 생겼어요`);
    if (!pick && !cloud) saveNow(false); // 새 섬도 바로 계정에 한 번 저장
  }, 900);
  maybeHelp();
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  saveNow(false);
  await flushCloud();
  await signOut();
  location.href = location.pathname + (new URLSearchParams(location.search).has('localtest') ? '?localtest=1' : '');
});

// 켤 때: 로그인해 둔 적이 있는지 보기
(async () => {
  if (!authReady()) { openAuth('login', '지금은 서버에 연결할 수 없어요. 손님으로 구경할 수 있어요'); return; }
  const u = await currentUser();
  if (u) enterAccount(u); else openAuth('login');
})();

// ---------- 매 프레임 ----------
const clock = new THREE.Clock();
let realTick = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (keys.has('q')) cam.yaw += dt * 1.8;
  if (keys.has('e')) cam.yaw -= dt * 1.8;
  const typing = !help.classList.contains('hidden') || !joinEl.classList.contains('hidden') || !authEl.classList.contains('hidden');
  const mvIn = typing ? { x: 0, y: 0 } : moveInput();
  if (mvIn.x || mvIn.y) { if (avatar.pose) standUp(); pendingUse = null; } // 움직이면 일어나요
  updateUse();
  avatar.update(dt, mvIn, cam.yaw, world.colliders());
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
window.cozy = { world, avatar, startUse, pickUse, useSpot, env, cam, camera, saveNow, sound, setRole, chat, undo, redo, get party() { return party; }, moveTo, get space() { return space; }, get inside() { return inside; }, goThroughDoor };
