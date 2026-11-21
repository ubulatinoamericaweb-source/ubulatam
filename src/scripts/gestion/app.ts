/* UBU Gestión: dashboard, punto de venta, cotizaciones, facturas/remisiones y anulaciones, inventario, clientes,
   cuentas por cobrar y gastos. Todo el dinero y el stock se calculan y validan en Supabase (supabase/gestion.sql);
   esta interfaz solo arma pedidos y muestra resultados. Los textos de usuarios se pintan con textContent (sin innerHTML). */
import { sbOn, signIn, endSession, getSession, priceKey, parsePrice } from '../pricing';
import { get, rpc, insert, patch, del, SessionLost } from './api';
import { renderQuote } from '../quote-image';
import { loadPanel as loadPrecios, dirty as preciosDirty } from '../admin';

/* ---------------- utilidades ---------------- */
type Any = Record<string, any>;
interface Var { k: string; l: string; c: number | null }
interface Prod { slug: string; name: string; cat: string; order: number; img: string; blend: boolean; vars: Var[] }
const PRODS: Prod[] = JSON.parse(document.getElementById('a-data')?.textContent || '[]');
const BY = new Map(PRODS.map((p) => [p.slug, p]));
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const cop = (n: number | null | undefined) => n == null ? '—' : '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fdt = (s: string) => new Date(s).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fd = (s: string) => new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dayStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
const isoDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TIPO: Any = { cotizacion: 'Cotización', factura: 'Factura de venta', remision: 'Remisión' };
const METODOS = ['efectivo', 'transferencia', 'nequi', 'daviplata', 'tarjeta', 'otro'];
const waNum = (t: string) => { const d = (t || '').replace(/\D/g, ''); return d.length === 10 ? '57' + d : d; };

function h(tag: string, props: Any = {}, ...kids: any[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') (el as HTMLInputElement).value = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  kids.flat(9).forEach((c) => { if (c != null && c !== false) el.append(c instanceof Node ? c : String(c)); });
  return el;
}
const pill = (estado: string) => {
  const m: Any = { pagada: 'ok', vigente: 'info', convertida: 'ok', parcial: 'warn', pendiente: 'warn', anulada: 'bad' };
  return h('span', { class: `g-pill g-pill--${m[estado] || ''}`, text: estado[0].toUpperCase() + estado.slice(1) });
};
const field = (label: string, input: HTMLElement) => h('label', { class: 'g-f' }, h('span', { text: label }), input);
const sel = (opts: [string, string][], value = '', props: Any = {}) => h('select', props, opts.map(([v, l]) => h('option', { value: v, selected: v === value, text: l })));
const btn = (text: string, onclick: () => void, cls = '') => h('button', { type: 'button', class: `g-btn ${cls}`, text, onclick });
const table = (head: string[], rows: HTMLElement[], numCols: number[] = []) => h('div', { class: 'g-tablewrap' },
  h('table', { class: 'g-table' }, h('thead', {}, h('tr', {}, head.map((t, i) => h('th', { class: numCols.includes(i) ? 'n' : null, text: t })))),
    h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: head.length, class: 'g-empty', text: 'Sin registros.' })))));

function status(t: string, kind: '' | 'ok' | 'bad' = '') { const s = $('g-status'); s.textContent = t; s.className = `g-status ${kind ? 'is-' + kind : ''}`; }
function fail(e: unknown) { if (e instanceof SessionLost) return; status((e as Error).message || 'Error inesperado.', 'bad'); }

/* ---------------- modal ---------------- */
const modal = $<HTMLDialogElement>('g-modal');
function openModal(title: string, ...body: any[]) {
  $('g-modal-body').replaceChildren(h('div', { class: 'g-modal__h' }, h('h2', { text: title }), h('button', { type: 'button', class: 'g-ico', 'aria-label': 'Cerrar', onclick: () => modal.close(), text: '✕' })), h('div', { class: 'g-modal__b' }, body));
  if (!modal.open) modal.showModal();
}
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

/* ---------------- datos de referencia: precios y stock ---------------- */
let PUB = new Map<string, number | null>(), MAY = new Map<string, number | null>(), INV = new Map<string, Any>();
async function loadRef() {
  const [pub, may, inv] = await Promise.all([
    get<Any[]>('precios?select=slug,variante,precio'), get<Any[]>('precios_mayoristas?select=slug,variante,precio'), get<Any[]>('inventario?select=*'),
  ]);
  PUB = new Map(pub.map((r) => [priceKey(r.slug, r.variante), r.precio]));
  MAY = new Map(may.map((r) => [priceKey(r.slug, r.variante), r.precio]));
  INV = new Map(inv.map((r) => [priceKey(r.slug, r.variante), r]));
}
function priceOf(slug: string, k: string, lista: string): number | null {
  const key = priceKey(slug, k), cat = BY.get(slug)?.vars.find((v) => v.k === k)?.c ?? null;
  const pub = PUB.get(key) ?? cat;
  return lista === 'mayorista' ? (MAY.get(key) ?? pub) : pub;
}
const stockOf = (slug: string, k: string) => INV.get(priceKey(slug, k))?.stock ?? 0;
const lowStock = () => [...INV.values()].filter((r) => r.minimo > 0 && r.stock <= r.minimo);

/* ---------------- navegación ---------------- */
const TITLES: Any = { dashboard: 'Dashboard', pos: 'Punto de venta', cotizar: 'Cotizaciones', documentos: 'Facturas y anulaciones', inventario: 'Inventario', precios: 'Catálogo y precios', terceros: 'Clientes y terceros', cartera: 'Cuentas por cobrar', gastos: 'Gastos' };
const VIEWS: Any = {};
async function route() {
  const id = TITLES[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== id));
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) => (a.dataset.nav === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('g-title').textContent = TITLES[id]; document.title = `${TITLES[id]} · UBU Gestión`;
  $('g-side').classList.remove('is-open'); $('g-menu').setAttribute('aria-expanded', 'false');
  status('');
  try { await VIEWS[id]($(`v-${id}`)); } catch (e) { fail(e); }
}
addEventListener('hashchange', route);
$('g-menu').addEventListener('click', () => { const o = $('g-side').classList.toggle('is-open'); $('g-menu').setAttribute('aria-expanded', String(o)); });
$('g-date').textContent = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function badge(id: string, n: number, bad = false) {
  const b = document.querySelector<HTMLElement>(`[data-badge="${id}"]`); if (!b) return;
  b.hidden = !n; b.textContent = String(n); b.classList.toggle('is-bad', bad);
}

