// @ts-nocheck
/* Camión 3D (prueba realista). Modelado procedural con materiales PBR.
   El logo del furgón se dibuja con los trazos vectoriales OFICIALES del manual (brand-paths.json): no se redibuja ni se deforma. */
import { THREE, blobTexture } from './stage';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import paths from '../../data/brand-paths.json';

function logoTexture() {
  const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const { bbox, gray, eyes, tag, regFill, regStroke } = paths.logo; const [x0, y0, x1, y1] = bbox;
  const s = (W * 0.82) / (x1 - x0); x.translate((W - (x1 - x0) * s) / 2, (H - (y1 - y0) * s) / 2); x.scale(s, s); x.translate(-x0, -y0);
  x.fillStyle = '#ffffff'; [...gray, ...eyes, ...tag, ...regFill].forEach((p) => x.fill(new Path2D(p.d)));
  x.strokeStyle = '#ffffff'; x.lineWidth = 0.9; regStroke.forEach((p) => x.stroke(new Path2D(p.d)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function buildTruck(renderer) {
  const root = new THREE.Group(); const truck = new THREE.Group(); root.add(truck);
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: 0x41b9c1, metalness: 0.28, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.1 }),
    cab: new THREE.MeshPhysicalMaterial({ color: 0x2e3a44, metalness: 0.45, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x161f26, metalness: 0.5, roughness: 0.55 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe7ea, metalness: 1, roughness: 0.18 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fe1e7, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.6, envMapIntensity: 1.8, side: THREE.DoubleSide }),
    tire: new THREE.MeshStandardMaterial({ color: 0x121619, roughness: 0.92, metalness: 0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xc9d3d8, metalness: 0.95, roughness: 0.28 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff4c2, emissive: 0xfff4c2, emissiveIntensity: 2.2 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x01dcef, emissive: 0x01dcef, emissiveIntensity: 1.2, roughness: 0.4 }),
  };
  const mk = (geo, mat, pos, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; (parent || truck).add(m); return m; };
  const parts = {};

  // Chasis
  parts.chassis = new THREE.Group(); truck.add(parts.chassis);
  mk(new RoundedBoxGeometry(10.2, 0.28, 1.9, 3, 0.06), M.dark, [2.9, 0.78, 0], parts.chassis);
  mk(new THREE.BoxGeometry(1.0, 0.5, 1.4), M.dark, [5.0, 0.55, 0], parts.chassis);   // depósito/estructura
  mk(new THREE.BoxGeometry(0.9, 0.4, 0.3), M.dark, [1.6, 0.55, 0.95], parts.chassis);

  // Furgón (trailer)
  parts.trailer = new THREE.Group(); truck.add(parts.trailer);
  mk(new RoundedBoxGeometry(7.6, 2.75, 2.5, 6, 0.14), M.paint, [3.9, 2.25, 0], parts.trailer);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.8), new THREE.MeshStandardMaterial({ map: logoTexture(), transparent: true, roughness: 0.4, metalness: 0, depthWrite: false }));
  logo.position.set(3.9, 2.3, 1.262); parts.trailer.add(logo);
  [0.95, -0.95].forEach((y) => mk(new THREE.BoxGeometry(7.2, 0.04, 0.02), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, transparent: true, opacity: 0.55 }), [3.9, 2.25 + y, 1.262], parts.trailer));
  mk(new THREE.BoxGeometry(7.4, 0.12, 2.3), M.chrome, [3.9, 0.93, 0], parts.trailer);   // faldón inferior
  mk(new THREE.BoxGeometry(0.08, 2.3, 2.1), M.dark, [7.72, 2.25, 0], parts.trailer);    // puerta trasera
  [0.5, -0.5].forEach((z) => mk(new THREE.BoxGeometry(0.1, 0.18, 0.16), M.accent, [7.77, 1.2, z], parts.trailer));

  // Cabina
  parts.cab = new THREE.Group(); truck.add(parts.cab);
  const sh = new THREE.Shape(); sh.moveTo(-2.3, 0.95); sh.lineTo(-2.3, 2.15); sh.quadraticCurveTo(-2.25, 2.35, -2.05, 2.55); sh.lineTo(-1.6, 3.35); sh.quadraticCurveTo(-1.5, 3.5, -1.3, 3.5); sh.lineTo(-0.15, 3.5); sh.lineTo(-0.15, 0.95); sh.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(sh, { depth: 2.3, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 5, curveSegments: 12 });
  cabGeo.translate(0, 0, -1.15);
  mk(cabGeo, M.cab, [0, 0, 0], parts.cab);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.9), M.glass);
  ws.rotation.order = 'ZYX'; ws.rotation.y = -Math.PI / 2; ws.rotation.z = -0.51; ws.position.set(-1.86, 2.96, 0); parts.cab.add(ws);
  const sw = new THREE.Mesh(new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-2.0, 2.2); s.lineTo(-1.62, 3.2); s.lineTo(-0.5, 3.2); s.lineTo(-0.5, 2.2); s.closePath(); return s; })()), M.glass);
  [1.28, -1.28].forEach((z) => { const g = sw.clone(); g.position.z = z; parts.cab.add(g); });
  mk(new THREE.BoxGeometry(0.28, 0.62, 2.5), M.chrome, [-2.42, 0.98, 0], parts.cab);                          // parachoques
  mk(new THREE.BoxGeometry(0.12, 0.8, 1.5), M.dark, [-2.42, 1.75, 0], parts.cab);                              // parrilla
  for (let i = 0; i < 5; i++) mk(new THREE.BoxGeometry(0.14, 0.04, 1.46), M.chrome, [-2.45, 1.45 + i * 0.16, 0], parts.cab);
  [0.78, -0.78].forEach((z) => { mk(new THREE.SphereGeometry(0.17, 24, 16), M.lamp, [-2.42, 1.2, z], parts.cab); mk(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 24).rotateZ(Math.PI / 2), M.chrome, [-2.36, 1.2, z], parts.cab); });
  [1.38, -1.38].forEach((z) => { mk(new THREE.BoxGeometry(0.16, 0.7, 0.1), M.dark, [-1.75, 2.6, z], parts.cab); });
  mk(new THREE.BoxGeometry(2.15, 0.1, 2.42), M.accent, [-1.2, 1.55, 0], parts.cab);                            // franja cian
  mk(new THREE.BoxGeometry(0.3, 0.2, 2.3), M.cab, [-0.05, 1.1, 0], parts.cab);

  // Ruedas
  parts.wheels = new THREE.Group(); truck.add(parts.wheels);
  const wheels = [];
  [-1.4, 5.0, 6.3].forEach((x) => [1.18, -1.18].forEach((z) => {
    const w = new THREE.Group(); w.position.set(x, 0.58, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.46, 40).rotateX(Math.PI / 2), M.tire); tire.castShadow = true; w.add(tire);
    const side = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 12, 40), M.tire); side.position.z = z > 0 ? 0.22 : -0.22; w.add(side);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.48, 32).rotateX(Math.PI / 2), M.rim); w.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.54, 20).rotateX(Math.PI / 2), M.accent); w.add(hub);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.52, 8).rotateX(Math.PI / 2), M.chrome); b.position.set(Math.cos(a) * 0.23, Math.sin(a) * 0.23, 0); w.add(b); }
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), M.rim); sp.position.set(Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0); sp.rotation.z = a; w.add(sp); }
    parts.wheels.add(w); wheels.push(w);
  }));

  // Sombra de contacto
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.4), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.85 }));
  blob.rotation.x = -Math.PI / 2; blob.position.set(2.7, 0.01, 0); root.add(blob);

  truck.position.x = -2.8;           // centra el conjunto en el origen
  blob.position.x = 2.7 - 2.8;

  // Vista explosionada controlada por scroll (0 = ensamblado, 1 = abierto)
  const base = new Map(); const off = { trailer: [0.6, 1.9, 0.9], cab: [-2.6, 0.5, 0.4], chassis: [0.3, -0.8, 0], wheels: [0, -0.2, 1.6] };
  Object.keys(off).forEach((k) => base.set(k, parts[k].position.clone()));
  function explode(t) {
    Object.entries(off).forEach(([k, o]) => { parts[k].position.set(base.get(k).x + o[0] * t, base.get(k).y + o[1] * t, base.get(k).z + o[2] * t); });
    parts.wheels.children.forEach((w, i) => { w.position.y = 0.58 - 0.5 * t * (i % 2 ? 1 : 0.6); });
    blob.material.opacity = 0.85 * (1 - t * 0.45);
  }
  const spin = (dist) => wheels.forEach((w) => { w.rotation.z = dist / 0.58; });
  return { root, truck, parts, wheels, explode, spin };
}
