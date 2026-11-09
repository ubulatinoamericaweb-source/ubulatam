/* Escenas de la portada (GSAP). Cada movimiento tiene una función:
   1) camión → piezas → partículas → carita de marca (introduce UBU)
   2) recorrido lateral de productos con profundidad
   3) cristal: el destello revela la ficha
   4) manos que se acercan
   Móvil (<900px) y movimiento reducido: sin pin ni transformación; composición estática equivalente. */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));
const FULL = '(min-width: 900px) and (prefers-reduced-motion: no-preference)';
const ANY_MOTION = '(prefers-reduced-motion: no-preference)';
const mm = gsap.matchMedia();

/* ============ 1 · CAMIÓN ============ */
mm.add(FULL, () => {
  const hero = $('[data-hero]')!;
  const pin = $('[data-hero-pin]')!;
  const wrap = $('[data-truck-wrap]')!;
  const face = $('[data-hero-face]')!;
  const box = $('[data-particles]')!;
  const copy1 = $('[data-copy="1"]')!;
  const copy2 = $('[data-copy="2"]')!;
  const parts = $$<SVGGElement>('.part', wrap);
  const wheels = $$('.wheel', wrap);
  const beam = $('.truck__beam', wrap);
  const bar = $('[data-progress]')!;

  // Partículas decorativas (se crean aquí para no cargar el HTML)
  const N = 132;
  const dots = Array.from({ length: N }, () => { const i = document.createElement('i'); box.appendChild(i); return i; });

  // --- Entrada cinematográfica (al cargar) ---
  const intro = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: () => hero.classList.add('is-parked') });
  intro
    .fromTo(wrap, { x: () => innerWidth * 0.8 }, { x: 0, duration: 2.6, ease: 'power3.out' }, 0)
    .fromTo(wheels, { rotation: -900 }, { rotation: 0, duration: 2.6, ease: 'power3.out' }, 0)
    .fromTo(beam, { opacity: 0 }, { opacity: 0.9, duration: 0.8 }, 0.2)
    .to(beam, { opacity: 0.35, duration: 1.2 }, 2)
    .fromTo(copy1.children, { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.14 }, 0.5)
    .fromTo('.hero__cta > *', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.1 }, 1.2);

  // --- Destinos: puntos tomados del CONTORNO REAL del isotipo, para que las partículas dibujen la carita ---
  const faceSvg = face.querySelector('svg') as SVGSVGElement;
  const bodyPaths = $$<SVGPathElement>('.ubu-face__body path', face as unknown as ParentNode);
  const eyePaths = $$<SVGPathElement>('.ubu-face__eye', face as unknown as ParentNode);
  const targets = () => {
    const vb = faceSvg.viewBox.baseVal;
    const k = face.offsetWidth / vb.width;
    const left = face.offsetLeft, top = face.offsetTop - face.offsetHeight / 2; // la carita termina centrada (yPercent -50)
    const at = (path: SVGPathElement, len: number) => { const pt = path.getPointAtLength(len); return { x: left + (pt.x - vb.x) * k, y: top + (pt.y - vb.y) * k }; };
    const eyeEach = 8, eyeTotal = eyePaths.length * eyeEach;
    const lens = bodyPaths.map((q) => q.getTotalLength()), sum = lens.reduce((a, b) => a + b, 0);
    const out: { x: number; y: number; eye: boolean }[] = [];
    bodyPaths.forEach((q, qi) => {
      const n = Math.max(2, Math.round((lens[qi] / sum) * (N - eyeTotal)));
      for (let j = 0; j < n; j++) out.push({ ...at(q, ((j + 0.5) / n) * lens[qi]), eye: false });
    });
    eyePaths.forEach((q) => { const L = q.getTotalLength(); for (let j = 0; j < eyeEach; j++) out.push({ ...at(q, ((j + 0.5) / eyeEach) * L), eye: true }); });
    while (out.length < N) out.push(out[out.length % Math.max(1, out.length)]);
    return out.slice(0, N);
  };
  const start = (i: number) => ({
    x: wrap.offsetLeft + wrap.offsetWidth * (0.14 + 0.72 * ((i * 37) % 100) / 100),
    y: wrap.offsetTop + wrap.offsetHeight * (0.24 + 0.5 * ((i * 53) % 100) / 100),
  });
  let T = targets();
  const tag = () => dots.forEach((d, i) => d.classList.toggle('is-eye', !!T[i]?.eye));
  tag();

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: hero, start: 'top top', end: '+=125%', pin: pin, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true,
      onRefresh: () => { T = targets(); tag(); },
      onUpdate: (st) => { gsap.set(bar, { scaleX: st.progress }); } },
  });
  gsap.set(dots, { x: (i) => start(i).x, y: (i) => start(i).y, opacity: 0, scale: 1 });

  tl.addLabel('a', 0)
    // 1) el texto cede y el camión se abre en piezas (plano técnico)
    .to(copy1, { opacity: 0, y: -50, duration: 0.9, ease: 'power1.in' }, 'a+=0.1')
    .to('.hero__road, .hero__speed', { opacity: 0, duration: 0.8 }, 'a')
    .to(beam, { opacity: 0, duration: 0.6 }, 'a')
    .to('.truck__shadow', { opacity: 0, duration: 0.9 }, 'a+=0.2')
    .to(parts, { x: (_, t) => Number(t.dataset.dx), y: (_, t) => Number(t.dataset.dy), rotation: (_, t) => Number(t.dataset.rz), duration: 1.5, ease: 'power2.out' }, 'a')
    .to('.truck .solid', { opacity: 0.1, duration: 1.0 }, 'a+=0.3')
    .to('.truck .wire', { opacity: 1, duration: 0.9, stagger: 0.08 }, 'a+=0.3')
    // 2) las piezas se disuelven en partículas que viajan al contorno de la carita
    .addLabel('b', 1.5)
    .to(parts, { scale: 0.6, opacity: 0, duration: 1.1, stagger: 0.06, ease: 'power2.in' }, 'b')
    .to(dots, { opacity: 1, duration: 0.3, stagger: { each: 0.004, from: 'random' } }, 'b-=0.2')
    .to(dots, { x: (i) => T[i].x, y: (i) => T[i].y, duration: 1.5, ease: 'power2.inOut', stagger: { each: 0.006, from: 'random' } }, 'b')
    // 3) la carita se forma bajo las partículas y estas se apagan sin caer
    .addLabel('c', 3.1)
    .fromTo(face, { opacity: 0, scale: 0.85, yPercent: -50 }, { opacity: 1, scale: 1, yPercent: -50, duration: 0.9, ease: 'power2.out' }, 'c')
    .to(dots, { opacity: 0, scale: 0.4, duration: 0.5, ease: 'power1.in' }, 'c+=0.15')
    // 4) mensaje de marca
    .fromTo(copy2, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: 1.0, ease: 'power2.out' }, 'c+=0.2')
    .to('.hero__cta', { autoAlpha: 0, duration: 0.5, ease: 'power1.in' }, 'c') // los botones pasan a la columna del mensaje final (.cta2)
    .to({}, { duration: 0.8 }); // pausa de lectura

  gsap.set(face, { yPercent: -50, y: 0, scale: 0.85 });

  return () => { dots.forEach((d) => d.parentNode?.removeChild(d)); hero.classList.remove('is-parked'); gsap.set([wrap, face, copy1, copy2, '.hero__cta', '.hero__cta > *'], { clearProps: 'all' }); };
});

