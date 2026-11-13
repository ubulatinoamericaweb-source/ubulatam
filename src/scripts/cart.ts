/* Carrito de pedido: productos → datos de entrega → resumen → envío por WhatsApp.
   - No procesa pagos ni inventa tarifas de envío.
   - Los datos personales viven solo en memoria mientras la página está abierta: no se guardan en localStorage, Supabase ni ningún servicio. */
import { qGet, qSet, type QItem } from './core';
import { WA_NUMBER } from '../data/catalog';
import { allPeople } from '../data/contacts';
import { renderQuote } from './quote-image';

interface V { l: string; p: number }
interface PInfo { n: string; price: number | null; unit: string; img: string; blend: boolean; vars: V[] | null; vlabel: string }
const data: Record<string, PInfo> = JSON.parse(document.getElementById('c-data')?.textContent || '{}');
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const cop = (n: number) => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

interface Line { item: QItem; d: PInfo; unit: number | null; total: number | null }
function lines(): Line[] {
  return qGet().filter((i) => data[i.id]).map((item) => {
    const d = data[item.id];
    const unit = d.vars ? (d.vars.find((x) => x.l === item.v)?.p ?? null) : d.price;
    return { item, d, unit, total: unit == null ? null : unit * item.qty };
  });
}
const same = (a: QItem, b: QItem) => a.id === b.id && (a.v || '') === (b.v || '');
function mutate(fn: (l: QItem[]) => QItem[]) {
  const out: QItem[] = [];
  fn(qGet()).forEach((x) => { const hit = out.find((y) => same(x, y)); if (hit) hit.qty = Math.min(999, hit.qty + x.qty); else out.push({ ...x }); });
  qSet(out); renderCart();
}

let step = 1;
const cust = { nombre: '', tel: '', pais: '', ciudad: '', dir: '' }; // solo en memoria

/* ---------- Paso 1: productos ---------- */
function renderCart() {
  const L = lines();
  $('c-empty').hidden = L.length > 0; $('c-box').hidden = L.length === 0;
  const ul = $('c-list'); ul.replaceChildren();
  L.forEach(({ item, d, unit, total }) => {
    const li = document.createElement('li'); li.className = 'crow';
    const img = document.createElement('img'); img.alt = ''; img.src = d.img || '/favicon.svg'; img.width = 88; img.height = 88; img.loading = 'lazy'; if (d.blend) img.style.mixBlendMode = 'multiply';
    const b = document.createElement('div'); b.className = 'crow__b';
    const a = document.createElement('a'); a.href = '/' + item.id; a.textContent = d.n;
    b.append(a);
    if (d.vars) {
      const w = document.createElement('label'); w.className = 'crow__v' + (unit == null ? ' is-missing' : ''); w.append(document.createTextNode(`Elige el ${d.vlabel}`));
      const sel = document.createElement('select');
      const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Selecciona'; sel.append(o0);
      d.vars.forEach((v) => { const o = document.createElement('option'); o.value = v.l; o.textContent = `${v.l} — ${cop(v.p)}`; if (v.l === item.v) o.selected = true; sel.append(o); });
      sel.addEventListener('change', () => mutate((l) => l.map((x) => (same(x, item) ? { id: x.id, qty: x.qty, ...(sel.value ? { v: sel.value } : {}) } : x))));
      w.append(sel); b.append(w);
    }
    const f = document.createElement('div'); f.className = 'crow__f';
    const qty = document.createElement('div'); qty.className = 'qty'; qty.setAttribute('role', 'group'); qty.setAttribute('aria-label', 'Cantidad de ' + d.n);
    const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', 'Menos');
    const out = document.createElement('output'); out.textContent = String(item.qty);
    const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Más');
    qty.append(minus, out, plus);
    minus.onclick = () => mutate((l) => l.map((x) => (same(x, item) ? { ...x, qty: Math.max(1, x.qty - 1) } : x)));
    plus.onclick = () => mutate((l) => l.map((x) => (same(x, item) ? { ...x, qty: Math.min(999, x.qty + 1) } : x)));
    const price = document.createElement('div'); price.className = 'crow__p';
    price.textContent = total == null ? 'Elige una opción' : cop(total);
    if (total != null) { const sm = document.createElement('small'); sm.textContent = ` COP${item.qty > 1 ? ` · ${cop(unit!)} c/u` : ''}`; price.append(sm); }
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'btn btn--sm btn--line'; rm.textContent = 'Quitar'; rm.setAttribute('aria-label', 'Quitar ' + d.n);
    rm.onclick = () => mutate((l) => l.filter((x) => !same(x, item)));
    f.append(qty, price, rm); b.append(f); li.append(img, b); ul.append(li);
  });
  // resumen lateral
  const n = L.reduce((a, x) => a + x.item.qty, 0);
  const sub = L.reduce((a, x) => a + (x.total || 0), 0);
  const pend = L.some((x) => x.total == null);
  $('sum-n').textContent = String(n);
  $('sum-total').textContent = `${cop(sub)}${pend ? ' + por definir' : ''} COP`;
  $('c-warn').textContent = '';
}