/* ================= DASHBOARD ================= */
VIEWS.dashboard = async (root: HTMLElement) => {
  root.replaceChildren(h('p', { class: 'g-muted', text: 'Cargando…' }));
  const today = dayStart(), month = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [, hoy, pagos, cartera, ult, gastos, cots] = await Promise.all([
    loadRef(),
    get<Any[]>(`v_documentos?select=id,tipo,total,estado&fecha=gte.${today}&tipo=neq.cotizacion&estado=neq.anulada`),
    get<Any[]>(`pagos?select=valor,metodo,documentos!inner(estado)&fecha=gte.${today}&documentos.estado=neq.anulada`),
    get<Any[]>('v_documentos?select=id,saldo,vence&saldo=gt.0'),
    get<Any[]>('v_documentos?select=id,numero,tipo,cliente,fecha,total,estado&order=fecha.desc&limit=10'),
    get<Any[]>(`gastos?select=valor,fecha&fecha=gte.${month}`),
    get<Any[]>('documentos?select=id&tipo=eq.cotizacion&estado=eq.vigente'),
  ]);
  const ids = hoy.map((d) => d.id);
  const items = ids.length ? await get<Any[]>(`documento_items?select=cantidad,costo,total,documento_id&documento_id=in.(${ids.join(',')})`) : [];
  const ventas = hoy.reduce((a, d) => a + d.total, 0), recaudo = pagos.reduce((a, p) => a + p.valor, 0);
  const costo = items.reduce((a, i) => a + i.costo * i.cantidad, 0);
  const vencidas = cartera.filter((d) => d.vence && d.vence < isoDate());
  const low = lowStock(), gMes = gastos.reduce((a, g) => a + g.valor, 0), gHoy = gastos.filter((g) => g.fecha === isoDate()).reduce((a, g) => a + g.valor, 0);
  badge('inventario', low.length, true); badge('cartera', vencidas.length, true); badge('cotizar', cots.length);

  root.replaceChildren(
    low.length ? h('div', { class: 'g-banner g-banner--warn' }, `📦 ${low.length} referencia(s) en o bajo el stock mínimo.`, h('a', { class: 'g-btn g-btn--sm', href: '#inventario', text: 'Ver' })) : '',
    vencidas.length ? h('div', { class: 'g-banner g-banner--bad' }, `⏰ ${vencidas.length} documento(s) vencido(s) por ${cop(vencidas.reduce((a, d) => a + d.saldo, 0))}.`, h('a', { class: 'g-btn g-btn--sm', href: '#cartera', text: 'Cartera' })) : '',
    h('div', { class: 'g-kpis' },
      h('div', { class: 'g-kpi g-kpi--hero' }, h('span', { text: 'Ventas del día' }), h('b', { text: cop(ventas) }), h('small', { text: `${hoy.length} documento(s) emitidos` })),
      h('div', { class: 'g-kpi' }, h('span', { text: 'Recaudado hoy' }), h('b', { text: cop(recaudo) }), h('small', { text: METODOS.map((m) => [m, pagos.filter((p) => p.metodo === m).reduce((a, p) => a + p.valor, 0)]).filter((x) => x[1]).map(([m, v]) => `${m} ${cop(v as number)}`).join(' · ') || 'sin pagos' })),
      h('div', { class: 'g-kpi' }, h('span', { text: 'Cartera por cobrar' }), h('b', { text: cop(cartera.reduce((a, d) => a + d.saldo, 0)) }), h('small', { text: `${cartera.length} documento(s)` })),
      h('div', { class: 'g-kpi g-kpi--ok' }, h('span', { text: 'Utilidad bruta del día' }), h('b', { text: cop(ventas - costo) }), h('small', { text: costo ? 'ventas − costo de inventario' : 'registra costos en Inventario' })),
      h('div', { class: 'g-kpi' }, h('span', { text: 'Gastos' }), h('b', { text: cop(gHoy) }), h('small', { text: `hoy · mes ${cop(gMes)}` })),
    ),
    h('div', { class: 'g-grid2' },
      h('div', { class: 'g-card' }, h('h2', { text: '⚡ Accesos rápidos' }), h('div', { class: 'g-quick' },
        h('a', { href: '#pos' }, '🛒 Nueva venta', h('small', { text: 'factura o remisión' })),
        h('a', { href: '#cotizar' }, '📝 Cotizar', h('small', { text: `${cots.length} vigente(s)` })),
        h('a', { href: '#inventario' }, '📦 Entrada de mercancía', h('small', { text: 'inventario y kardex' })),
        h('a', { href: '#cartera' }, '💳 Registrar abono', h('small', { text: 'cuentas por cobrar' })),
        h('a', { href: '#gastos' }, '💸 Registrar gasto', h('small', { text: 'caja menor y fijos' })),
        h('a', { href: '#terceros' }, '👥 Nuevo cliente', h('small', { text: 'clientes y mayoristas' })))),
      h('div', { class: 'g-card' }, h('h2', { text: '🕘 Últimos 10 documentos' }), docTable(ult, false)),
    ),
  );
};

function docTable(docs: Any[], full = true) {
  return table(full ? ['Número', 'Tipo', 'Cliente', 'Fecha', 'Total', 'Saldo', 'Estado'] : ['Número', 'Cliente', 'Fecha', 'Total', 'Estado'],
    docs.map((d) => h('tr', { 'data-open': '', tabindex: 0, onclick: () => showDoc(d.id), onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && showDoc(d.id) },
      h('td', {}, h('b', { text: d.numero })), full ? h('td', { text: TIPO[d.tipo] }) : '', h('td', { text: d.cliente?.nombre || 'Consumidor final' }),
      h('td', { text: fdt(d.fecha) }), h('td', { class: 'n', text: cop(d.total) }), full ? h('td', { class: 'n', text: d.tipo === 'cotizacion' ? '—' : cop(d.saldo) }) : '', h('td', {}, pill(d.estado)))),
    full ? [4, 5] : [3]);
}

/* ================= PUNTO DE VENTA y COTIZACIONES (mismo editor) ================= */
interface Line { slug: string; k: string; name: string; vl: string; qty: number; precio: number }
interface Ed { lines: Line[]; lista: string; tipo: string; cli: Any; tercero_id: string; descuento: number; pago: string; metodo: string; vence: string; notas: string; origen_id: string; guardar: boolean }
const blank = (tipo: string): Ed => ({ lines: [], lista: 'publico', tipo, cli: { nombre: '', telefono: '', documento: '', ciudad: '', direccion: '' }, tercero_id: '', descuento: 0, pago: '', metodo: 'efectivo', vence: '', notas: '', origen_id: '', guardar: false });
const EDS: Any = { pos: blank('factura'), cotizar: blank('cotizacion') };
let TERCEROS: Any[] = [];

VIEWS.pos = (root: HTMLElement) => editor(root, 'pos');
VIEWS.cotizar = async (root: HTMLElement) => {
  await editor(root, 'cotizar');
  const docs = await get<Any[]>('v_documentos?select=*&tipo=eq.cotizacion&order=fecha.desc&limit=30');
  root.append(h('div', { class: 'g-card' }, h('h2', { text: 'Cotizaciones recientes' }), docTable(docs)));
};