/* En móvil con movimiento permitido: una entrada breve del camión, sin pin */
mm.add('(max-width: 899px) and ' + ANY_MOTION, () => {
  const wrap = $('[data-truck-wrap]')!;
  gsap.fromTo(wrap, { x: '60vw', opacity: 0 }, { x: 0, opacity: 1, duration: 1.6, ease: 'power3.out' });
  gsap.fromTo($('.truck__beam', wrap), { opacity: 0 }, { opacity: 0.7, duration: 1 });
  return () => gsap.set(wrap, { clearProps: 'all' });
});

/* Móvil: el camión se desintegra en partículas que dibujan la carita en su mismo lugar, ligado al desplazamiento normal
   (sin pin: ~1/3 de pantalla de scroll y la página sigue). Reutiliza el camión, las partículas y la carita del escritorio. */
mm.add('(max-width: 899px) and ' + ANY_MOTION, () => {
  const pin = $('[data-hero-pin]')!, hero = $('[data-hero]')!;
  const wrap = $('[data-truck-wrap]')!, face = $('[data-hero-face]')!, box = $('[data-particles]')!;
  const parts = $$<SVGGElement>('.part', wrap), beam = $('.truck__beam', wrap);
  const N = 120;
  const dots = Array.from({ length: N }, () => { const i = document.createElement('i'); box.appendChild(i); return i; });
  const faceSvg = face.querySelector('svg') as SVGSVGElement;
  const bodyPaths = $$<SVGPathElement>('.ubu-face__body path', face as unknown as ParentNode);
  const eyePaths = $$<SVGPathElement>('.ubu-face__eye', face as unknown as ParentNode);
  let T: { x: number; y: number; eye: boolean }[] = [];
  const place = () => { // la carita queda centrada donde está el camión
    face.style.left = wrap.offsetLeft + wrap.offsetWidth / 2 - face.offsetWidth / 2 + 'px';
    face.style.top = wrap.offsetTop + wrap.offsetHeight / 2 + 'px';
  };
  const targets = () => {
    place();
    const vb = faceSvg.viewBox.baseVal, k = face.offsetWidth / vb.width;
    const left = face.offsetLeft, top = face.offsetTop - face.offsetHeight / 2;
    const at = (path: SVGPathElement, len: number) => { const pt = path.getPointAtLength(len); return { x: left + (pt.x - vb.x) * k, y: top + (pt.y - vb.y) * k }; };
    const eyeEach = 7, eyeTotal = eyePaths.length * eyeEach;
    const lens = bodyPaths.map((q) => q.getTotalLength()), sum = lens.reduce((a, b) => a + b, 0);
    const out: { x: number; y: number; eye: boolean }[] = [];
    bodyPaths.forEach((q, qi) => { const n = Math.max(2, Math.round((lens[qi] / sum) * (N - eyeTotal))); for (let j = 0; j < n; j++) out.push({ ...at(q, ((j + 0.5) / n) * lens[qi]), eye: false }); });
    eyePaths.forEach((q) => { const L = q.getTotalLength(); for (let j = 0; j < eyeEach; j++) out.push({ ...at(q, ((j + 0.5) / eyeEach) * L), eye: true }); });
    while (out.length < N) out.push(out[out.length % Math.max(1, out.length)]);
    return out.slice(0, N);
  };
  const start = (i: number) => ({
    x: wrap.offsetLeft + wrap.offsetWidth * (0.14 + 0.72 * ((i * 37) % 100) / 100),
    y: wrap.offsetTop + wrap.offsetHeight * (0.24 + 0.5 * ((i * 53) % 100) / 100),
  });
  const tag = () => dots.forEach((d, i) => d.classList.toggle('is-eye', !!T[i]?.eye));
  T = targets(); tag();
  gsap.set(face, { yPercent: -50, y: 0, scale: 0.85, opacity: 0 });
  gsap.set(dots, { x: (i) => start(i).x, y: (i) => start(i).y, opacity: 0, scale: 1 });
  const f = () => wrap.offsetWidth / 950; // los desplazamientos de las piezas están pensados para ~950px de ancho

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: hero, start: 'top top', end: () => '+=' + Math.round(Math.min(innerHeight * 0.27, 230)), scrub: 0.4, invalidateOnRefresh: true,
      onRefresh: () => { T = targets(); tag(); } },
  });
  tl.to('.hero__road, .hero__speed, .truck__shadow', { opacity: 0, duration: 0.3 }, 0)
    .to(beam, { opacity: 0, duration: 0.2 }, 0)
    .to(parts, { x: (_, t) => Number(t.dataset.dx) * f(), y: (_, t) => Number(t.dataset.dy) * f(), rotation: (_, t) => Number(t.dataset.rz), duration: 0.4, ease: 'power2.out' }, 0)
    .to('.truck .solid', { opacity: 0.1, duration: 0.3 }, 0.05)
    .to('.truck .wire', { opacity: 1, duration: 0.3 }, 0.05)
    .to(parts, { scale: 0.6, opacity: 0, duration: 0.35, stagger: 0.03, ease: 'power2.in' }, 0.3)
    .to(dots, { opacity: 1, duration: 0.15, stagger: { each: 0.002, from: 'random' } }, 0.3)
    .to(dots, { x: (i) => T[i].x, y: (i) => T[i].y, duration: 0.6, ease: 'power2.inOut', stagger: { each: 0.003, from: 'random' } }, 0.45)
    .fromTo(face, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' }, 1.15)
    .to(dots, { opacity: 0, scale: 0.4, duration: 0.25, ease: 'power1.in' }, 1.25);
  const ro = new ResizeObserver(() => ScrollTrigger.refresh());
  ro.observe(pin);
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  return () => { ro.disconnect(); dots.forEach((d) => d.remove()); gsap.set([face, ...parts, '.hero__road, .hero__speed, .truck__shadow', beam, '.truck .solid', '.truck .wire'], { clearProps: 'all' }); face.removeAttribute('style'); };
});

