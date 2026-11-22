// 물건 카드에 넣을 작은 그림. 게임 속 3D 물건을 그대로 한 번씩 찍어서 그림으로 만듭니다.
// 원리: 보이지 않는 작은 3D 화면을 하나 만들고, 물건을 하나씩 올려 사진을 찍은 뒤 치웁니다.
// 그래서 물건 모양을 고치면 카드 그림도 저절로 같이 바뀝니다.
import * as THREE from 'three';
import { buildItem } from './catalog.js?v=0.51';

export function makeThumbnails(types, size = 112) {
  const out = {};
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) { return out; }
  r.setSize(size, size, false);
  r.setPixelRatio(1);
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cbe8, 1.9));
  const sun = new THREE.DirectionalLight(0xfff4e4, 1.6);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  const box = new THREE.Box3(), c = new THREE.Vector3(), s = new THREE.Vector3();

  types.forEach((type) => {
    const obj = buildItem(type);
    scene.add(obj);
    box.setFromObject(obj);
    box.getCenter(c); box.getSize(s);
    const rad = Math.max(s.x, s.y, s.z) * 0.62;
    const dist = rad / Math.sin((cam.fov / 2) * Math.PI / 180);
    // 비스듬히 위에서 내려다보는 각도 (게임 화면과 비슷하게)
    const dir = new THREE.Vector3(0.75, 0.62, 1).normalize();
    cam.position.copy(c).addScaledVector(dir, dist);
    cam.lookAt(c);
    r.render(scene, cam);
    out[type] = r.domElement.toDataURL('image/png');
    scene.remove(obj);
  });
  r.dispose();
  if (r.forceContextLoss) r.forceContextLoss();
  return out;
}