async function editor(root: HTMLElement, view: 'pos' | 'cotizar') {
  root.replaceChildren(h('p', { class: 'g-muted', text: 'Cargando productos…' }));
  [TERCEROS] = await Promise.all([get<Any[]>('terceros?select=*&order=nombre&limit=1000'), loadRef()]);
  const ed: Ed = EDS[view];
  const q = h('input', { type: 'search', class: 'g-in', placeholder: 'Buscar producto o modelo…', 'aria-label': 'Buscar producto' }) as HTMLInputElement;
  const cat = sel([['', 'Todas'], ['conectividad', 'Conectividad'], ['hidrogel', 'Hidrogel']], '', { class: 'g-in', 'aria-label': 'Categoría' }) as HTMLSelectElement;
  const grid = h('div', { class: 'pos__grid' }), cart = h('div', { class: 'pos__cart' });

  const drawGrid = () => {
    const t = q.value.trim().toLowerCase();
    grid.replaceChildren(...PRODS.filter((p) => (!cat.value || p.cat === cat.value) && (!t || (p.name + ' ' + p.vars.map((v) => v.k).join(' ')).toLowerCase().includes(t))).map((p) => {
      const st = p.vars.reduce((a, v) => a + stockOf(p.slug, v.k), 0), pr = priceOf(p.slug, p.vars[0].k, ed.lista);
      return h('button', { type: 'button', class: 'pos__p', onclick: () => pick(p) },
        p.img ? h('img', { src: p.img, alt: '', loading: 'lazy', class: p.blend ? 'blend' : null }) : '',
        h('b', { text: p.name }), h('span', {}, h('em', { text: p.vars.length > 1 ? `${p.vars.length} modelos` : cop(pr) }), h('small', { text: `Stock ${st}` })));
    }));
  };
  const add = (p: Prod, v: Var) => {
    const hit = ed.lines.find((l) => l.slug === p.slug && l.k === v.k);
    if (hit) hit.qty++; else ed.lines.push({ slug: p.slug, k: v.k, name: p.name, vl: v.k ? v.l : '', qty: 1, precio: priceOf(p.slug, v.k, ed.lista) ?? 0 });
    modal.close(); drawCart();
  };
  const pick = (p: Prod) => p.vars.length === 1 ? add(p, p.vars[0]) : openModal(p.name, h('div', { class: 'g-quick' },
    p.vars.map((v) => h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); add(p, v); } }, v.l, h('small', { text: `${cop(priceOf(p.slug, v.k, ed.lista))} · stock ${stockOf(p.slug, v.k)}` })))));

  const drawCart = () => {
    const sub = ed.lines.reduce((a, l) => a + l.qty * l.precio, 0), total = Math.max(sub - ed.descuento, 0);
    const isCot = ed.tipo === 'cotizacion';
    const lines = h('div', { class: 'pos__lines' }, ed.lines.length ? ed.lines.map((l, i) => h('div', { class: 'pos__l' },
      h('div', {}, h('b', { text: l.name }), h('small', { text: `${l.vl ? l.vl + ' · ' : ''}stock ${stockOf(l.slug, l.k)}` })),
      h('input', { class: 'g-in', type: 'number', min: 1, value: l.qty, 'aria-label': `Cantidad de ${l.name}`, onchange: (e: Event) => { l.qty = Math.max(1, Math.floor(+(e.target as HTMLInputElement).value) || 1); drawCart(); } }),
      h('input', { class: 'g-in', inputmode: 'numeric', value: l.precio, 'aria-label': `Precio unitario de ${l.name}`, onchange: (e: Event) => { const v = parsePrice((e.target as HTMLInputElement).value); l.precio = Number.isNaN(v) || v == null ? l.precio : v; drawCart(); } }),
      h('button', { type: 'button', class: 'g-ico', 'aria-label': `Quitar ${l.name}`, text: '✕', onclick: () => { ed.lines.splice(i, 1); drawCart(); } }))) : h('p', { class: 'g-muted', text: 'Toca un producto para agregarlo.' }));

    const seg = (opts: [string, string][], cur: string, on: (v: string) => void, label: string) => h('div', { class: 'pos__seg', role: 'group', 'aria-label': label },
      opts.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === cur), text: l, onclick: () => on(v) })));
    const cliIn = (k: string, label: string, props: Any = {}) => field(label, h('input', { value: ed.cli[k], ...props, oninput: (e: Event) => { ed.cli[k] = (e.target as HTMLInputElement).value; if (k === 'nombre') ed.tercero_id = ''; } }));
    const pickCli = h('input', { class: 'g-in', list: `dl-${view}`, placeholder: 'Buscar cliente guardado…', 'aria-label': 'Buscar cliente guardado',
      onchange: (e: Event) => {
        const t = TERCEROS.find((x) => `${x.nombre}${x.telefono ? ' · ' + x.telefono : ''}` === (e.target as HTMLInputElement).value); if (!t) return;
        ed.tercero_id = t.id; ed.cli = { nombre: t.nombre, telefono: t.telefono || '', documento: t.documento || '', ciudad: t.ciudad || '', direccion: t.direccion || '' };
        if (t.tipo === 'mayorista' && ed.lista !== 'mayorista') { ed.lista = 'mayorista'; reprice(); }
        drawCart();
      } });
    const reprice = () => ed.lines.forEach((l) => (l.precio = priceOf(l.slug, l.k, ed.lista) ?? l.precio));

    cart.replaceChildren(
      h('div', { class: 'g-card', style: 'display:grid;gap:12px' },
        h('h2', {}, isCot ? '📝 Nueva cotización' : '🧾 Nueva venta', ed.origen_id ? h('span', { class: 'g-pill g-pill--info', text: 'desde cotización' }) : ''),
        h('div', { class: 'g-actions' },
          isCot ? '' : seg([['factura', 'Factura'], ['remision', 'Remisión']], ed.tipo, (v) => { ed.tipo = v; drawCart(); }, 'Tipo de documento'),
          seg([['publico', 'Cliente final'], ['mayorista', 'Mayorista']], ed.lista, (v) => { ed.lista = v; reprice(); drawCart(); drawGrid(); }, 'Lista de precios')),
        lines,
        h('details', { open: !!ed.cli.nombre || null }, h('summary', { text: ed.cli.nombre ? `Cliente: ${ed.cli.nombre}` : 'Cliente (opcional: consumidor final)' }),
          h('div', { style: 'display:grid;gap:10px;margin-top:10px' }, pickCli,
            h('datalist', { id: `dl-${view}` }, TERCEROS.map((t) => h('option', { value: `${t.nombre}${t.telefono ? ' · ' + t.telefono : ''}` }))),
            h('div', { class: 'g-row' }, cliIn('nombre', 'Nombre o razón social', { maxlength: 120 }), cliIn('telefono', 'Teléfono / WhatsApp', { inputmode: 'tel', maxlength: 30 })),
            h('div', { class: 'g-row' }, cliIn('documento', 'Cédula / NIT', { maxlength: 30 }), cliIn('ciudad', 'Ciudad', { maxlength: 80 })),
            cliIn('direccion', 'Dirección', { maxlength: 160 }),
            ed.tercero_id ? '' : h('label', { class: 'ap__vis' }, h('input', { type: 'checkbox', checked: ed.guardar, onchange: (e: Event) => (ed.guardar = (e.target as HTMLInputElement).checked) }), 'Guardar en clientes'))),
        h('div', { class: 'g-row' },
          field('Descuento ($)', h('input', { inputmode: 'numeric', value: ed.descuento || '', onchange: (e: Event) => { const v = parsePrice((e.target as HTMLInputElement).value); ed.descuento = Number.isNaN(v) ? 0 : Math.min(v ?? 0, sub); drawCart(); } })),
          field(isCot ? 'Válida hasta' : 'Vence (si es a crédito)', h('input', { type: 'date', value: ed.vence, onchange: (e: Event) => (ed.vence = (e.target as HTMLInputElement).value) }))),
        isCot ? '' : h('div', { class: 'g-row' },
          field('Pago recibido ahora', h('input', { inputmode: 'numeric', placeholder: `${cop(total)} (todo)`, value: ed.pago, oninput: (e: Event) => (ed.pago = (e.target as HTMLInputElement).value) })),
          field('Método', sel(METODOS.map((m) => [m, m[0].toUpperCase() + m.slice(1)]), ed.metodo, { onchange: (e: Event) => (ed.metodo = (e.target as HTMLSelectElement).value) }))),
        field('Notas', h('input', { value: ed.notas, maxlength: 300, oninput: (e: Event) => (ed.notas = (e.target as HTMLInputElement).value) })),
        h('div', { class: 'pos__tot' }, h('div', {}, h('span', { text: 'Subtotal' }), h('span', { text: cop(sub) })),
          ed.descuento ? h('div', {}, h('span', { text: 'Descuento' }), h('span', { text: '−' + cop(ed.descuento) })) : '',
          h('div', {}, h('span', { text: 'TOTAL' }), cop(total))),
        h('div', { class: 'g-actions' },
          h('button', { type: 'button', class: 'g-btn g-btn--cyan', disabled: !ed.lines.length || null, text: isCot ? 'Guardar cotización' : `Emitir ${ed.tipo === 'factura' ? 'factura' : 'remisión'}`, onclick: (e: Event) => emit(e.target as HTMLButtonElement, total) }),
          btn('Limpiar', () => { if (!ed.lines.length || confirm('¿Vaciar este documento?')) { EDS[view] = blank(ed.tipo === 'cotizacion' ? 'cotizacion' : 'factura'); editor(root, view); } })),
      ));
  };

  const emit = async (b: HTMLButtonElement, total: number) => {
    const isCot = ed.tipo === 'cotizacion';
    let pago = 0;
    if (!isCot) {
      const v = ed.pago.trim() === '' ? total : parsePrice(ed.pago);
      if (v == null || Number.isNaN(v) || v > total) { status('El pago debe ser un número entero entre 0 y el total.', 'bad'); return; }
      pago = v;
      if (pago < total && !ed.cli.nombre.trim()) { status('Una venta a crédito o con saldo necesita el nombre del cliente.', 'bad'); return; }
    }
    b.disabled = true; b.textContent = 'Guardando…';
    try {
      const cli = Object.fromEntries(Object.entries(ed.cli).map(([k, v]) => [k, String(v).trim()]));
      if (!ed.tercero_id && ed.guardar && cli.nombre) {
        const t = await insert('terceros', { ...cli, tipo: ed.lista === 'mayorista' ? 'mayorista' : 'cliente' });
        ed.tercero_id = t.id;
      }
      const r = await rpc<Any>('emitir_documento', { p: {
        tipo: ed.tipo, tercero_id: ed.tercero_id || null, cliente: cli.nombre ? cli : { nombre: 'Consumidor final' }, lista: ed.lista,
        items: ed.lines.map((l) => ({ slug: l.slug, variante: l.k, nombre: l.vl ? `${l.name} · ${l.k}` : l.name, cantidad: l.qty, precio: l.precio })),
        descuento: ed.descuento, notas: ed.notas, vence: ed.vence || null, origen_id: ed.origen_id || null,
        pago: isCot ? null : { valor: pago, metodo: ed.metodo },
      } });
      EDS[view] = blank(isCot ? 'cotizacion' : ed.tipo);
      status(`${TIPO[isCot ? 'cotizacion' : ed.tipo]} ${r.numero} guardada ✓`, 'ok');
      await editor(root, view);
      if (view === 'cotizar') VIEWS.cotizar(root);
      showDoc(r.id);
    } catch (e) { fail(e); b.disabled = false; b.textContent = 'Reintentar'; }
  };

  q.addEventListener('input', drawGrid); cat.addEventListener('change', drawGrid);
  root.replaceChildren(h('div', { class: 'pos' }, h('div', { class: 'g-card', style: 'display:grid;gap:12px' }, h('div', { class: 'g-row' }, q, cat), grid), cart));
  drawGrid(); drawCart();
}