/* Móvil: la sección se fija solo durante el recorrido; el scroll vertical desplaza los productos de derecha a izquierda
   (misma mecánica que en escritorio, sin 3D para mantener fotos y textos legibles). Al terminar se libera el scroll. */
mm.add('(max-width: 899px) and ' + ANY_MOTION, () => {
  const strip = $('[data-strip]')!, viewport = $('[data-viewport]')!, track = $('[data-track]')!;
  const items = $$('[data-sitem]', track), bar = $('[data-strip-progress]')!;
  const dist = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
  const len = () => Math.min(dist() * 0.8, innerHeight * 2.2);
  const focus = () => { // el producto más cercano al centro se ve a tamaño completo; los demás, ligeramente menores
    const vc = innerWidth / 2;
    items.forEach((it) => {
      const r = it.getBoundingClientRect();
      const a = Math.min(1, Math.abs(r.left + r.width / 2 - vc) / innerWidth);
      gsap.set(it, { scale: 1 - 0.08 * a, opacity: 1 - 0.18 * a });
    });
  };
  focus();
  const tw = gsap.to(track, { x: () => -dist(), ease: 'none',
    scrollTrigger: { trigger: strip, start: 'top top', end: () => '+=' + len(), pin: true, scrub: 0.5, invalidateOnRefresh: true, anticipatePin: 1,
      onUpdate: (st) => { focus(); gsap.set(bar, { scaleX: 0.15 + st.progress * 0.85 }); }, onRefresh: focus } });
  return () => { tw.scrollTrigger?.kill(); tw.kill(); gsap.set([track, ...items, bar], { clearProps: 'all' }); };
});

