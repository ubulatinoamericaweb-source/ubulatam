/* Funciones comunes: header, menú, lista de cotización, revelado y ojos de la carita decorativa. */

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- Header ---------- */
const header = $('[data-header]');
const onScroll = () => header?.classList.toggle('is-scrolled', scrollY > 24);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const menuBtn = $<HTMLButtonElement>('[data-menu-btn]');
const panel = $('[data-menu-panel]');
function setMenu(open: boolean) {
  if (!menuBtn || !panel) return;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  panel.hidden = !open;
}
menuBtn?.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
panel?.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) setMenu(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel && !panel.hidden) { setMenu(false); menuBtn?.focus(); } });
matchMedia('(min-width:1061px)').addEventListener('change', (m) => m.matches && setMenu(false));

/* ---------- Carrito de pedido (localStorage; sin pagos y sin datos personales) ---------- */
const QKEY = 'ubu_quote';
export interface QItem { id: string; qty: number; v?: string }
export function qGet(): QItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(QKEY) || '[]');
    if (!Array.isArray(v)) return [];
    return v
      .filter((i) => i && typeof i.id === 'string' && Number.isFinite(i.qty) && i.qty > 0)
      .map((i) => ({ id: i.id, qty: Math.min(999, Math.floor(i.qty)), ...(typeof i.v === 'string' && i.v ? { v: i.v.slice(0, 120) } : {}) }));
  } catch { return []; }
}
export function qSet(list: QItem[]) {
  try { localStorage.setItem(QKEY, JSON.stringify(list)); } catch { /* almacenamiento bloqueado */ }
  qSync();
  document.dispatchEvent(new CustomEvent('ubu:quote'));
}
/** Agrega una unidad (o la suma si ya existe la misma combinación producto + variante). */
export function qAdd(id: string, v?: string) {
  const list = qGet();
  const hit = list.find((x) => x.id === id && (x.v || '') === (v || ''));
  if (hit) hit.qty = Math.min(999, hit.qty + 1); else list.push({ id, qty: 1, ...(v ? { v } : {}) });
  qSet(list);
}
function qSync() {
  const list = qGet();
  const n = list.reduce((a, i) => a + i.qty, 0);
  $$('[data-quote-count]').forEach((e) => { e.textContent = String(n); e.dataset.n = String(n); });
  $$<HTMLElement>('[data-cart-link]').forEach((a) => a.setAttribute('aria-label', n ? `Carrito, ${n} ${n === 1 ? 'producto' : 'productos'}` : 'Carrito, vacío'));
  $$<HTMLButtonElement>('[data-add]').forEach((b) => {
    const on = list.some((i) => i.id === b.dataset.add);
    b.setAttribute('aria-pressed', String(on));
    const t = $('.t', b);
    if (t) t.textContent = on ? 'En el carrito' : (b.dataset.label || 'Agregar al carrito');
  });
}
const flash = (b: HTMLElement) => { const t = $('.t', b) || b; const old = t.textContent; t.textContent = '¡Agregado!'; b.classList.add('is-added'); setTimeout(() => { t.textContent = old; b.classList.remove('is-added'); }, 1300); };
document.addEventListener('click', (e) => {
  const el = e.target as HTMLElement;
  const b = el.closest<HTMLButtonElement>('[data-add]');
  if (b) {
    const id = b.dataset.add!;
    const list = qGet();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list.splice(i, 1); else list.push({ id, qty: 1 });
    qSet(list);
    return;
  }
  const row = el.closest<HTMLButtonElement>('[data-add-var]');
  if (row) { qAdd(row.dataset.addVar!, row.dataset.v); flash(row); return; }
  const pick = el.closest<HTMLButtonElement>('[data-add-pick]');
  if (pick) {
    const sel = pick.parentElement?.querySelector<HTMLSelectElement>('select');
    if (!sel || !sel.value) { sel?.focus(); return; }
    qAdd(pick.dataset.addPick!, sel.value); flash(pick);
  }
});
qSync();

/* ---------- Revelado al entrar en pantalla (CSS; GSAP lo usa en escenas propias) ---------- */
const revealEls = $$('[data-reveal]:not([data-reveal="gsap"])');
if (!revealEls.length) { /* nada */ }
else if (reduced || !('IntersectionObserver' in window)) revealEls.forEach((e) => e.classList.add('is-in'));
else {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  revealEls.forEach((e) => io.observe(e));
}

/* ---------- Ojos que siguen el cursor (solo mouse, sin movimiento reducido) ---------- */
if (finePointer && !reduced) {
  type Eye = { g: SVGGElement; host: Element; rx: number; ry: number; x: number; y: number; tx: number; ty: number; vis: boolean };
  const eyes: Eye[] = $$<SVGGElement>('[data-eyes]').map((g) => {
    const [rx, ry] = (g.dataset.eyesRange || '9,6').split(',').map(Number);
    return { g, host: g.ownerSVGElement || g, rx, ry, x: 0, y: 0, tx: 0, ty: 0, vis: false };
  });
  if (eyes.length) {
    const vio = new IntersectionObserver((es) => es.forEach((en) => {
      const e = eyes.find((x) => x.host === en.target); if (e) e.vis = en.isIntersecting;
    }));
    eyes.forEach((e) => vio.observe(e.host));
    let raf = 0;
    const tick = () => {
      let moving = false;
      for (const e of eyes) {
        if (!e.vis) continue;
        e.x += (e.tx - e.x) * 0.14; e.y += (e.ty - e.y) * 0.14;
        if (Math.abs(e.tx - e.x) > 0.02 || Math.abs(e.ty - e.y) > 0.02) moving = true;
        e.g.style.transform = `translate(${e.x.toFixed(2)}px, ${e.y.toFixed(2)}px)`;
      }
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    addEventListener('pointermove', (ev) => {
      if (ev.pointerType !== 'mouse') return;
      for (const e of eyes) {
        if (!e.vis) continue;
        const r = e.host.getBoundingClientRect();
        const dx = (ev.clientX - (r.left + r.width / 2)) / (innerWidth * 0.45);
        const dy = (ev.clientY - (r.top + r.height / 2)) / (innerHeight * 0.45);
        e.tx = Math.max(-1, Math.min(1, dx)) * e.rx;
        e.ty = Math.max(-1, Math.min(1, dy)) * e.ry;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  }
}

/* ---------- Precios en vivo (opcional): solo si hay variables PUBLIC_SUPABASE_* ---------- */
const SB_URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
if (SB_URL && SB_KEY && $('[data-sb-price]')) {
  const cop = (n: number) => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  fetch(`${SB_URL}/rest/v1/productos?select=slug,precio,desde,unidad,activo`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((rows: { slug: string; precio: number; desde?: boolean; unidad?: string; activo?: boolean }[]) => {
      if (!Array.isArray(rows) || !rows.length) return;
      const map = new Map(rows.map((r) => [r.slug, r]));
      $$('[data-sb-price]').forEach((el) => {
        const r = map.get(el.dataset.sbPrice!);
        if (!r || r.activo === false || !Number.isFinite(r.precio)) return; // sin dato válido: se conserva el precio del catálogo
        const num = $('[data-num]', el);
        if (num) num.textContent = (r.desde ? 'Desde ' : '') + cop(r.precio);
      });
    })
    .catch(() => { /* sin conexión o sin tabla: se mantienen los precios del catálogo */ });
}