/* ================= DETALLE DE DOCUMENTO: imagen, WhatsApp, abonos, anulación, conversión ================= */
async function showDoc(id: string) {
  try {
    const [[d], items, pagos] = await Promise.all([get<Any[]>(`v_documentos?select=*&id=eq.${id}`), get<Any[]>(`documento_items?select=*&documento_id=eq.${id}&order=id`), get<Any[]>(`pagos?select=*&documento_id=eq.${id}&order=fecha`)]);
    if (!d) throw new Error('Documento no encontrado.');
    const isCot = d.tipo === 'cotizacion', vivo = d.estado !== 'anulada';
    const img = h('img', { class: 'g-docimg', alt: `Vista del documento ${d.numero}` }) as HTMLImageElement;
    let blob: Blob | null = null;
    const cli = d.cliente || {};
    const fields: [string, string][] = ([['Nombre', cli.nombre], ['Teléfono', cli.telefono], ['Cédula / NIT', cli.documento], ['Ciudad', cli.ciudad], ['Dirección', cli.direccion]] as [string, string][]).filter(([, v]) => v);
    renderQuote({
      title: `${TIPO[d.tipo]} ${d.numero}`,
      subtitle: `${d.lista === 'mayorista' ? 'Precios mayoristas' : 'Precios cliente final'}${d.estado === 'anulada' ? ' · ANULADA' : ''}`,
      date: new Date(d.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }),
      rows: items.map((i) => { const p = BY.get(i.slug); return { name: i.nombre, variant: '', qty: i.cantidad, unit: i.precio, total: i.total, img: p?.img || '', blend: !!p?.blend }; }),
      fields, sub: d.subtotal, total: d.total,
      lines: [['Subtotal', `${cop(d.subtotal)} COP`], ...(d.descuento ? [['Descuento', `−${cop(d.descuento)}`]] : []), ...(isCot ? [['Envío', 'Por confirmar']] : [['Abonado', cop(d.pagado)], ['Saldo', cop(d.saldo)]])] as [string, string][],
      note: isCot ? (d.vence ? `Cotización válida hasta el ${fd(d.vence)}. Precios sujetos a disponibilidad.` : 'Precios sujetos a disponibilidad. El envío se confirma por WhatsApp.')
        : 'Gracias por tu compra. Documento interno de venta, no es factura electrónica.',
    }).then((b) => { blob = b; img.src = URL.createObjectURL(b); }).catch(() => img.replaceWith(h('p', { class: 'g-muted', text: 'No se pudo generar la imagen.' })));

    const download = () => { if (!blob) return; const a = h('a', { href: URL.createObjectURL(blob), download: `${d.numero}-ubu.png` }) as HTMLAnchorElement; document.body.append(a); a.click(); a.remove(); };
    const wa = () => {
      download();
      const txt = `Hola ${cli.nombre || ''}, te compartimos tu ${TIPO[d.tipo].toLowerCase()} ${d.numero} de UBU Latinoamérica por ${cop(d.total)}${!isCot && d.saldo ? ` (saldo pendiente ${cop(d.saldo)})` : ''}. Adjuntamos la imagen.`;
      open(`https://wa.me/${waNum(cli.telefono)}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
    };
    const abono = h('div', { hidden: true, class: 'g-card', style: 'display:grid;gap:10px' });
    const anul = h('div', { hidden: true, class: 'g-card', style: 'display:grid;gap:10px' });
    if (!isCot && vivo && d.saldo > 0) {
      const v = h('input', { inputmode: 'numeric', value: d.saldo }) as HTMLInputElement, m = sel(METODOS.map((x) => [x, x]), 'efectivo') as HTMLSelectElement, n = h('input', { maxlength: 300 }) as HTMLInputElement;
      abono.append(h('div', { class: 'g-row3' }, field('Valor del abono', v), field('Método', m), field('Nota', n)),
        btn('Registrar abono', async () => {
          const x = parsePrice(v.value); if (!x || Number.isNaN(x)) { status('Escribe un valor válido.', 'bad'); return; }
          try { await rpc('registrar_pago', { doc: d.id, valor: x, metodo: m.value, nota: n.value || null }); status(`Abono de ${cop(x)} registrado en ${d.numero} ✓`, 'ok'); showDoc(d.id); refresh(); } catch (e) { fail(e); }
        }, 'g-btn--pri'));
    }
    if (vivo) {
      const mo = h('input', { maxlength: 300, placeholder: 'Ej.: error en precio, devolución del cliente…' }) as HTMLInputElement;
      anul.append(field('Motivo de la anulación', mo), h('p', { class: 'g-muted', text: isCot ? 'La cotización queda anulada.' : 'Se devuelve el stock de los productos. Los abonos quedan registrados como historial.' }),
        btn(`Anular ${d.numero}`, async () => {
          if (!mo.value.trim()) { status('Escribe el motivo.', 'bad'); return; }
          try { await rpc('anular_documento', { doc: d.id, motivo: mo.value }); status(`${d.numero} anulado ✓`, 'ok'); showDoc(d.id); refresh(); } catch (e) { fail(e); }
        }, 'g-btn--bad'));
    }
    openModal(`${TIPO[d.tipo]} ${d.numero}`,
      h('div', { class: 'g-actions' }, pill(d.estado), h('span', { class: 'g-muted', text: `${fdt(d.fecha)} · ${d.lista === 'mayorista' ? 'lista mayorista' : 'lista cliente final'}${d.vence ? ' · vence ' + fd(d.vence) : ''}` })),
      d.motivo_anulacion ? h('div', { class: 'g-banner g-banner--bad', text: `Anulada: ${d.motivo_anulacion}` }) : '',
      h('div', { class: 'g-actions' },
        btn('⬇ Descargar imagen', download), cli.telefono ? btn('WhatsApp', wa, 'g-btn--pri') : '',
        isCot && d.estado === 'vigente' ? btn('Convertir en venta', () => {
          const ed = blank('factura');
          Object.assign(ed, { lista: d.lista, cli: { nombre: '', telefono: '', documento: '', ciudad: '', direccion: '', ...cli }, tercero_id: d.tercero_id || '', descuento: d.descuento, origen_id: d.id,
            lines: items.map((i) => { const p = BY.get(i.slug); return { slug: i.slug, k: i.variante, name: p?.name || i.nombre, vl: i.variante ? p?.vars.find((v) => v.k === i.variante)?.l || i.variante : '', qty: i.cantidad, precio: i.precio }; }) });
          EDS.pos = ed; modal.close(); location.hash = 'pos'; if (location.hash === '#pos') route();
        }, 'g-btn--cyan') : '',
        !isCot && vivo && d.saldo > 0 ? btn('Abonar', () => { abono.hidden = !abono.hidden; }) : '',
        vivo ? btn('Anular', () => { anul.hidden = !anul.hidden; }, 'g-btn--bad') : ''),
      abono, anul,
      table(['Producto', 'Cant.', 'Precio', 'Subtotal'], items.map((i) => h('tr', {}, h('td', { text: i.nombre }), h('td', { class: 'n', text: i.cantidad }), h('td', { class: 'n', text: cop(i.precio) }), h('td', { class: 'n', text: cop(i.total) }))), [1, 2, 3]),
      h('div', { class: 'pos__tot' }, h('div', {}, h('span', { text: 'Subtotal' }), h('span', { text: cop(d.subtotal) })),
        d.descuento ? h('div', {}, h('span', { text: 'Descuento' }), h('span', { text: '−' + cop(d.descuento) })) : '',
        isCot ? '' : h('div', {}, h('span', { text: `Abonado · saldo ${cop(d.saldo)}` }), h('span', { text: cop(d.pagado) })),
        h('div', {}, h('span', { text: 'TOTAL' }), cop(d.total))),
      pagos.length ? table(['Fecha', 'Método', 'Nota', 'Valor'], pagos.map((p) => h('tr', {}, h('td', { text: fdt(p.fecha) }), h('td', { text: p.metodo }), h('td', { text: p.nota || '' }), h('td', { class: 'n', text: cop(p.valor) }))), [3]) : '',
      d.notas ? h('p', { class: 'g-muted', text: `Notas: ${d.notas}` }) : '',
      img);
  } catch (e) { fail(e); }
}
/** Vuelve a pintar la vista actual tras un cambio hecho desde el modal. */
const refresh = () => { const id = location.hash.slice(1) || 'dashboard'; if (id !== 'pos' && id !== 'cotizar') VIEWS[id]?.($(`v-${id}`)).catch(fail); };

/* ================= FACTURAS Y ANULACIONES ================= */
const docFilter = { tipo: '', estado: '', q: '', desde: '' };
VIEWS.documentos = async (root: HTMLElement) => {
  const list = h('div', {});
  const load = async () => {
    list.replaceChildren(h('p', { class: 'g-muted', text: 'Cargando…' }));
    let path = 'v_documentos?select=*&order=fecha.desc&limit=300';
    if (docFilter.tipo) path += `&tipo=eq.${docFilter.tipo}`;
    if (docFilter.estado) path += `&estado=eq.${docFilter.estado}`;
    if (docFilter.desde) path += `&fecha=gte.${new Date(docFilter.desde + 'T00:00:00').toISOString()}`;
    const t = docFilter.q.trim().toLowerCase();
    const docs = (await get<Any[]>(path)).filter((d) => !t || `${d.numero} ${d.cliente?.nombre || ''} ${d.cliente?.telefono || ''}`.toLowerCase().includes(t));
    const vivos = docs.filter((d) => d.estado !== 'anulada' && d.tipo !== 'cotizacion');
    list.replaceChildren(h('p', { class: 'g-muted', text: `${docs.length} documento(s) · ventas ${cop(vivos.reduce((a, d) => a + d.total, 0))} · anulados ${docs.filter((d) => d.estado === 'anulada').length}` }), docTable(docs));
  };
  const f = (k: keyof typeof docFilter) => (e: Event) => { docFilter[k] = (e.target as HTMLInputElement).value; load().catch(fail); };
  root.replaceChildren(h('div', { class: 'g-card' },
    h('div', { class: 'g-filters' },
      field('Buscar', h('input', { type: 'search', value: docFilter.q, placeholder: 'Número, cliente o teléfono', oninput: f('q') })),
      field('Tipo', sel([['', 'Todos'], ['factura', 'Facturas'], ['remision', 'Remisiones'], ['cotizacion', 'Cotizaciones']], docFilter.tipo, { onchange: f('tipo') })),
      field('Estado', sel([['', 'Todos'], ['pagada', 'Pagada'], ['parcial', 'Parcial'], ['pendiente', 'Pendiente'], ['vigente', 'Vigente'], ['convertida', 'Convertida'], ['anulada', 'Anulada']], docFilter.estado, { onchange: f('estado') })),
      field('Desde', h('input', { type: 'date', value: docFilter.desde, onchange: f('desde') }))),
    list));
  await load();
};

/* ================= INVENTARIO ================= */
const invFilter = { q: '', cat: '', low: false };
VIEWS.inventario = async (root: HTMLElement) => {
  await loadRef();
  const body = h('div', {});
  const draw = () => {
    const t = invFilter.q.trim().toLowerCase();
    const rows = PRODS.flatMap((p) => p.vars.map((v) => ({ p, v, inv: INV.get(priceKey(p.slug, v.k)) || { stock: 0, costo: 0, minimo: 0 } })))
      .filter(({ p, v, inv }) => (!invFilter.cat || p.cat === invFilter.cat) && (!t || `${p.name} ${v.k}`.toLowerCase().includes(t)) && (!invFilter.low || (inv.minimo > 0 && inv.stock <= inv.minimo)));
    const unidades = rows.reduce((a, r) => a + Math.max(r.inv.stock, 0), 0), valor = rows.reduce((a, r) => a + Math.max(r.inv.stock, 0) * r.inv.costo, 0);
    body.replaceChildren(
      h('div', { class: 'g-kpis' },
        h('div', { class: 'g-kpi' }, h('span', { text: 'Referencias' }), h('b', { text: rows.length })),
        h('div', { class: 'g-kpi' }, h('span', { text: 'Unidades en stock' }), h('b', { text: unidades })),
        h('div', { class: 'g-kpi' }, h('span', { text: 'Valor al costo' }), h('b', { text: cop(valor) })),
        h('div', { class: 'g-kpi' }, h('span', { text: 'Bajo mínimo' }), h('b', { text: lowStock().length }))),
      h('div', { class: 'g-card' }, table(['Producto', 'Stock', 'Mínimo', 'Costo', 'Cliente final', 'Mayorista', 'Margen', ''],
        rows.map(({ p, v, inv }) => {
          const pub = priceOf(p.slug, v.k, 'publico'), may = priceOf(p.slug, v.k, 'mayorista');
          const low = inv.minimo > 0 && inv.stock <= inv.minimo;
          return h('tr', {},
            h('td', {}, h('b', { text: p.name }), v.k ? h('div', { class: 'g-muted', text: v.l }) : ''),
            h('td', { class: 'n' }, h('span', { class: `g-pill ${inv.stock < 0 || low ? 'g-pill--bad' : inv.stock ? 'g-pill--ok' : ''}`, text: inv.stock })),
            h('td', { class: 'n', text: inv.minimo }), h('td', { class: 'n', text: inv.costo ? cop(inv.costo) : '—' }),
            h('td', { class: 'n', text: cop(pub) }), h('td', { class: 'n', text: cop(may) }),
            h('td', { class: 'n', text: inv.costo && may ? `${Math.round((1 - inv.costo / may) * 100)}%` : '—' }),
            h('td', {}, h('div', { class: 'g-actions' }, btn('Entrada', () => invModal(p, v, inv, 'entrada', draw), 'g-btn--sm'), btn('Ajuste', () => invModal(p, v, inv, 'ajuste', draw), 'g-btn--sm'), btn('Kardex', () => kardex(p, v), 'g-btn--sm'))));
        }), [1, 2, 3, 4, 5, 6])));
  };
  const f = (k: 'q' | 'cat') => (e: Event) => { invFilter[k] = (e.target as HTMLInputElement).value; draw(); };
  root.replaceChildren(h('div', { class: 'g-card' }, h('div', { class: 'g-filters' },
    field('Buscar', h('input', { type: 'search', value: invFilter.q, placeholder: 'Producto o modelo', oninput: f('q') })),
    field('Categoría', sel([['', 'Todas'], ['conectividad', 'Conectividad'], ['hidrogel', 'Hidrogel']], invFilter.cat, { onchange: f('cat') })),
    h('label', { class: 'ap__vis' }, h('input', { type: 'checkbox', checked: invFilter.low, onchange: (e: Event) => { invFilter.low = (e.target as HTMLInputElement).checked; draw(); } }), 'Solo bajo mínimo')),
    h('p', { class: 'g-muted', text: 'Los precios se editan en «Catálogo y precios». Las ventas descuentan stock y las anulaciones lo devuelven automáticamente.' })), body);
  draw();
};

function invModal(p: Prod, v: Var, inv: Any, tipo: 'entrada' | 'ajuste', after: () => void) {
  const cant = h('input', { type: 'number', value: tipo === 'ajuste' ? inv.stock : '', min: tipo === 'entrada' ? 1 : null }) as HTMLInputElement;
  const costo = h('input', { inputmode: 'numeric', value: inv.costo || '' }) as HTMLInputElement, min = h('input', { type: 'number', min: 0, value: inv.minimo }) as HTMLInputElement;
  const nota = h('input', { maxlength: 300, placeholder: tipo === 'entrada' ? 'Proveedor, factura de compra…' : 'Motivo del ajuste (conteo físico, daño…)' }) as HTMLInputElement;
  openModal(`${tipo === 'entrada' ? 'Entrada de mercancía' : 'Ajuste de inventario'} · ${p.name}${v.k ? ' · ' + v.k : ''}`,
    h('p', { class: 'g-muted', text: `Stock actual: ${inv.stock}` }),
    h('div', { class: 'g-row' }, field(tipo === 'entrada' ? 'Unidades que entran' : 'Stock real contado', cant), field('Costo unitario', costo)),
    h('div', { class: 'g-row' }, field('Stock mínimo (alerta)', min), field('Nota', nota)),
    btn('Guardar', async () => {
      const n = Math.floor(+cant.value), c = parsePrice(costo.value), m = Math.floor(+min.value || 0);
      if (!Number.isFinite(n) || (tipo === 'entrada' && n <= 0) || (tipo === 'ajuste' && n < 0)) { status('Revisa la cantidad.', 'bad'); return; }
      if (Number.isNaN(c)) { status('Costo inválido.', 'bad'); return; }
      if (tipo === 'ajuste' && n !== inv.stock && !nota.value.trim()) { status('Escribe el motivo del ajuste.', 'bad'); return; }
      try {
        await rpc('ajustar_inventario', { s: p.slug, v: v.k, cantidad: tipo === 'entrada' ? n : n - inv.stock, tipo, nota: nota.value || null, nuevo_costo: c, nuevo_minimo: m });
        modal.close(); status('Inventario actualizado ✓', 'ok'); await loadRef(); after();
      } catch (e) { fail(e); }
    }, 'g-btn--pri'));
}
async function kardex(p: Prod, v: Var) {
  try {
    const k = await get<Any[]>(`kardex?select=*&slug=eq.${encodeURIComponent(p.slug)}&variante=eq.${encodeURIComponent(v.k)}&order=id.desc&limit=100`);
    openModal(`Kardex · ${p.name}${v.k ? ' · ' + v.k : ''}`, table(['Fecha', 'Movimiento', 'Ref.', 'Cantidad', 'Saldo'],
      k.map((r) => h('tr', {}, h('td', { text: fdt(r.fecha) }), h('td', { text: r.tipo + (r.nota ? ` · ${r.nota}` : '') }), h('td', { text: r.ref || '' }), h('td', { class: 'n', text: r.cantidad > 0 ? `+${r.cantidad}` : r.cantidad }), h('td', { class: 'n', text: r.saldo }))), [3, 4]));
  } catch (e) { fail(e); }
}

/* ================= CATÁLOGO Y PRECIOS (editor existente) ================= */
let preciosLoaded = false;
VIEWS.precios = async () => { if (!preciosLoaded) { preciosLoaded = true; await loadPrecios(); } };

/* ================= CLIENTES Y TERCEROS ================= */
const terFilter = { q: '', tipo: '' };
VIEWS.terceros = async (root: HTMLElement) => {
  const [ters, docs] = await Promise.all([get<Any[]>('terceros?select=*&order=nombre&limit=2000'), get<Any[]>('v_documentos?select=tercero_id,saldo,total,tipo,estado&tercero_id=not.is.null')]);
  TERCEROS = ters;
  const body = h('div', {});
  const draw = () => {
    const t = terFilter.q.trim().toLowerCase();
    const rows = ters.filter((x) => (!terFilter.tipo || x.tipo === terFilter.tipo) && (!t || `${x.nombre} ${x.telefono || ''} ${x.documento || ''} ${x.ciudad || ''}`.toLowerCase().includes(t)));
    body.replaceChildren(table(['Nombre', 'Tipo', 'Teléfono', 'Ciudad', 'Compras', 'Saldo', ''], rows.map((x) => {
      const mine = docs.filter((d) => d.tercero_id === x.id && d.estado !== 'anulada' && d.tipo !== 'cotizacion');
      const saldo = mine.reduce((a, d) => a + d.saldo, 0);
      return h('tr', {},
        h('td', {}, h('b', { text: x.nombre }), x.documento ? h('div', { class: 'g-muted', text: x.documento }) : ''),
        h('td', {}, h('span', { class: `g-pill ${x.tipo === 'mayorista' ? 'g-pill--info' : ''}`, text: x.tipo })),
        h('td', { text: x.telefono || '' }), h('td', { text: x.ciudad || '' }),
        h('td', { class: 'n', text: cop(mine.reduce((a, d) => a + d.total, 0)) }),
        h('td', { class: 'n' }, saldo ? h('span', { class: 'g-pill g-pill--warn', text: cop(saldo) }) : '—'),
        h('td', {}, h('div', { class: 'g-actions' },
          btn('Vender', () => { const ed = blank('factura'); Object.assign(ed, { tercero_id: x.id, lista: x.tipo === 'mayorista' ? 'mayorista' : 'publico', cli: { nombre: x.nombre, telefono: x.telefono || '', documento: x.documento || '', ciudad: x.ciudad || '', direccion: x.direccion || '' } }); EDS.pos = ed; location.hash = 'pos'; }, 'g-btn--sm'),
          btn('Documentos', () => terDocs(x), 'g-btn--sm'), btn('Editar', () => terModal(x, () => VIEWS.terceros(root)), 'g-btn--sm'),
          x.telefono ? h('a', { class: 'g-btn g-btn--sm', href: `https://wa.me/${waNum(x.telefono)}`, target: '_blank', rel: 'noopener', text: 'WhatsApp' }) : '')));
    }), [4, 5]));
  };
  const f = (k: 'q' | 'tipo') => (e: Event) => { terFilter[k] = (e.target as HTMLInputElement).value; draw(); };
  root.replaceChildren(h('div', { class: 'g-card' },
    h('div', { class: 'g-filters' },
      field('Buscar', h('input', { type: 'search', value: terFilter.q, placeholder: 'Nombre, teléfono, NIT o ciudad', oninput: f('q') })),
      field('Tipo', sel([['', 'Todos'], ['cliente', 'Clientes'], ['mayorista', 'Mayoristas'], ['proveedor', 'Proveedores']], terFilter.tipo, { onchange: f('tipo') })),
      btn('+ Nuevo tercero', () => terModal(null, () => VIEWS.terceros(root)), 'g-btn--pri')),
    h('p', { class: 'g-muted', text: `${ters.length} tercero(s). Los mayoristas reciben la lista mayorista automáticamente en el punto de venta.` }), body));
  draw();
};
function terModal(x: Any | null, after: () => void) {
  const v: Any = { tipo: 'cliente', nombre: '', documento: '', telefono: '', email: '', ciudad: '', direccion: '', notas: '', ...(x || {}) };
  const inp = (k: string, label: string, props: Any = {}) => field(label, h(k === 'notas' ? 'textarea' : 'input', { value: v[k] || '', ...props, oninput: (e: Event) => (v[k] = (e.target as HTMLInputElement).value) }));
  openModal(x ? `Editar · ${x.nombre}` : 'Nuevo tercero',
    h('div', { class: 'g-row' }, field('Tipo', sel([['cliente', 'Cliente'], ['mayorista', 'Mayorista'], ['proveedor', 'Proveedor']], v.tipo, { onchange: (e: Event) => (v.tipo = (e.target as HTMLSelectElement).value) })), inp('nombre', 'Nombre o razón social', { maxlength: 120, required: true })),
    h('div', { class: 'g-row' }, inp('documento', 'Cédula / NIT', { maxlength: 30 }), inp('telefono', 'Teléfono / WhatsApp', { maxlength: 30, inputmode: 'tel' })),
    h('div', { class: 'g-row' }, inp('email', 'Correo', { maxlength: 120, type: 'email' }), inp('ciudad', 'Ciudad', { maxlength: 80 })),
    inp('direccion', 'Dirección', { maxlength: 160 }), inp('notas', 'Notas', { maxlength: 600 }),
    h('div', { class: 'g-actions' },
      btn('Guardar', async () => {
        if (!v.nombre.trim()) { status('El nombre es obligatorio.', 'bad'); return; }
        const row = Object.fromEntries(['tipo', 'nombre', 'documento', 'telefono', 'email', 'ciudad', 'direccion', 'notas'].map((k) => [k, String(v[k] || '').trim() || null]));
        try { if (x) await patch('terceros', `id=eq.${x.id}`, row); else await insert('terceros', row); modal.close(); status('Tercero guardado ✓', 'ok'); after(); } catch (e) { fail(e); }
      }, 'g-btn--pri'),
      x ? btn('Eliminar', async () => {
        if (!confirm(`¿Eliminar a ${x.nombre}? Sus documentos se conservan con los datos del cliente.`)) return;
        try { await del('terceros', `id=eq.${x.id}`); modal.close(); status('Tercero eliminado.', 'ok'); after(); } catch (e) { fail(e); }
      }, 'g-btn--bad') : ''));
}
async function terDocs(x: Any) {
  try { openModal(`Documentos · ${x.nombre}`, docTable(await get<Any[]>(`v_documentos?select=*&tercero_id=eq.${x.id}&order=fecha.desc&limit=200`))); } catch (e) { fail(e); }
}