/* ============ 2 · RECORRIDO LATERAL ============ */
mm.add(FULL, () => {
  const strip = $('[data-strip]')!;
  const viewport = $('[data-viewport]')!;
  const track = $('[data-track]')!;
  const items = $$('[data-sitem]', track);
  const bar = $('[data-strip-progress]')!;
  const dist = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
  const len = () => Math.min(dist() * 0.9, innerHeight * 1.7); // el pin nunca supera ~1,7 pantallas

  const depth = () => {
    const vc = innerWidth / 2;
    items.forEach((it) => {
      const r = it.getBoundingClientRect();
      const d = Math.max(-1.4, Math.min(1.4, (r.left + r.width / 2 - vc) / (innerWidth * 0.5)));
      const a = Math.min(Math.abs(d), 1);
      gsap.set(it, { scale: 1.06 - 0.2 * a, rotationY: -d * 14, z: -a * 110, opacity: 1 - 0.28 * a });
    });
  };
  depth();
  gsap.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: { trigger: strip, start: 'top top', end: () => '+=' + len(), pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1,
      onUpdate: (st) => { depth(); gsap.set(bar, { scaleX: 0.15 + st.progress * 0.85 }); }, onRefresh: depth },
  });
  return () => { gsap.set([track, ...items], { clearProps: 'all' }); };
});

