/* Movimiento ligero para páginas internas: paralaje suave de capas con el cursor (solo mouse, sin movimiento reducido). */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
if (!reduced && fine) {
  document.querySelectorAll<HTMLElement>('[data-orbit]').forEach((host) => {
    const layers = Array.from(host.querySelectorAll<HTMLElement>('[data-depth]'));
    let raf = 0, tx = 0, ty = 0, x = 0, y = 0;
    const tick = () => {
      x += (tx - x) * 0.1; y += (ty - y) * 0.1;
      layers.forEach((l) => { const d = Number(l.dataset.depth); l.style.translate = `${(x * d).toFixed(2)}px ${(y * d).toFixed(2)}px`; });
      raf = Math.abs(tx - x) > 0.005 || Math.abs(ty - y) > 0.005 ? requestAnimationFrame(tick) : 0;
    };
    host.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = host.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  });
}