/* ---------- Navegación de pasos ---------- */
function show(n: number, scroll = true) {
  step = n;
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== String(n); });
  document.querySelectorAll<HTMLElement>('[data-stepper] li').forEach((li) => {
    const s = Number(li.dataset.s);
    if (s === Math.min(n, 3)) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    li.classList.toggle('is-done', s < n);
  });
  const h = document.querySelector<HTMLElement>(`[data-panel="${n}"] h2`);
  if (scroll) document.querySelector('[data-stepper]')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (scroll) setTimeout(() => h?.focus({ preventScroll: true }), 250);
}
document.querySelectorAll<HTMLElement>('[data-back]').forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.back))));

$('to2').addEventListener('click', () => {
  const L = lines();
  const miss = L.find((x) => x.unit == null);
  if (!L.length) return;
  if (miss) {
    $('c-warn').textContent = `Elige el ${miss.d.vlabel} de «${miss.d.n}» para continuar.`;
    document.querySelector<HTMLElement>('.crow__v.is-missing select')?.focus();
    return;
  }
  show(2);
});

/* ---------- Paso 2: datos de entrega ---------- */
const form = $<HTMLFormElement>('c-form');
const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();
const err = (id: string, msg: string) => { $('e-' + id).textContent = msg; return !msg; };
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const digits = val('d-tel').replace(/\D/g, '');
  const ok = [
    err('nombre', val('d-nombre').length >= 3 ? '' : 'Escribe tu nombre completo.'),
    err('tel', /^[\d\s+()-]+$/.test(val('d-tel')) && digits.length >= 7 && digits.length <= 15 ? '' : 'Escribe un teléfono válido, con indicativo (7 a 15 dígitos).'),
    err('pais', val('d-pais').length >= 3 ? '' : 'Indica tu país.'),
    err('ciudad', val('d-ciudad').length >= 2 ? '' : 'Indica tu ciudad.'),
    err('dir', val('d-dir').length >= 6 ? '' : 'Escribe la dirección de entrega.'),
    err('ok', (document.getElementById('d-ok') as HTMLInputElement).checked ? '' : 'Confirma que tus datos son correctos para continuar.'),
  ];
  if (ok.includes(false)) { (form.querySelector('.err:not(:empty)')?.previousElementSibling as HTMLElement | null)?.focus?.(); return; }
  cust.nombre = val('d-nombre'); cust.tel = val('d-tel'); cust.pais = val('d-pais'); cust.ciudad = val('d-ciudad'); cust.dir = val('d-dir');
  renderSummary(); show(3);
});

/* ---------- Paso 3: resumen y mensaje ---------- */
function renderSummary() {
  const L = lines();
  const ul = $('s-lines'); ul.replaceChildren();
  L.forEach(({ item, d, unit, total }) => {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = d.n;
    const t = document.createElement('span'); t.className = 't'; t.textContent = `${cop(total || 0)} COP`;
    const s = document.createElement('small'); s.textContent = `${item.v ? `${d.vlabel[0].toUpperCase()}${d.vlabel.slice(1)}: ${item.v} · ` : ''}${item.qty} × ${cop(unit || 0)} COP`;
    li.append(b, t, s); ul.append(li);
  });
  const dl = $('s-data'); dl.replaceChildren();
  ([['Nombre', cust.nombre], ['Teléfono', cust.tel], ['País', cust.pais], ['Ciudad', cust.ciudad], ['Dirección', cust.dir]] as const).forEach(([k, v]) => {
    const row = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; row.append(dt, dd); dl.append(row);
  });
}
const sep = '━━━━━━━━━━━━━━━━━━';
function message(attach: boolean) {
  const L = lines();
  const sub = L.reduce((a, x) => a + (x.total || 0), 0);
  return [
    '*UBU LATINOAMÉRICA* — Cotización', sep,
    `👤 *Nombre:* ${cust.nombre}`, `📱 *WhatsApp:* ${cust.tel}`, `📍 *Ciudad:* ${cust.ciudad}, ${cust.pais}`, `🚚 *Entrega:* ${cust.dir}`, sep,
    '🛍️ *DETALLE DEL PEDIDO*',
    ...L.map(({ item, d, total }) => `• ${item.qty}x ${d.n}${item.v ? ` (${item.v})` : ''} — ${cop(total || 0)} COP`), sep,
    `Subtotal: ${cop(sub)} COP`, 'Envío: Por confirmar', `*TOTAL: ${cop(sub)} COP*`,
    ...(attach ? ['', 'Adjunto la imagen de mi cotización 🧾✨'] : ['', 'Precios de referencia del catálogo 2026. ¿Me confirman disponibilidad, envío y valor final?']),
  ].join('\n');
}