/* ============ 3 · CRISTAL ============ */
(() => {
  const glassSec = $('[data-glass]');
  if (glassSec) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { glassSec.classList.add('is-lit'); io.disconnect(); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });
    io.observe(glassSec);
  }
  const tabs = $$<HTMLButtonElement>('[data-gtab]');
  const panels = $$('[data-gprod]');
  const shards = $$('.shard');
  const motion = matchMedia(ANY_MOTION).matches;
  const sweep = (card: Element | null) => {
    if (!card) return;
    if (!motion) { gsap.set(card, { '--reveal': '100%' }); return; }
    gsap.fromTo(card, { '--reveal': '-18%' }, { '--reveal': '100%', duration: 1.3, ease: 'power2.out', overwrite: true });
  };
  function select(i: number) {
    tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === i)));
    panels.forEach((p, k) => { p.hidden = k !== i; });
    const panel = panels[i];
    sweep($('.gprod__card', panel));
    if (motion) {
      gsap.fromTo($('.gprod__img', panel), { y: 24, scale: 0.94, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.9, ease: 'power3.out' });
      gsap.fromTo(shards, { rotation: (k) => (k % 2 ? 3 : -3), scale: 0.97 }, { rotation: 0, scale: 1, duration: 1, ease: 'power3.out', stagger: 0.05 });
    }
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[n].focus(); select(n);
    });
  });
  const stage = $('[data-gstage]');
  if (!stage) return;
  if (motion) {
    ScrollTrigger.create({ trigger: stage, start: 'top 75%', once: true, onEnter: () => sweep($('.gprod__card', panels[0])) });
    mm.add('(min-width: 900px)', () => {
      shards.forEach((s, k) => gsap.to(s, { yPercent: (k % 2 ? -1 : 1) * (6 + k * 2), x: (k % 2 ? 1 : -1) * (8 + k * 3), rotation: (k % 2 ? 1 : -1) * 2, ease: 'none',
        scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 0.8 } }));
    });
  } else sweep($('.gprod__card', panels[0]));
})();

/* ============ 4 · MANOS ============ */
mm.add(ANY_MOTION, () => {
  const scene = $('[data-hands-scene]');
  if (!scene) return;
  const human = $('[data-hand="human"]', scene), robot = $('[data-hand="robot"]', scene);
  const halo = $('[data-halo]', scene), spark = $('[data-spark]', scene), tips = $$('.hands__tip', scene);
  gsap.set(human, { x: -430 }); gsap.set(robot, { x: 430 }); gsap.set(halo, { scale: 0.4, opacity: 0, transformOrigin: '50% 50%' });
  gsap.set(spark, { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' });
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  tl.to(halo, { scale: 1, opacity: 1, duration: 1.4 }, 0)
    .to(human, { x: 0, duration: 1.7 }, 0.1).to(robot, { x: 0, duration: 1.7 }, 0.1)
    .to(tips, { opacity: 1, duration: 0.3 }, 1.5)
    .to(spark, { opacity: 1, scale: 1.1, duration: 0.35, ease: 'back.out(3)' }, 1.6)
    .to(spark, { opacity: 0, scale: 1.8, duration: 0.7, ease: 'power2.in' }, 2)
    .to(halo, { scale: 1.06, duration: 1.4, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 1.8);
  ScrollTrigger.create({ trigger: scene, start: 'top 78%', once: true, onEnter: () => tl.play() });
  return () => { gsap.set([human, robot, halo, spark, tips], { clearProps: 'all' }); };
});

/* ============ MÓVIL · revelado progresivo al bajar ============
   Versión adaptada de las animaciones de escritorio: cada bloque entra al aparecer en pantalla, con el
   desplazamiento vertical normal (sin fijar la página ni carruseles). Con movimiento reducido no se aplica
   y todo queda visible y estático. */
mm.add('(max-width: 899px) and ' + ANY_MOTION, () => {
  const groups = [
    '.strip__head > *','.glass__copy > *', '[data-gstage]', '.handsec__l1', '.handsec__l2',
    '.cats__head', '.biz__fig', '.biz__copy > .kicker, .biz__copy > h2, .biz__cta', '.close__card',
  ];
  const all: HTMLElement[] = [];
  const triggers: ScrollTrigger[] = [];
  groups.forEach((sel) => {
    const els = $$(sel).filter((e) => !e.hasAttribute('data-reveal'));
    if (!els.length) return;
    all.push(...els);
    gsap.set(els, { opacity: 0, y: 34 });
    triggers.push(...ScrollTrigger.batch(els, {
      start: 'top 90%', once: true, interval: 0.1, batchMax: 4,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.09, overwrite: true }),
    }));
  });
  return () => { triggers.forEach((t) => t.kill()); gsap.set(all, { clearProps: 'opacity,transform,y' }); };
});

addEventListener('load', () => ScrollTrigger.refresh());
