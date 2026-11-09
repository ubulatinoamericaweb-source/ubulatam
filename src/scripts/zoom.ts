/* Zoom de la imagen grande de la ficha de producto (no se usa en las tarjetas del catálogo).
   - Escritorio: al mover el cursor sobre la imagen se amplía siguiendo el cursor; al salir vuelve a la vista normal.
   - Celular: un toque amplía; arrastrar con el dedo recorre la imagen; pellizcar amplía o reduce; otro toque (o «Quitar zoom») la devuelve.
   La imagen ampliada nunca sale de la ficha: el desplazamiento se limita a sus bordes. */
const stage = document.querySelector<HTMLElement>('[data-zoom]');
if (stage) {
  const img = stage.querySelector<HTMLImageElement>('img')!;
  const btn = stage.querySelector<HTMLButtonElement>('.pdp__zoomreset');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX = 4, DESK = 2.3, TOUCH = 2.5;
  let s = 1, tx = 0, ty = 0;

  const clamp = () => {
    // el límite parte del tamaño real de la imagen: al ampliar llega justo al borde de la ficha, sin huecos ni recortes
    const mx = Math.max(0, (s * img.offsetWidth - stage.clientWidth) / 2), my = Math.max(0, (s * img.offsetHeight - stage.clientHeight) / 2);
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
  };
  const apply = (ease: 'none' | 'fast' | 'slow') => {
    img.style.transition = reduced || ease === 'none' ? 'none' : ease === 'fast' ? 'transform .16s ease-out' : 'transform .4s cubic-bezier(.22,1,.36,1)';
    img.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
    const z = s > 1.02;
    stage.classList.toggle('is-zoomed', z);
    if (btn) btn.hidden = !z;
  };
  const reset = () => { s = 1; tx = 0; ty = 0; apply('slow'); };
  const zoomAt = (clientX: number, clientY: number, to: number, ease: 'none' | 'fast' | 'slow') => {
    const r = stage.getBoundingClientRect();
    s = to; tx = -((clientX - r.left) / r.width - 0.5) * (s - 1) * r.width; ty = -((clientY - r.top) / r.height - 0.5) * (s - 1) * r.height;
    clamp(); apply(ease);
  };

  const pts = new Map<number, { x: number; y: number }>();
  let startDist = 0, startS = 1, moved = false, downAt = 0, mouseIn = false;
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  stage.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') mouseIn = true; });
  stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { mouseIn = false; reset(); } });

  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { if (mouseIn) zoomAt(e.clientX, e.clientY, DESK, 'fast'); return; }
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { // pellizco
      s = Math.max(1, Math.min(MAX, startS * (dist() / (startDist || 1)))); moved = true; clamp(); apply('none'); return;
    }
    if (s > 1.02) { tx += dx; ty += dy; clamp(); apply('none'); }
  });

  let downX = 0, downY = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    stage.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { downAt = performance.now(); downX = e.clientX; downY = e.clientY; moved = false; }
    if (pts.size === 2) { startDist = dist(); startS = s; moved = true; }
  });
  const end = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    const wasSingle = pts.size === 1;
    pts.delete(e.pointerId);
    if (e.type === 'pointercancel') return;
    const far = Math.hypot(e.clientX - downX, e.clientY - downY) > 9;
    if (wasSingle && !far && !moved && performance.now() - downAt < 450) {
      if (s > 1.02) reset(); else zoomAt(e.clientX, e.clientY, TOUCH, 'slow'); // toque: ampliar / devolver
    } else if (s < 1.08) reset(); // tras un pellizco casi sin zoom
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  btn?.addEventListener('click', (e) => { e.stopPropagation(); reset(); });
  btn?.addEventListener('pointerdown', (e) => e.stopPropagation());
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && s > 1.02) reset(); });
  addEventListener('resize', () => { clamp(); apply('none'); });
}
