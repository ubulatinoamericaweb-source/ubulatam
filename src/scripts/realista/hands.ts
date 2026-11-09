// @ts-nocheck
/* Mano humana y mano robótica en 3D (prueba realista). Modeladas con cápsulas articuladas y materiales PBR.
   Representan el encuentro entre conocimiento técnico y tecnología; no insinúan que UBU fabrique robots. */
import { THREE, glowTexture } from './stage';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const FINGERS = [
  { n: 'index', z: 0.46, y: 0.28, len: [0.62, 0.44, 0.34], r: 0.15, curl: [0.0, -0.04, -0.06] },
  { n: 'middle', z: 0.15, y: 0.3, len: [0.66, 0.48, 0.36], r: 0.152, curl: [-1.25, -1.45, -0.95] },
  { n: 'ring', z: -0.16, y: 0.26, len: [0.6, 0.44, 0.33], r: 0.145, curl: [-1.35, -1.5, -1.0] },
  { n: 'pinky', z: -0.46, y: 0.2, len: [0.48, 0.34, 0.28], r: 0.125, curl: [-1.4, -1.5, -1.0] },
];

function capsule(r, L, mat) {
  const g = new THREE.CapsuleGeometry(r, L, 10, 20); g.rotateZ(-Math.PI / 2); g.translate(L / 2, 0, 0);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}

export function buildHand(kind) {
  const robot = kind === 'robot';
  const skin = robot
    ? new THREE.MeshPhysicalMaterial({ color: 0x2b3640, metalness: 0.92, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 })
    : new THREE.MeshPhysicalMaterial({ color: 0xd49a78, metalness: 0, roughness: 0.6, sheen: 0.5, sheenColor: new THREE.Color(0xffc9a8), sheenRoughness: 0.5, clearcoat: 0.08 });
  const joint = robot ? new THREE.MeshStandardMaterial({ color: 0x0a1a29, metalness: 0.8, roughness: 0.35 }) : skin;
  const glow = new THREE.MeshStandardMaterial({ color: 0x01dcef, emissive: 0x01dcef, emissiveIntensity: 2.4, roughness: 0.3 });
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.35, 1.36, 8, 0.32), skin); palm.position.set(-0.78, 0.0, 0); palm.castShadow = palm.receiveShadow = true; g.add(palm);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 4.6, 36).rotateZ(Math.PI / 2), skin); arm.position.set(-3.6, -0.02, 0); arm.castShadow = true; g.add(arm);
  if (robot) {
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.34, 40).rotateZ(Math.PI / 2), joint); cuff.position.set(-1.7, 0, 0); g.add(cuff);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 12, 48).rotateY(Math.PI / 2), glow); ring.position.set(-1.7, 0, 0); g.add(ring);
    const led = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.12, 0.7, 3, 0.05), glow); led.position.set(-0.8, 0.69, 0); g.add(led);
    const plate = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.06, 1.0, 3, 0.03), joint); plate.position.set(-0.8, 0.68, 0); g.add(plate);
  } else {
    [0.2, -0.2].forEach((z) => { const v = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.7, 4, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc99679, roughness: 0.7 })); v.position.set(-1.0, 0.68, z); g.add(v); });
  }
  const tips = [];
  const finger = (cfg, base) => {
    const root = new THREE.Group(); root.position.set(...base); g.add(root);
    let parent = root; const { len, r, curl } = cfg;
    len.forEach((L, i) => {
      const seg = new THREE.Group(); seg.rotation.z = curl[i]; parent.add(seg);
      const rr = r * (1 - i * 0.1);
      seg.add(capsule(rr, L, skin));
      if (robot) { const band = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.06, 0.018, 8, 24).rotateY(Math.PI / 2), glow); band.position.x = 0.02; seg.add(band); }
      const nxt = new THREE.Group(); nxt.position.x = L; seg.add(nxt);
      if (i < len.length - 1) { const j = new THREE.Mesh(new THREE.SphereGeometry(rr * 1.02, 20, 16), joint); j.position.x = L; j.castShadow = true; seg.add(j); }
      parent = nxt;
    });
    return parent;
  };
  FINGERS.forEach((f) => { const tip = finger(f, [0.0, f.y - 0.02, f.z]); if (f.n === 'index') tips.push(tip); });
  // pulgar
  const th = new THREE.Group(); th.position.set(-0.55, 0.12, 0.62); th.rotation.set(0.0, -0.45, 0.85); g.add(th);
  let tp = th; [[0.5, 0.17], [0.42, 0.15]].forEach(([L, r], i) => { const seg = new THREE.Group(); seg.rotation.z = i ? 0.35 : 0; tp.add(seg); seg.add(capsule(r, L, skin)); const nx = new THREE.Group(); nx.position.x = L; seg.add(nx); if (!i) { const j = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), joint); j.position.x = L; seg.add(j); } tp = nx; });
  const tip = new THREE.Object3D(); (tips[0] || g).add(tip); tip.position.set(0.16, 0, 0);
  return { group: g, tip };
}

export function buildHandsScene(stage) {
  const { scene } = stage;
  const human = buildHand('human'), robot = buildHand('robot');
  const H = human.group, R = robot.group;
  R.scale.x = -1;                    // espejo: apunta hacia -x con el pulgar visible
  scene.add(H, R);
  // luz de contacto y brillo
  const point = new THREE.PointLight(0x01dcef, 0, 9, 1.6); point.position.set(0, 0.28, 0.6); scene.add(point);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('1,220,239'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  sprite.position.set(0, 0.28, 0.6); sprite.scale.setScalar(0.1); scene.add(sprite);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: 0x01dcef, transparent: true, opacity: 0 }));
  ring.position.set(0, 0.28, 0.2); scene.add(ring);
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.74, 96), new THREE.MeshBasicMaterial({ color: 0x4293d0, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  halo.position.set(0, 0.28, -1.4); scene.add(halo);
  const haloGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('66,147,208'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }));
  haloGlow.scale.setScalar(6.5); haloGlow.position.set(0, 0.28, -1.5); scene.add(haloGlow);
  return { human: H, robot: R, point, sprite, ring, halo, haloGlow };
}