/* ---------- Imagen de la cotización (descargar / compartir) ---------- */
let quote: { blob: Blob; url: string } | null = null;
const qStatus = (t: string, bad = false) => { const e = $('q-status'); e.textContent = t; e.classList.toggle('is-bad', bad); };
const qBusy = (on: boolean) => document.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => { b.disabled = on; b.setAttribute('aria-busy', String(on)); });
async function buildQuote() {
  if (quote) URL.revokeObjectURL(quote.url); quote = null;
  $<HTMLImageElement>('q-img').removeAttribute('src'); qBusy(true); qStatus('Generando la imagen…');
  try {
    const L = lines();
    const blob = await renderQuote({
      rows: L.map(({ item, d, unit, total }) => ({ name: d.n, variant: item.v ? `${d.vlabel[0].toUpperCase()}${d.vlabel.slice(1)}: ${item.v}` : '', qty: item.qty, unit: unit || 0, total: total || 0, img: d.img, blend: d.blend })),
      fields: [['Nombre', cust.nombre], ['Teléfono', cust.tel], ['Ciudad', `${cust.ciudad}, ${cust.pais}`], ['Dirección', cust.dir]],
      sub: L.reduce((a, x) => a + (x.total || 0), 0),
      date: new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
    quote = { blob, url: URL.createObjectURL(blob) };
    $<HTMLImageElement>('q-img').src = quote.url; qBusy(false); qStatus('');
  } catch (e) {
    qStatus(`No se pudo generar la imagen: ${e instanceof Error ? e.message : 'error desconocido'}. Tu carrito sigue intacto; puedes enviar el pedido como texto.`, true);
    document.querySelectorAll<HTMLButtonElement>('[data-q="retry"]').forEach((b) => { b.disabled = false; });
  }
}
function download() {
  if (!quote) return;
  const a = document.createElement('a'); a.href = quote.url; a.download = 'cotizacion-ubu.png'; document.body.append(a); a.click(); a.remove();
}
$('q-download').addEventListener('click', () => { download(); qStatus('Imagen descargada ✓'); });
$('q-retry').addEventListener('click', buildQuote);
/* PENDIENTE: el compartir directo de imagen + texto (navigator.share con archivos) solo se puede probar en un celular real (Android e iPhone); aquí se simuló.
   Chat de ventas de UBU (+57 316 123 4566), tomado de contacts.ts. Una web no puede preseleccionar el contacto y adjuntar un archivo a la vez. */
const UBU_CHAT = allPeople.find((x) => x.id === 'roberto')!;
$('q-share').addEventListener('click', async () => {
  if (!quote) return;
  const text = message(true);
  const file = new File([quote.blob], 'cotizacion-ubu.png', { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    qStatus(`En la siguiente pantalla, elige WhatsApp y el chat de UBU (${UBU_CHAT.phone}).`);
    try {
      await navigator.share({ files: [file], title: 'Cotización UBU Latinoamérica', text });
      qStatus('Se cerró la hoja de compartir. Revisa en WhatsApp que la imagen y el mensaje se hayan enviado; tu carrito sigue intacto.');
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') { qStatus('Cancelaste el envío: no se envió nada y tu carrito sigue intacto.'); return; }
    }
  }
  download();
  window.open(`https://wa.me/${UBU_CHAT.wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  qStatus('La imagen se descargó. Adjunta el PNG en el chat de UBU antes de enviar el mensaje.');
});

$('confirm').addEventListener('click', () => {
  const text = message(false);
  const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
  ($('send') as HTMLAnchorElement).href = url;
  $('msg').textContent = text;
  $('long-warn').hidden = url.length < 1900;
  $('copy-msg').textContent = '';
  show(4); buildQuote();
});
$('copy').addEventListener('click', async () => {
  const text = $('msg').textContent || '';
  try { await navigator.clipboard.writeText(text); $('copy-msg').textContent = 'Pedido copiado. Pégalo en la conversación de WhatsApp.'; }
  catch { const r = document.createRange(); r.selectNodeContents($('msg')); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); $('copy-msg').textContent = 'Selecciona y copia el mensaje de «Ver el mensaje que se enviará».'; (document.querySelector('.s-preview') as HTMLDetailsElement).open = true; }
});
$('clear').addEventListener('click', () => { qSet([]); show(1); renderCart(); });

addEventListener('storage', () => { if (step === 1) renderCart(); });
renderCart(); show(1, false);
