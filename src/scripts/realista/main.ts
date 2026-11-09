// @ts-nocheck
/* Página /realista: alternativa 3D del camión, las manos y el personaje.
   No reemplaza nada del sitio: es una ruta aparte para comparar con la versión animada actual. */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { THREE, createStage, studioLights, groundShadow, reduced, coarse } from './stage';
import { buildTruck } from './truck';
import { buildHandsScene } from './hands';
import { buildCharacter } from './character';

gsap.registerPlugin(ScrollTrigger);
const $ = (s, r = document) => r.querySelector(s);
const wide = () => innerWidth >= 900;
const mm = gsap.matchMedia();
const solo = new URLSearchParams(location.search).get('solo'); // ?solo=truck|hands|char: carga una sola escena (útil para equipos lentos)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const fail = (e) => { console.warn('Escena 3D no disponible:', e && e.message); document.documentElement.classList.add('rt-nogl'); };
/* ============ 1 · CAMIÓN ============ */
try { (() => {
  const canvas = $('#rt-truck'); if (!canvas || (solo && solo !== 'truck')) return;
  const stage = createStage(canvas, { fov: 26, exposure: 1.1 });
  const { scene, camera } = stage;
  scene.environmentIntensity = 0.8; studioLights(scene, { size: 14 }); groundShadow(scene, { w: 80, d: 40, opacity: 0.5 });
  const T = buildTruck(); scene.add(T.root);
  const state = { x: 0, p: 0, entered: false };
  const baseX = () => (wide() ? 3.9 : 0);
  const R = () => 21 + Math.max(0, 1.9 - camera.aspect) * 5, a0 = Math.atan2(7.4, 15.2);
  const placeCam = (p) => {
    const a = a0 + p * 0.85, r = R() + p * 2.2;
    camera.position.set(baseX() + Math.sin(a) * r, 4.2 + p * 3.4, Math.cos(a) * r);
    camera.lookAt(baseX(), 1.5 + p * 0.6, 0);
  };
  const apply = () => { T.root.position.x = baseX() + state.x; T.explode(smooth(0.1, 0.62, state.p)); placeCam(state.p); stage.invalidate(); };
  apply();
  stage.onFrame(() => { apply(); return state.x !== 0 || state.p > 0; });
  stage.setContinuous(!reduced);

  if (reduced) { state.x = 0; apply(); return; }
  const dur = coarse ? 1.6 : 2.8;
  const from = coarse ? 14 : 24;
  gsap.fromTo(state, { x: from }, { x: 0, duration: dur, ease: 'power3.out', delay: 0.15, onUpdate: () => T.spin(from - state.x), onComplete: () => T.spin(from) });

  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    const hero = $('[data-rt-hero]'), c1 = $('[data-rt-copy="1"]'), c2 = $('[data-rt-copy="2"]'), bar = $('[data-rt-bar]');
    const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: hero, start: 'top top', end: '+=130%', pin: $('[data-rt-pin]'), scrub: 0.7, anticipatePin: 1, onUpdate: (st) => { gsap.set(bar, { scaleX: st.progress }); } } });
    tl.to(state, { p: 1, duration: 6 }, 0)
      .to(c1, { autoAlpha: 0, y: -40, duration: 1.2, ease: 'power1.in' }, 0.3)
      .fromTo(c2, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 1.4, ease: 'power2.out' }, 3.6);
    return () => { state.p = 0; gsap.set([c1, c2], { clearProps: 'all' }); };
  });
})(); } catch (e) { fail(e); }

