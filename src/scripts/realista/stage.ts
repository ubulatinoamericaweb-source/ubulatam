// @ts-nocheck
/* Utilidades comunes de las escenas 3D de la versión realista (prueba).
   Render con materiales PBR, entorno de iluminación, tonemapping y sombras suaves.
   Solo se carga en /realista; el sitio principal no depende de three.js. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export { THREE };
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const lite = new URLSearchParams(location.search).has('lite'); // modo liviano para equipos sin GPU
export const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 760 || lite;

export function createStage(canvas, { fov = 30, shadows = true, exposure = 1.05 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(lite ? 0.7 : Math.min(devicePixelRatio || 1, coarse ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = shadows && !coarse;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 120);

  const frameFns = new Set();
  let visible = false, raf = 0, last = 0, dirty = true, disposed = false;
  const resize = () => {
    const host = canvas.parentElement; const r = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(1, r.width) / Math.max(1, r.height); camera.updateProjectionMatrix(); dirty = true;
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement); resize();

  const tick = (t) => {
    raf = 0; if (disposed) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    let animating = false;
    frameFns.forEach((fn) => { if (fn(t / 1000, dt)) animating = true; });
    renderer.render(scene, camera); dirty = false;
    // con movimiento reducido solo se renderiza bajo demanda
    if (!raf && visible && (animating || (!reduced && continuous))) raf = requestAnimationFrame(tick);
  };
  let continuous = true;
  const kick = () => { if (!raf && !disposed && (visible || dirty)) raf = requestAnimationFrame(tick); };
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) { last = performance.now(); kick(); } }, { rootMargin: '120px' });
  io.observe(canvas);

  return {
    THREE, renderer, scene, camera,
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    invalidate() { dirty = true; kick(); },
    setContinuous(v) { continuous = v; kick(); },
    dispose() { disposed = true; ro.disconnect(); io.disconnect(); renderer.dispose(); },
  };
}

/** Luces de estudio: principal con sombra suave, contraluz cian de marca y relleno índigo. */
export function studioLights(scene, { size = 12, key = 2.4, shadows = true } = {}) {
  const k = new THREE.DirectionalLight(0xffffff, key);
  k.position.set(6, 10, 8); k.castShadow = shadows && !coarse;
  k.shadow.mapSize.set(2048, 2048); const c = k.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 1; c.far = 40;
  k.shadow.bias = -0.0004; k.shadow.normalBias = 0.03; k.shadow.radius = 5;
  const rim = new THREE.DirectionalLight(0x01dcef, 2.0); rim.position.set(-9, 5, -7);
  const fill = new THREE.DirectionalLight(0x405ba5, 1.1); fill.position.set(-6, 2, 8);
  const hemi = new THREE.HemisphereLight(0xcfeeff, 0x0a1a29, 0.45);
  scene.add(k, rim, fill, hemi);
  return { k, rim, fill, hemi };
}

/** Suelo que solo recibe sombra (se funde con el fondo CSS) + mancha de contacto. */
export function groundShadow(scene, { w = 40, d = 20, y = 0, opacity = 0.4 } = {}) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.ShadowMaterial({ opacity }));
  g.rotation.x = -Math.PI / 2; g.position.y = y; g.receiveShadow = true; scene.add(g);
  return g;
}

export function blobTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function glowTexture(color = '1,220,239', size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${color},.95)`); gr.addColorStop(0.35, `rgba(${color},.35)`); gr.addColorStop(1, `rgba(${color},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Textura sutil de tejido para el saco (bump). */
export function weaveTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 4) { x.fillStyle = i % 8 ? '#9a9a9a' : '#6a6a6a'; x.fillRect(i, 0, 2, size); x.fillRect(0, i, size, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t;
}
