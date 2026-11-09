// @ts-nocheck
/* Personaje con cabeza de computador en 3D (prueba realista).
   Recurso gráfico secundario: NO es un asistente automatizado ni una mascota oficial.
   La pantalla muestra dos ojos en forma de pastilla (como el isotipo) que siguen el cursor. */
import { THREE, weaveTexture } from './stage';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export function buildCharacter(pose = 'point') {
  const g = new THREE.Group();
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0xdfe6e8, roughness: 0.42, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const plasticDk = new THREE.MeshStandardMaterial({ color: 0xaab7bd, roughness: 0.55, metalness: 0.1 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3b4c59, roughness: 0.95, metalness: 0, bumpMap: weaveTexture(), bumpScale: 0.8 });
  const clothDk = new THREE.MeshStandardMaterial({ color: 0x2c3a45, roughness: 0.95, bumpMap: weaveTexture(), bumpScale: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf3f8f9, roughness: 0.8 });
  const tie = new THREE.MeshStandardMaterial({ color: 0x41b9c1, roughness: 0.5, metalness: 0.1 });
  const hand = new THREE.MeshPhysicalMaterial({ color: 0xe9f1f3, roughness: 0.5, clearcoat: 0.3 });
  const add = (geo, mat, pos, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  // Cabeza: monitor
  const head = new THREE.Group(); head.position.set(0, 3.55, 0); g.add(head);
  add(new RoundedBoxGeometry(2.3, 2.1, 1.0, 8, 0.2), plastic, [0, 0, 0.1], head);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 1.0, 1.1, 4, 1, false, Math.PI / 4).rotateX(Math.PI / 2), plastic); back.scale.set(1.0, 1, 0.95); back.position.set(0, 0.0, -0.9); back.castShadow = true; head.add(back);
  back.scale.set(1.28 * 1.05, 1.0, 1.0); back.rotation.z = 0; back.geometry.scale(1, 1.0, 1);
  // pantalla con ojos dibujados en canvas
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const cx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const look = { x: 0, y: 0 };
  const draw = () => {
    const gr = cx.createLinearGradient(0, 0, 640, 480); gr.addColorStop(0, '#12303F'); gr.addColorStop(1, '#06131C'); cx.fillStyle = gr; cx.fillRect(0, 0, 640, 480);
    cx.fillStyle = 'rgba(255,255,255,.07)'; cx.beginPath(); cx.moveTo(40, 30); cx.lineTo(330, 30); cx.lineTo(170, 450); cx.lineTo(40, 450); cx.closePath(); cx.fill();
    cx.shadowColor = '#01DCEF'; cx.shadowBlur = 36; cx.fillStyle = '#41B9C1';
    [200, 440].forEach((ex) => { const x = ex + look.x * 38, y = 180 + look.y * 26, w = 92, h = 160, r = w / 2; cx.beginPath(); cx.moveTo(x - r + 0, y - h / 2 + r); cx.arc(x, y - h / 2 + r, r, Math.PI, 0); cx.lineTo(x + r, y + h / 2 - r); cx.arc(x, y + h / 2 - r, r, 0, Math.PI); cx.closePath(); cx.fill(); });
    cx.shadowBlur = 0; tex.needsUpdate = true;
  };
  draw();
  const screen = new THREE.Mesh(new RoundedBoxGeometry(1.84, 1.38, 0.1, 4, 0.1), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1 }));
  screen.position.set(0, 0.2, 0.62); head.add(screen);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 1.38), new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.08, roughness: 0, clearcoat: 1, color: 0xffffff }));
  glass.position.set(0, 0.2, 0.675); head.add(glass);
  add(new THREE.BoxGeometry(1.1, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x5b6a73, roughness: 0.6 }), [-0.3, -0.78, 0.62], head);
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x01dcef, emissive: 0x01dcef, emissiveIntensity: 1.5 }), [0.82, -0.78, 0.62], head);

  // Cuello y torso
  add(new THREE.CylinderGeometry(0.4, 0.46, 0.42, 28), plasticDk, [0, 2.38, 0]);
  add(new RoundedBoxGeometry(2.5, 1.9, 1.15, 8, 0.35), cloth, [0, 1.25, 0]);
  add(new RoundedBoxGeometry(2.1, 1.4, 1.05, 6, 0.2), cloth, [0, 0.0, 0]);
  const v = new THREE.Mesh(new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-0.52, 0); s.lineTo(0.52, 0); s.lineTo(0, -1.3); s.closePath(); return s; })()), shirt); v.position.set(0, 2.05, 0.585); g.add(v);
  [-1, 1].forEach((sx) => { const l = new THREE.Mesh(new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.62 * sx, 0.05); s.lineTo(0.2 * sx, -1.45); s.lineTo(0, -1.4); s.closePath(); return s; })()), clothDk); l.position.set(0.0, 2.03, 0.595); g.add(l); });
  add(new RoundedBoxGeometry(0.2, 0.9, 0.06, 3, 0.03), tie, [0, 1.35, 0.62]);

  // Brazos
  const arm = (shoulder, pts) => { // pts: lista de puntos; cápsulas entre ellos
    let prev = new THREE.Vector3(...shoulder);
    pts.forEach((p) => { const next = new THREE.Vector3(...p); const d = next.clone().sub(prev); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, d.length(), 8, 16), clothDk); m.position.copy(prev.clone().add(next).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); m.castShadow = true; g.add(m); prev = next; });
    return prev;
  };
  const handAt = (p) => add(new THREE.SphereGeometry(0.3, 24, 18), hand, p);
  let pointer = null, panel = null;
  if (pose === 'point') {
    arm([-1.15, 1.9, 0], [[-1.35, 0.9, 0.1], [-1.4, 0.2, 0.2]]); handAt([-1.4, -0.1, 0.25]);
    const e = arm([1.15, 1.95, 0], [[1.9, 1.6, 0.35], [2.75, 1.85, 0.75]]);
    const h2 = handAt([e.x + 0.12, e.y + 0.05, e.z + 0.05]);
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 6, 12), hand); f.rotation.z = -Math.PI / 2 + 0.2; f.position.set(e.x + 0.62, e.y + 0.18, e.z + 0.08); f.castShadow = true; g.add(f);
    pointer = f;
  } else if (pose === 'hold') {
    arm([-1.15, 1.9, 0], [[-1.5, 0.9, 0.2], [-0.95, 0.35, 0.95]]); handAt([-0.88, 0.32, 1.0]);
    arm([1.15, 1.9, 0], [[1.5, 0.9, 0.2], [0.95, 0.35, 0.95]]); handAt([0.88, 0.32, 1.0]);
    panel = new THREE.Group(); panel.position.set(0, 0.65, 1.12); panel.rotation.x = -0.25; g.add(panel);
    const pg = new THREE.Mesh(new RoundedBoxGeometry(1.7, 1.1, 0.06, 4, 0.06), new THREE.MeshPhysicalMaterial({ color: 0xbfeef2, transparent: true, opacity: 0.45, roughness: 0.05, clearcoat: 1, metalness: 0.1 })); panel.add(pg);
    [[0.4, 0.28, 0xffffff, 1.1], [0.0, -0.02, 0xffffff, 0.8], [-0.15, -0.3, 0x56b28e, 0.5]].forEach(([y, yy, c, w], i) => { const bar = new THREE.Mesh(new RoundedBoxGeometry(w, 0.1, 0.02, 2, 0.02), new THREE.MeshStandardMaterial({ color: c, emissive: i === 0 ? 0x01dcef : 0x000000, emissiveIntensity: 0.6 })); bar.position.set(-0.2 + (1.1 - w) * -0.25, yy, 0.05); panel.add(bar); });
  } else {
    arm([-1.15, 1.9, 0], [[-1.35, 0.9, 0.1], [-1.4, 0.2, 0.2]]); handAt([-1.4, -0.1, 0.25]);
    arm([1.15, 1.9, 0], [[1.35, 0.9, 0.1], [1.4, 0.2, 0.2]]); handAt([1.4, -0.1, 0.25]);
  }

  return {
    group: g, head, pointer, panel,
    setLook(x, y) { look.x = x; look.y = y; draw(); },
  };
}