/* ============ 2 · MANOS ============ */
try { (() => {
  const canvas = $('#rt-hands'); if (!canvas || (solo && solo !== 'hands')) return;
  const stage = createStage(canvas, { fov: 26, exposure: 0.95 });
  const { scene, camera } = stage;
  scene.environmentIntensity = 0.7; studioLights(scene, { size: 8, key: 2.0 });
  const H = buildHandsScene(stage);
  camera.position.set(0.4, 1.3, 12.6); camera.lookAt(0, 0.15, 0);
  const FINAL = 1.66;
  const s = { k: 0, spark: 0, ring: 0, mx: 0, my: 0 };
  const apply = () => {
    const off = (1 - s.k) * 5.4, t = performance.now() / 1000;
    const bob = reduced ? 0 : Math.sin(t * 1.1) * 0.05;
    H.human.position.set(-FINAL - off, bob, 0); H.robot.position.set(FINAL + off, -bob * 0.8, 0);
    H.human.rotation.z = -0.05 * (1 - s.k) + bob * 0.2; H.robot.rotation.z = 0.05 * (1 - s.k) - bob * 0.2;
    scene.rotation.y = s.mx * 0.14; scene.rotation.x = s.my * 0.05;
    H.point.intensity = s.spark * 38; H.sprite.material.opacity = s.spark; H.sprite.scale.setScalar(0.4 + s.spark * 1.9);
    H.ring.scale.setScalar(0.2 + s.ring * 2.6); H.ring.material.opacity = (1 - s.ring) * (s.ring > 0 ? 0.9 : 0);
    H.halo.rotation.z += 0.002; H.halo.material.opacity = 0.2 + 0.4 * s.k; H.haloGlow.material.opacity = 0.15 + 0.45 * s.k;
    stage.invalidate();
  };
  apply(); stage.onFrame(() => { apply(); return true; }); stage.setContinuous(!reduced);
  if (reduced) { s.k = 1; s.spark = 0.35; apply(); return; }
  s.k = 0; apply();
  const tl = gsap.timeline({ paused: true });
  tl.to(s, { k: 1, duration: coarse ? 1.5 : 2.4, ease: 'power3.out' }, 0)
    .to(s, { spark: 1, duration: 0.25, ease: 'power2.out' }, coarse ? 1.2 : 2.0)
    .to(s, { ring: 1, duration: 1.2, ease: 'power2.out' }, coarse ? 1.2 : 2.0)
    .to(s, { spark: 0.3, duration: 1.1, ease: 'power2.inOut' }, coarse ? 1.5 : 2.3);
  ScrollTrigger.create({ trigger: canvas, start: 'top 75%', once: true, onEnter: () => tl.play() });
  if (!coarse) canvas.parentElement.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); s.mx = ((e.clientX - r.left) / r.width - 0.5) * 2; s.my = ((e.clientY - r.top) / r.height - 0.5) * 2; }, { passive: true });
})(); } catch (e) { fail(e); }

/* ============ 3 · PERSONAJE ============ */
function characterScene(sel, pose, opts = {}) {
  const canvas = $(sel); if (!canvas || (solo && solo !== 'char')) return;
  const stage = createStage(canvas, { fov: 26, exposure: 1.1 });
  const { scene, camera } = stage;
  studioLights(scene, { size: 7, key: 2.3 });
  groundShadow(scene, { w: 30, d: 20, y: -0.75, opacity: 0.45 });
  const C = buildCharacter(pose); scene.add(C.group);
  C.group.position.set(opts.x ?? 0, -0.7, 0);
  camera.position.set(opts.cx ?? 2.4, 3.0, 15.5); camera.lookAt(opts.lx ?? 0.5, 1.9, 0);
  let tx = 0, ty = 0, lx = 0, ly = 0, shown = 0;
  const target = { yaw: 0 };
  if (!coarse && !reduced) addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const r = canvas.getBoundingClientRect(); tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth * 0.45))); ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.3)) / (innerHeight * 0.45))); }, { passive: true });
  stage.onFrame((t) => {
    lx += (tx - lx) * 0.12; ly += (ty - ly) * 0.12;
    if (Math.abs(lx - shown) > 0.015 || Math.abs(ly - target.yaw) > 0.015) { C.setLook(lx, ly); shown = lx; target.yaw = ly; }
    C.head.rotation.y = lx * 0.28; C.head.rotation.x = ly * 0.1;
    if (!reduced) { C.group.position.y = -0.7 + Math.sin(t * 1.3) * 0.03; if (C.pointer) C.pointer.rotation.z = -Math.PI / 2 + 0.2 + Math.sin(t * 2.2) * 0.06; }
    return true;
  });
  stage.setContinuous(!reduced); stage.invalidate();
  if (!reduced) ScrollTrigger.create({ trigger: canvas, start: 'top 85%', once: true, onEnter: () => gsap.from(C.group.rotation, { y: -0.9, duration: coarse ? 0.9 : 1.6, ease: 'power3.out' }) });
}
try { characterScene('#rt-char-a', 'point', { x: -0.4 }); characterScene('#rt-char-b', 'hold', { x: 0, cx: 0, lx: 0 }); } catch (e) { fail(e); }

addEventListener('load', () => ScrollTrigger.refresh());