/* ================= CUENTAS POR COBRAR / COBROS PENDIENTES ================= */
let carTab = 'todas';
VIEWS.cartera = async (root: HTMLElement) => {
  const docs = await get<Any[]>('v_documentos?select=*&saldo=gt.0&order=fecha.asc');
  const hoy = isoDate(), venc = docs.filter((d) => d.vence && d.vence < hoy);
  badge('cartera', venc.length, true);
  const rows = carTab === 'vencidas' ? venc : docs;
  const recordar = (d: Any) => {
    const txt = `Hola ${d.cliente?.nombre || ''}, te saludamos de UBU Latinoamérica. Te recordamos el saldo pendiente de ${cop(d.saldo)} de tu ${TIPO[d.tipo].toLowerCase()} ${d.numero}${d.vence ? `, con vencimiento el ${fd(d.vence)}` : ''}. ¡Gracias!`;
    open(`https://wa.me/${waNum(d.cliente?.telefono)}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
  };
  root.replaceChildren(
    h('div', { class: 'g-kpis' },
      h('div', { class: 'g-kpi g-kpi--hero' }, h('span', { text: 'Total por cobrar' }), h('b', { text: cop(docs.reduce((a, d) => a + d.saldo, 0)) }), h('small', { text: `${docs.length} documento(s)` })),
      h('div', { class: 'g-kpi' }, h('span', { text: 'Vencido' }), h('b', { text: cop(venc.reduce((a, d) => a + d.saldo, 0)) }), h('small', { text: `${venc.length} documento(s)` }))),
    h('div', { class: 'g-card' },
      h('div', { class: 'pos__seg', role: 'group', 'aria-label': 'Filtro', style: 'margin-bottom:12px' },
        [['todas', 'Todas'], ['vencidas', `Cobros vencidos (${venc.length})`]].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(carTab === v), text: l, onclick: () => { carTab = v; VIEWS.cartera(root).catch(fail); } }))),
      table(['Documento', 'Cliente', 'Fecha', 'Vence', 'Total', 'Abonado', 'Saldo', ''], rows.map((d) => h('tr', {},
        h('td', {}, h('b', { text: d.numero })), h('td', { text: d.cliente?.nombre || '' }), h('td', { text: fd(d.fecha) }),
        h('td', {}, d.vence ? h('span', { class: `g-pill ${d.vence < hoy ? 'g-pill--bad' : ''}`, text: fd(d.vence) }) : '—'),
        h('td', { class: 'n', text: cop(d.total) }), h('td', { class: 'n', text: cop(d.pagado) }), h('td', { class: 'n' }, h('b', { text: cop(d.saldo) })),
        h('td', {}, h('div', { class: 'g-actions' }, btn('Abonar', () => showDoc(d.id), 'g-btn--sm g-btn--pri'), d.cliente?.telefono ? btn('Recordar', () => recordar(d), 'g-btn--sm') : '')))), [4, 5, 6])));
};

/* ================= GASTOS ================= */
let gMes = isoDate().slice(0, 7);
const CATS_G = ['Arriendo', 'Servicios públicos', 'Nómina', 'Transporte y envíos', 'Publicidad', 'Compras de insumos', 'Impuestos', 'Mantenimiento', 'Caja menor', 'Otros'];
VIEWS.gastos = async (root: HTMLElement) => {
  const [y, m] = gMes.split('-').map(Number), fin = isoDate(new Date(y, m, 1));
  const gs = await get<Any[]>(`gastos?select=*&fecha=gte.${gMes}-01&fecha=lt.${fin}&order=fecha.desc,id.desc`);
  const v: Any = { fecha: isoDate(), categoria: 'Caja menor', descripcion: '', valor: '', metodo: 'efectivo' };
  const inp = (k: string, props: Any = {}) => h('input', { value: v[k], ...props, oninput: (e: Event) => (v[k] = (e.target as HTMLInputElement).value) });
  const porCat = CATS_G.map((c) => [c, gs.filter((g) => g.categoria === c).reduce((a, g) => a + g.valor, 0)] as [string, number]).filter((x) => x[1]);
  root.replaceChildren(
    h('div', { class: 'g-card' }, h('h2', { text: 'Registrar gasto' }),
      h('div', { class: 'g-filters' },
        field('Fecha', inp('fecha', { type: 'date' })), field('Categoría', h('input', { value: v.categoria, list: 'dl-gastos', maxlength: 60, oninput: (e: Event) => (v.categoria = (e.target as HTMLInputElement).value) })),
        h('datalist', { id: 'dl-gastos' }, CATS_G.map((c) => h('option', { value: c }))),
        field('Descripción', inp('descripcion', { maxlength: 300 })), field('Valor', inp('valor', { inputmode: 'numeric' })),
        field('Método', sel(METODOS.map((x) => [x, x]), v.metodo, { onchange: (e: Event) => (v.metodo = (e.target as HTMLSelectElement).value) })),
        btn('Guardar gasto', async () => {
          const val = parsePrice(v.valor);
          if (!val || Number.isNaN(val) || !v.categoria.trim() || !v.fecha) { status('Completa fecha, categoría y un valor mayor a 0.', 'bad'); return; }
          try { await insert('gastos', { fecha: v.fecha, categoria: v.categoria.trim(), descripcion: v.descripcion.trim() || null, valor: val, metodo: v.metodo }); status(`Gasto de ${cop(val)} registrado ✓`, 'ok'); VIEWS.gastos(root); } catch (e) { fail(e); }
        }, 'g-btn--pri'))),
    h('div', { class: 'g-grid2' },
      h('div', { class: 'g-card' }, h('h2', {}, 'Resumen del mes', h('input', { type: 'month', class: 'g-in', style: 'width:auto', value: gMes, 'aria-label': 'Mes', onchange: (e: Event) => { gMes = (e.target as HTMLInputElement).value || gMes; VIEWS.gastos(root).catch(fail); } })),
        h('div', { class: 'g-kpi g-kpi--hero', style: 'margin-bottom:12px' }, h('span', { text: 'Total del mes' }), h('b', { text: cop(gs.reduce((a, g) => a + g.valor, 0)) })),
        table(['Categoría', 'Total'], porCat.map(([c, t]) => h('tr', {}, h('td', { text: c }), h('td', { class: 'n', text: cop(t) }))), [1])),
      h('div', { class: 'g-card' }, h('h2', { text: 'Detalle' }), table(['Fecha', 'Categoría', 'Descripción', 'Método', 'Valor', ''], gs.map((g) => h('tr', {},
        h('td', { text: fd(g.fecha) }), h('td', { text: g.categoria }), h('td', { text: g.descripcion || '' }), h('td', { text: g.metodo }), h('td', { class: 'n', text: cop(g.valor) }),
        h('td', {}, btn('✕', async () => { if (!confirm('¿Eliminar este gasto?')) return; try { await del('gastos', `id=eq.${g.id}`); VIEWS.gastos(root); } catch (e) { fail(e); } }, 'g-btn--sm g-btn--bad')))), [4]))));
};

/* ================= ingreso / salida ================= */
function showLogin(msg = '') { $('g-app').hidden = true; $('g-login').hidden = !sbOn; $('a-err').textContent = msg; }
function showApp() { $('g-login').hidden = true; $('g-app').hidden = false; preciosLoaded = false; route(); }
addEventListener('ubu:session-lost', () => showLogin('Tu sesión venció. Ingresa de nuevo.'));
$<HTMLFormElement>('a-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const go = $<HTMLButtonElement>('a-go'), user = $<HTMLInputElement>('a-user').value.trim(), pass = $<HTMLInputElement>('a-pass');
  if (!user || !pass.value) { $('a-err').textContent = 'Escribe tu usuario y tu contraseña.'; return; }
  go.disabled = true; go.textContent = 'Ingresando…'; $('a-err').textContent = '';
  try { await signIn('admin', user, pass.value); pass.value = ''; showApp(); }
  catch (x) { $('a-err').textContent = (x as Error).message; pass.value = ''; }
  finally { go.disabled = false; go.textContent = 'Ingresar'; }
});
$('a-out').addEventListener('click', () => {
  if (preciosDirty.size && !confirm('Hay precios sin guardar. ¿Cerrar sesión de todos modos?')) return;
  preciosDirty.clear(); endSession('admin'); showLogin();
});
addEventListener('beforeunload', (e) => { if (preciosDirty.size) e.preventDefault(); });

// getSession devuelve null si el token venció aunque haya refresh token: en ese caso se intenta renovar al cargar.
const hasSession = () => { try { return !!(getSession('admin') || sessionStorage.getItem('ubu_admin')); } catch { return false; } };
if (sbOn && hasSession()) showApp(); else showLogin();
