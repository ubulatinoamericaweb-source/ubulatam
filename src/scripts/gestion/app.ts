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
const cop = (n: number | null | undefined) => n == null ? '—' : (n < 0 ? '−$' : '$') + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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
const table = (head: string[], rows: HTMLElement[], numCols: number[] = []) => (rows.forEach((r) => [...r.children].forEach((td, i) => head[i] && td.setAttribute('data-l', head[i]))), h('div', { class: 'g-tablewrap' },
  h('table', { class: 'g-table' }, h('thead', {}, h('tr', {}, head.map((t, i) => h('th', { class: numCols.includes(i) ? 'n' : null, text: t })))),
    h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: head.length, class: 'g-empty', text: 'Sin registros.' }))))));

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
  const [, hoy, pagos, cartera, ult, gastos, cots, caja] = await Promise.all([
    loadRef(),
    get<Any[]>(`v_documentos?select=id,tipo,total,estado&fecha=gte.${today}&tipo=neq.cotizacion&estado=neq.anulada`),
    get<Any[]>(`pagos?select=valor,metodo,documentos!inner(estado)&fecha=gte.${today}&documentos.estado=neq.anulada`),
    get<Any[]>('v_documentos?select=id,saldo,vence&saldo=gt.0'),
    get<Any[]>('v_documentos?select=id,numero,tipo,cliente,fecha,total,estado&order=fecha.desc&limit=10'),
    get<Any[]>(`gastos?select=valor,fecha&fecha=gte.${month}`),
    get<Any[]>('documentos?select=id&tipo=eq.cotizacion&estado=eq.vigente'),
    get<Any[]>('cajas?select=id,abierta_en,base&cerrada_en=is.null').catch(() => []),
  ]);
  const ids = hoy.map((d) => d.id);
  const items = ids.length ? await get<Any[]>(`documento_items?select=cantidad,costo,total,documento_id&documento_id=in.(${ids.join(',')})`) : [];
  const ventas = hoy.reduce((a, d) => a + d.total, 0), recaudo = pagos.reduce((a, p) => a + p.valor, 0);
  const costo = items.reduce((a, i) => a + i.costo * i.cantidad, 0);
  const vencidas = cartera.filter((d) => d.vence && d.vence < isoDate());
  const low = lowStock(), gMes = gastos.reduce((a, g) => a + g.valor, 0), gHoy = gastos.filter((g) => g.fecha === isoDate()).reduce((a, g) => a + g.valor, 0);
  badge('inventario', low.length, true); badge('cartera', vencidas.length, true); badge('cotizar', cots.length);

  badge('caja', caja.length ? 0 : 1);
  root.replaceChildren(
    caja.length ? h('div', { class: 'g-banner', style: 'background:#E4F7F9;color:#0B6E78' }, `🔓 Caja abierta desde ${fdt(caja[0].abierta_en)} · base ${cop(caja[0].base)}`, h('a', { class: 'g-btn g-btn--sm', href: '#caja', text: 'Informe X / cerrar' }))
      : h('div', { class: 'g-banner g-banner--warn' }, '🔒 La caja está cerrada. Ábrela para llevar el cuadre de efectivo del día.', h('a', { class: 'g-btn g-btn--sm', href: '#caja', text: 'Abrir caja' })),
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
        h('a', { href: '#terceros' }, '👥 Nuevo cliente', h('small', { text: 'clientes y mayoristas' })),
        h('a', { href: '#compras' }, '🛍️ Registrar compra', h('small', { text: 'proveedores y costos' })),
        h('a', { href: '#garantias' }, '🛡️ Garantía', h('small', { text: '365 días' })))),
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

/* ================= FASE 2: caja, compras, garantías, campañas, reportes y estados financieros ================= */
Object.assign(TITLES, { caja: 'Caja', compras: 'Compras y proveedores', garantias: 'Garantías', campanas: 'Campañas WhatsApp', reportes: 'Reportes', financieros: 'Estados financieros' });
const sum = (a: Any[], f: (x: Any) => number) => a.reduce((t, x) => t + (f(x) || 0), 0);
const groupSum = (a: Any[], key: (x: Any) => string, val: (x: Any) => number) => {
  const m = new Map<string, number>(); a.forEach((x) => m.set(key(x), (m.get(key(x)) || 0) + (val(x) || 0)));
  return [...m.entries()].sort((x, y) => y[1] - x[1]);
};
const bars = (rows: [string, number][], fmt = cop) => {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return rows.length ? h('div', { class: 'g-bars' }, rows.map(([k, v]) => h('div', { class: 'g-bar' }, h('span', { text: k }), h('i', { style: `width:${(v / max) * 100}%` }), h('span', { text: fmt(v) }))))
    : h('p', { class: 'g-muted', text: 'Sin datos en el periodo.' });
};
const kpi = (label: string, value: string, small = '', cls = '') => h('div', { class: `g-kpi ${cls}` }, h('span', { text: label }), h('b', { text: value, style: value.length > 14 ? 'font-size:1.1rem' : null }), small ? h('small', { text: small }) : '');
const prodOptions = () => PRODS.flatMap((p) => p.vars.map((v) => ({ label: v.k ? `${p.name} · ${v.k}` : p.name, p, v })));
const PROD_OPTS = prodOptions();
const prodPicker = (id: string, onPick: (p: Prod, v: Var) => void, placeholder = 'Buscar producto…') => {
  const i = h('input', { class: 'g-in', list: id, placeholder, 'aria-label': placeholder }) as HTMLInputElement;
  i.addEventListener('change', () => { const o = PROD_OPTS.find((x) => x.label === i.value); if (o) { onPick(o.p, o.v); i.value = ''; } });
  return [i, h('datalist', { id }, PROD_OPTS.map((o) => h('option', { value: o.label })))];
};
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const rangeFields = (r: { desde: string; hasta: string }, reload: () => void) => [
  field('Desde', h('input', { type: 'date', value: r.desde, onchange: (e: Event) => { r.desde = (e.target as HTMLInputElement).value || r.desde; reload(); } })),
  field('Hasta', h('input', { type: 'date', value: r.hasta, onchange: (e: Event) => { r.hasta = (e.target as HTMLInputElement).value || r.hasta; reload(); } })),
];
const isoStart = (d: string) => new Date(d + 'T00:00:00').toISOString();
const isoEnd = (d: string) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + 1); return x.toISOString(); };

/* ---------- CAJA ---------- */
VIEWS.caja = async (root: HTMLElement) => {
  const cajas = await get<Any[]>('cajas?select=*&order=id.desc&limit=30');
  const open = cajas.find((c) => !c.cerrada_en);
  const hist = table(['Apertura', 'Cierre', 'Base', 'Esperado', 'Contado', 'Diferencia'], cajas.filter((c) => c.cerrada_en).map((c) => h('tr', { 'data-open': '', onclick: () => informeZ(c) },
    h('td', { text: fdt(c.abierta_en) }), h('td', { text: fdt(c.cerrada_en) }), h('td', { class: 'n', text: cop(c.base) }), h('td', { class: 'n', text: cop(c.esperado) }), h('td', { class: 'n', text: cop(c.contado) }),
    h('td', { class: 'n' }, h('span', { class: `g-pill ${c.diferencia === 0 ? 'g-pill--ok' : 'g-pill--bad'}`, text: (c.diferencia > 0 ? '+' : '') + cop(c.diferencia) })))), [2, 3, 4, 5]);
  if (!open) {
    const base = h('input', { inputmode: 'numeric', placeholder: 'Ej.: 200000' }) as HTMLInputElement;
    root.replaceChildren(h('div', { class: 'g-card' }, h('h2', { text: '🔓 Abrir caja' }), h('p', { class: 'g-muted', text: 'Registra el efectivo con el que empiezas el día. Al cerrar, el sistema calcula cuánto debería haber.' }),
      h('div', { class: 'g-filters' }, field('Base en efectivo', base), btn('Abrir caja', async () => {
        const v = parsePrice(base.value); if (v == null || Number.isNaN(v)) { status('Escribe la base (puede ser 0).', 'bad'); return; }
        try { await rpc('abrir_caja', { base: v }); status(`Caja abierta con base ${cop(v)} ✓`, 'ok'); VIEWS.caja(root); } catch (e) { fail(e); }
      }, 'g-btn--pri'))), h('div', { class: 'g-card' }, h('h2', { text: 'Cierres anteriores' }), hist));
    return;
  }
  const since = open.abierta_en;
  const [pagos, gastos, prov] = await Promise.all([
    get<Any[]>(`pagos?select=valor,metodo,documentos!inner(estado,numero)&fecha=gte.${since}&documentos.estado=neq.anulada`),
    get<Any[]>(`gastos?select=valor,metodo&fecha=gte.${isoDate(new Date(since))}`),
    get<Any[]>(`pagos_compras?select=valor,metodo&fecha=gte.${since}`),
  ]);
  const ef = (a: Any[]) => sum(a.filter((x) => x.metodo === 'efectivo'), (x) => x.valor);
  const esperado = open.base + ef(pagos) - ef(gastos) - ef(prov);
  const contado = h('input', { inputmode: 'numeric', placeholder: cop(esperado) }) as HTMLInputElement, notas = h('input', { maxlength: 600 }) as HTMLInputElement;
  const dif = h('b', { text: '' });
  contado.addEventListener('input', () => { const v = parsePrice(contado.value); dif.textContent = v == null || Number.isNaN(v) ? '' : `Diferencia: ${v - esperado > 0 ? '+' : ''}${cop(v - esperado)}`; });
  root.replaceChildren(
    h('div', { class: 'g-kpis' },
      kpi('Caja abierta desde', fdt(since), `base ${cop(open.base)}`, 'g-kpi--hero'),
      kpi('Cobros en efectivo', cop(ef(pagos))), kpi('Gastos en efectivo', cop(ef(gastos))), kpi('Pagos a proveedores', cop(ef(prov))),
      kpi('Efectivo esperado', cop(esperado), 'Informe X: parcial, no cierra', 'g-kpi--ok')),
    h('div', { class: 'g-grid2' },
      h('div', { class: 'g-card' }, h('h2', { text: 'Cobros por método (desde la apertura)' }), bars(groupSum(pagos, (x) => x.metodo, (x) => x.valor))),
      h('div', { class: 'g-card', style: 'display:grid;gap:12px' }, h('h2', { text: '🔒 Cerrar caja (Informe Z)' }),
        h('div', { class: 'g-row' }, field('Efectivo contado', contado), field('Notas', notas)), dif,
        btn('Cerrar caja', async () => {
          const v = parsePrice(contado.value); if (v == null || Number.isNaN(v)) { status('Escribe el efectivo contado.', 'bad'); return; }
          if (!confirm(`¿Cerrar la caja con ${cop(v)} contados?`)) return;
          try { await rpc('cerrar_caja', { contado: v, notas: notas.value || null }); status('Caja cerrada ✓', 'ok'); const [c] = await get<Any[]>(`cajas?select=*&id=eq.${open.id}`); await VIEWS.caja(root); informeZ(c); } catch (e) { fail(e); }
        }, 'g-btn--pri'))),
    h('div', { class: 'g-card' }, h('h2', { text: 'Cierres anteriores' }), hist));
};
function informeZ(c: Any) {
  const r = c.resumen || {};
  openModal(`Informe Z · ${fd(c.cerrada_en)}`,
    h('table', { class: 'g-fin' }, h('tbody', {},
      [['Apertura', fdt(c.abierta_en)], ['Cierre', fdt(c.cerrada_en)], ['Base', cop(c.base)], ['+ Cobros en efectivo', cop(r.cobros_efectivo)], ['− Gastos en efectivo', cop(r.gastos_efectivo)], ['− Pagos a proveedores en efectivo', cop(r.pagos_proveedores_efectivo)]]
        .map(([k, v]) => h('tr', {}, h('td', { text: k }), h('td', { text: v }))),
      h('tr', { class: 'tot' }, h('td', { text: 'Efectivo esperado' }), h('td', { text: cop(c.esperado) })),
      h('tr', {}, h('td', { text: 'Efectivo contado' }), h('td', { text: cop(c.contado) })),
      h('tr', { class: c.diferencia < 0 ? 'neg' : 'pos' }, h('td', { text: c.diferencia < 0 ? 'Faltante' : c.diferencia > 0 ? 'Sobrante' : 'Cuadre exacto' }), h('td', { text: cop(c.diferencia) })),
      Object.entries(r.por_metodo || {}).map(([m, v]) => h('tr', { class: 'sub' }, h('td', { text: `Cobrado por ${m}` }), h('td', { text: cop(v as number) }))))),
    c.notas ? h('p', { class: 'g-muted', text: `Notas: ${c.notas}` }) : '',
    h('div', { class: 'g-actions g-noprint' }, btn('Imprimir', () => print())));
}

/* ---------- COMPRAS Y PROVEEDORES ---------- */
interface CLine { slug: string; k: string; nombre: string; cantidad: number; costo: number }
let compra = { proveedor: '', proveedor_id: '', factura_prov: '', vence: '', notas: '', pago: '', metodo: 'efectivo', lines: [] as CLine[] };
VIEWS.compras = async (root: HTMLElement) => {
  const [provs, list] = await Promise.all([get<Any[]>('terceros?select=id,nombre,telefono&tipo=eq.proveedor&order=nombre'), get<Any[]>('v_compras?select=*&order=fecha.desc&limit=200'), loadRef()]);
  const ed = h('div', { class: 'g-card', style: 'display:grid;gap:12px' });
  const draw = () => {
    const total = sum(compra.lines, (l) => l.cantidad * l.costo);
    const [pick, dl] = prodPicker('dl-compra', (p, v) => {
      const hit = compra.lines.find((l) => l.slug === p.slug && l.k === v.k);
      if (hit) hit.cantidad++; else compra.lines.push({ slug: p.slug, k: v.k, nombre: v.k ? `${p.name} · ${v.k}` : p.name, cantidad: 1, costo: INV.get(priceKey(p.slug, v.k))?.costo || 0 });
      draw();
    }, 'Agregar producto a la compra…');
    const setF = (k: keyof typeof compra) => (e: Event) => ((compra as Any)[k] = (e.target as HTMLInputElement).value);
    ed.replaceChildren(h('h2', { text: '🛍️ Registrar compra (entrada de mercancía)' }),
      h('div', { class: 'g-row3' },
        field('Proveedor', h('input', { list: 'dl-prov', value: compra.proveedor, maxlength: 120, oninput: (e: Event) => { compra.proveedor = (e.target as HTMLInputElement).value; compra.proveedor_id = provs.find((x) => x.nombre === compra.proveedor)?.id || ''; } })),
        field('Factura del proveedor', h('input', { value: compra.factura_prov, maxlength: 40, oninput: setF('factura_prov') })),
        field('Vence (si es a crédito)', h('input', { type: 'date', value: compra.vence, onchange: setF('vence') }))),
      h('datalist', { id: 'dl-prov' }, provs.map((x) => h('option', { value: x.nombre }))),
      pick, dl,
      compra.lines.length ? table(['Producto', 'Cantidad', 'Costo unitario', 'Subtotal', ''], compra.lines.map((l, i) => h('tr', {},
        h('td', { text: l.nombre }),
        h('td', {}, h('input', { class: 'g-in', type: 'number', min: 1, value: l.cantidad, style: 'max-width:90px', 'aria-label': `Cantidad de ${l.nombre}`, onchange: (e: Event) => { l.cantidad = Math.max(1, Math.floor(+(e.target as HTMLInputElement).value) || 1); draw(); } })),
        h('td', {}, h('input', { class: 'g-in', inputmode: 'numeric', value: l.costo, style: 'max-width:130px', 'aria-label': `Costo de ${l.nombre}`, onchange: (e: Event) => { const v = parsePrice((e.target as HTMLInputElement).value); if (v != null && !Number.isNaN(v)) l.costo = v; draw(); } })),
        h('td', { class: 'n', text: cop(l.cantidad * l.costo) }),
        h('td', {}, btn('✕', () => { compra.lines.splice(i, 1); draw(); }, 'g-btn--sm')))), [3]) : h('p', { class: 'g-muted', text: 'Agrega los productos que llegaron.' }),
      h('div', { class: 'g-row3' },
        field('Pagado ahora', h('input', { inputmode: 'numeric', value: compra.pago, placeholder: `${cop(total)} (todo)`, oninput: setF('pago') })),
        field('Método', sel(METODOS.map((m) => [m, m]), compra.metodo, { onchange: setF('metodo') })),
        field('Notas', h('input', { value: compra.notas, maxlength: 600, oninput: setF('notas') }))),
      h('div', { class: 'pos__tot' }, h('div', {}, h('span', { text: 'TOTAL COMPRA' }), cop(total))),
      h('p', { class: 'g-muted', text: 'Al guardar entra el stock y el costo del producto se actualiza con el promedio ponderado.' }),
      h('div', { class: 'g-actions' }, h('button', { type: 'button', class: 'g-btn g-btn--cyan', disabled: !compra.lines.length || null, text: 'Guardar compra', onclick: async (e: Event) => {
        const b = e.target as HTMLButtonElement;
        const pago = compra.pago.trim() === '' ? total : parsePrice(compra.pago);
        if (!compra.proveedor.trim()) { status('Indica el proveedor.', 'bad'); return; }
        if (pago == null || Number.isNaN(pago) || pago > total) { status('El pago debe estar entre 0 y el total.', 'bad'); return; }
        b.disabled = true;
        try {
          const r = await rpc<Any>('registrar_compra', { p: { proveedor: compra.proveedor.trim(), proveedor_id: compra.proveedor_id || null, factura_prov: compra.factura_prov || null, vence: compra.vence || null, notas: compra.notas || null,
            items: compra.lines.map((l) => ({ slug: l.slug, variante: l.k, nombre: l.nombre, cantidad: l.cantidad, costo: l.costo })), pago: { valor: pago, metodo: compra.metodo } } });
          compra = { proveedor: '', proveedor_id: '', factura_prov: '', vence: '', notas: '', pago: '', metodo: 'efectivo', lines: [] };
          status(`Compra ${r.numero} registrada y stock actualizado ✓`, 'ok'); VIEWS.compras(root);
        } catch (x) { fail(x); b.disabled = false; }
      } }), btn('Limpiar', () => { compra.lines = []; draw(); })));
  };
  const porPagar = list.filter((c) => c.saldo > 0);
  root.replaceChildren(
    h('div', { class: 'g-kpis' }, kpi('Cuentas por pagar', cop(sum(porPagar, (c) => c.saldo)), `${porPagar.length} compra(s)`, 'g-kpi--hero'),
      kpi('Vencidas', cop(sum(porPagar.filter((c) => c.vence && c.vence < isoDate()), (c) => c.saldo))),
      kpi('Compras del mes', cop(sum(list.filter((c) => c.estado !== 'anulada' && c.fecha >= isoStart(isoDate().slice(0, 8) + '01')), (c) => c.total)))),
    ed,
    h('div', { class: 'g-card' }, h('h2', {}, 'Compras registradas', h('a', { class: 'g-btn g-btn--sm', href: '#terceros', text: 'Proveedores' })),
      table(['Número', 'Proveedor', 'Fecha', 'Vence', 'Total', 'Saldo', 'Estado'], list.map((c) => h('tr', { 'data-open': '', tabindex: 0, onclick: () => showCompra(c.id, root) },
        h('td', {}, h('b', { text: c.numero })), h('td', { text: c.proveedor + (c.factura_prov ? ` · ${c.factura_prov}` : '') }), h('td', { text: fd(c.fecha) }),
        h('td', {}, c.vence ? h('span', { class: `g-pill ${c.saldo && c.vence < isoDate() ? 'g-pill--bad' : ''}`, text: fd(c.vence) }) : '—'),
        h('td', { class: 'n', text: cop(c.total) }), h('td', { class: 'n', text: cop(c.saldo) }), h('td', {}, pill(c.estado)))), [4, 5])));
  draw();
};
async function showCompra(id: string, root: HTMLElement) {
  try {
    const [[c], items, pagos] = await Promise.all([get<Any[]>(`v_compras?select=*&id=eq.${id}`), get<Any[]>(`compra_items?select=*&compra_id=eq.${id}&order=id`), get<Any[]>(`pagos_compras?select=*&compra_id=eq.${id}&order=fecha`)]);
    const vivo = c.estado !== 'anulada';
    const v = h('input', { inputmode: 'numeric', value: c.saldo }) as HTMLInputElement, m = sel(METODOS.map((x) => [x, x]), 'transferencia') as HTMLSelectElement;
    const mo = h('input', { maxlength: 300, placeholder: 'Motivo de la anulación' }) as HTMLInputElement;
    openModal(`Compra ${c.numero} · ${c.proveedor}`,
      h('div', { class: 'g-actions' }, pill(c.estado), h('span', { class: 'g-muted', text: `${fdt(c.fecha)}${c.factura_prov ? ' · factura ' + c.factura_prov : ''}${c.vence ? ' · vence ' + fd(c.vence) : ''}` })),
      table(['Producto', 'Cant.', 'Costo', 'Subtotal'], items.map((i) => h('tr', {}, h('td', { text: i.nombre }), h('td', { class: 'n', text: i.cantidad }), h('td', { class: 'n', text: cop(i.costo) }), h('td', { class: 'n', text: cop(i.total) }))), [1, 2, 3]),
      h('div', { class: 'pos__tot' }, h('div', {}, h('span', { text: `Pagado ${cop(c.pagado)} · saldo ${cop(c.saldo)}` }), h('span', { text: '' })), h('div', {}, h('span', { text: 'TOTAL' }), cop(c.total))),
      pagos.length ? table(['Fecha', 'Método', 'Valor'], pagos.map((p) => h('tr', {}, h('td', { text: fdt(p.fecha) }), h('td', { text: p.metodo }), h('td', { class: 'n', text: cop(p.valor) }))), [2]) : '',
      vivo && c.saldo > 0 ? h('div', { class: 'g-filters' }, field('Pagar al proveedor', v), field('Método', m), btn('Registrar pago', async () => {
        const x = parsePrice(v.value); if (!x || Number.isNaN(x)) { status('Valor inválido.', 'bad'); return; }
        try { await rpc('pagar_compra', { c: c.id, valor: x, metodo: m.value }); status(`Pago de ${cop(x)} a ${c.proveedor} registrado ✓`, 'ok'); showCompra(id, root); VIEWS.compras(root); } catch (e) { fail(e); }
      }, 'g-btn--pri')) : '',
      vivo ? h('div', { class: 'g-filters' }, field('Anular compra (saca el stock que entró)', mo), btn('Anular', async () => {
        if (!mo.value.trim()) { status('Escribe el motivo.', 'bad'); return; }
        try { await rpc('anular_compra', { c: c.id, motivo: mo.value }); status(`Compra ${c.numero} anulada ✓`, 'ok'); modal.close(); VIEWS.compras(root); } catch (e) { fail(e); }
      }, 'g-btn--bad')) : '',
      c.notas ? h('p', { class: 'g-muted', text: c.notas }) : '');
  } catch (e) { fail(e); }
}

/* ---------- GARANTÍAS (365 días según el catálogo 2026) ---------- */
const GAR_DIAS = 365;
const GAR_ESTADOS: [string, string][] = [['recibida', 'Recibida'], ['en_revision', 'En revisión'], ['cambiada', 'Cambiada'], ['reparada', 'Reparada'], ['rechazada', 'Rechazada'], ['entregada', 'Entregada']];
let garFiltro = 'abiertas';
VIEWS.garantias = async (root: HTMLElement) => {
  const [gars, ters] = await Promise.all([get<Any[]>('garantias?select=*&order=fecha.desc&limit=300'), get<Any[]>('terceros?select=id,nombre,telefono,documento,ciudad,direccion&order=nombre&limit=2000')]);
  const g: Any = { tercero_id: '', cliente: { nombre: '', telefono: '' }, documento_id: '', docNum: '', docFecha: '', items: [] as Any[], prod: null, cantidad: 1, falla: '' };
  const form = h('div', { class: 'g-card', style: 'display:grid;gap:12px' });
  const draw = () => {
    const cov = g.docFecha ? Math.floor((Date.now() - new Date(g.docFecha).getTime()) / 864e5) : null;
    const [pick, dl] = prodPicker('dl-gar', (p, v) => { g.prod = { slug: p.slug, variante: v.k, nombre: v.k ? `${p.name} · ${v.k}` : p.name }; draw(); }, 'Producto en garantía…');
    form.replaceChildren(h('h2', { text: '🛡️ Recibir garantía' }),
      h('div', { class: 'g-row' },
        field('Factura o remisión (opcional)', h('input', { value: g.docNum, placeholder: 'FV-15', onchange: async (e: Event) => {
          g.docNum = (e.target as HTMLInputElement).value.trim().toUpperCase(); g.documento_id = ''; g.docFecha = ''; g.items = [];
          if (!g.docNum) { draw(); return; }
          try {
            const [d] = await get<Any[]>(`documentos?select=id,fecha,cliente,tercero_id,tipo,estado&numero=eq.${encodeURIComponent(g.docNum)}`);
            if (!d || d.tipo === 'cotizacion') { status(`No se encontró la venta ${g.docNum}.`, 'bad'); draw(); return; }
            Object.assign(g, { documento_id: d.id, docFecha: d.fecha, tercero_id: d.tercero_id || '', cliente: { nombre: '', telefono: '', ...d.cliente } });
            g.items = await get<Any[]>(`documento_items?select=slug,variante,nombre,cantidad&documento_id=eq.${d.id}`);
            if (g.items.length === 1) g.prod = { ...g.items[0] };
            status(''); draw();
          } catch (x) { fail(x); }
        } })),
        field('Cliente', h('input', { list: 'dl-gar-cli', value: g.cliente.nombre, maxlength: 120, oninput: (e: Event) => {
          const val = (e.target as HTMLInputElement).value, t = ters.find((x) => x.nombre === val);
          g.cliente = t ? { nombre: t.nombre, telefono: t.telefono || '', documento: t.documento || '', ciudad: t.ciudad || '' } : { ...g.cliente, nombre: val }; g.tercero_id = t?.id || '';
        } }))),
      h('datalist', { id: 'dl-gar-cli' }, ters.map((t) => h('option', { value: t.nombre }))),
      cov == null ? '' : h('div', { class: `g-banner ${cov <= GAR_DIAS ? 'g-banner--warn' : 'g-banner--bad'}`, text: cov <= GAR_DIAS
        ? `✅ En garantía: compra del ${fd(g.docFecha)} (hace ${cov} días, quedan ${GAR_DIAS - cov}).` : `⚠️ Fuera de garantía: compra del ${fd(g.docFecha)}, hace ${cov} días (límite ${GAR_DIAS}).` }),
      g.items.length > 1 ? field('Producto de esa venta', sel([['', 'Elegir…'], ...g.items.map((i: Any, n: number) => [String(n), i.nombre] as [string, string])], '', { onchange: (e: Event) => { const i = g.items[+(e.target as HTMLSelectElement).value]; if (i) { g.prod = { ...i }; draw(); } } })) : '',
      g.items.length ? '' : h('div', {}, pick, dl),
      g.prod ? h('p', {}, h('b', { text: 'Producto: ' }), g.prod.nombre) : '',
      h('div', { class: 'g-row' }, field('Cantidad', h('input', { type: 'number', min: 1, value: g.cantidad, onchange: (e: Event) => (g.cantidad = Math.max(1, Math.floor(+(e.target as HTMLInputElement).value) || 1)) })),
        field('Teléfono del cliente', h('input', { value: g.cliente.telefono || '', maxlength: 30, oninput: (e: Event) => (g.cliente.telefono = (e.target as HTMLInputElement).value) }))),
      field('Falla reportada', h('textarea', { maxlength: 600, value: g.falla, oninput: (e: Event) => (g.falla = (e.target as HTMLTextAreaElement).value) })),
      h('div', { class: 'g-actions' }, btn('Registrar garantía', async () => {
        if (!g.prod) { status('Elige el producto.', 'bad'); return; }
        if (!g.cliente.nombre?.trim() || !g.falla.trim()) { status('Completa el cliente y la falla.', 'bad'); return; }
        try {
          const r = await insert('garantias', { tercero_id: g.tercero_id || null, cliente: g.cliente, documento_id: g.documento_id || null, slug: g.prod.slug, variante: g.prod.variante || '', nombre: g.prod.nombre, cantidad: g.cantidad, falla: g.falla.trim() });
          status(`Garantía GAR-${r.id} registrada ✓`, 'ok'); VIEWS.garantias(root);
        } catch (e) { fail(e); }
      }, 'g-btn--cyan')));
  };
  const abiertas = (x: Any) => ['recibida', 'en_revision'].includes(x.estado);
  const rows = gars.filter((x) => garFiltro === 'todas' || (garFiltro === 'abiertas' ? abiertas(x) : !abiertas(x)));
  root.replaceChildren(
    h('div', { class: 'g-kpis' }, kpi('Abiertas', String(gars.filter(abiertas).length), 'recibidas o en revisión', 'g-kpi--hero'),
      kpi('Cambios este mes', String(gars.filter((x) => x.estado === 'cambiada' && x.cerrada_en >= isoStart(isoDate().slice(0, 8) + '01')).length)),
      kpi('Productos con más reclamos', groupSum(gars, (x) => x.nombre, (x) => x.cantidad)[0]?.[0] || '—')),
    h('div', { class: 'g-grid2' }, form,
      h('div', { class: 'g-card' },
        h('div', { class: 'pos__seg', role: 'group', 'aria-label': 'Filtro', style: 'margin-bottom:12px' }, [['abiertas', 'Abiertas'], ['cerradas', 'Cerradas'], ['todas', 'Todas']].map(([v, l]) =>
          h('button', { type: 'button', 'aria-pressed': String(garFiltro === v), text: l, onclick: () => { garFiltro = v; VIEWS.garantias(root).catch(fail); } }))),
        table(['N.º', 'Cliente', 'Producto', 'Recibida', 'Estado'], rows.map((x) => h('tr', { 'data-open': '', tabindex: 0, onclick: () => garModal(x, root) },
          h('td', {}, h('b', { text: `GAR-${x.id}` })), h('td', { text: x.cliente?.nombre || '' }), h('td', { text: `${x.nombre}${x.cantidad > 1 ? ' ×' + x.cantidad : ''}` }), h('td', { text: fd(x.fecha) }),
          h('td', {}, h('span', { class: `g-pill ${abiertas(x) ? 'g-pill--warn' : x.estado === 'rechazada' ? 'g-pill--bad' : 'g-pill--ok'}`, text: GAR_ESTADOS.find((e) => e[0] === x.estado)?.[1] || x.estado })))))))
  );
  draw();
};
function garModal(x: Any, root: HTMLElement) {
  const est = sel(GAR_ESTADOS, x.estado) as HTMLSelectElement, res = h('textarea', { maxlength: 600, value: x.resolucion || '' }) as HTMLTextAreaElement;
  const msg = () => `Hola ${x.cliente?.nombre || ''}, te escribimos de UBU Latinoamérica sobre tu garantía GAR-${x.id} (${x.nombre}): ${GAR_ESTADOS.find((e) => e[0] === est.value)?.[1].toLowerCase()}. ${res.value}`.trim();
  openModal(`Garantía GAR-${x.id}`,
    h('p', {}, h('b', { text: x.nombre }), ` · ${x.cantidad} und · recibida ${fdt(x.fecha)}`),
    h('p', { class: 'g-muted', text: `Cliente: ${x.cliente?.nombre || ''} ${x.cliente?.telefono ? '· ' + x.cliente.telefono : ''}` }),
    h('div', { class: 'g-banner g-banner--warn', text: `Falla: ${x.falla}` }),
    field('Nuevo estado', est), h('p', { class: 'g-muted', text: '«Cambiada» entrega un producto nuevo: descuenta stock del inventario (kardex tipo garantía).' }),
    field('Resolución / diagnóstico', res),
    h('div', { class: 'g-actions' },
      btn('Guardar', async () => {
        if (est.value === 'cambiada' && x.estado !== 'cambiada' && !confirm(`Se descontarán ${x.cantidad} unidad(es) de ${x.nombre} del inventario. ¿Continuar?`)) return;
        try { await rpc('resolver_garantia', { g: x.id, nuevo: est.value, resolucion: res.value || null }); status(`GAR-${x.id} actualizada ✓`, 'ok'); modal.close(); VIEWS.garantias(root); } catch (e) { fail(e); }
      }, 'g-btn--pri'),
      x.cliente?.telefono ? btn('Avisar por WhatsApp', () => open(`https://wa.me/${waNum(x.cliente.telefono)}?text=${encodeURIComponent(msg())}`, '_blank', 'noopener')) : '',
      x.documento_id ? btn('Ver venta', () => showDoc(x.documento_id)) : ''));
}

/* ---------- CAMPAÑAS WHATSAPP ---------- */
// shortcut: WhatsApp no permite envíos masivos desde un enlace web; se abre un chat por cliente. Para envío masivo real hace falta la API de WhatsApp Business.
const PLANTILLAS: [string, string][] = [
  ['Novedades del catálogo', 'Hola {nombre} 👋, en UBU Latinoamérica llegaron novedades en cargadores, cables e hidrogel. Mira el catálogo 2026: https://www.ubulatinoamerica.com/catalogo'],
  ['Promoción', 'Hola {nombre}, esta semana tenemos precios especiales en UBU Latinoamérica. Escríbenos y te enviamos la cotización 🚀'],
  ['Recordatorio de pago', 'Hola {nombre}, te recordamos que tienes un saldo pendiente de {saldo} con UBU Latinoamérica. ¡Gracias por tu confianza!'],
  ['Volver a comprar', 'Hola {nombre}, hace un tiempo no te vemos por UBU Latinoamérica 😊. ¿Te ayudamos con tu próximo pedido?'],
];
const camp = { tipo: '', ciudad: '', filtro: '', dias: 60, texto: PLANTILLAS[0][1], enviados: new Set<string>() };
VIEWS.campanas = async (root: HTMLElement) => {
  const [ters, docs] = await Promise.all([get<Any[]>('terceros?select=*&order=nombre&limit=2000'), get<Any[]>('v_documentos?select=tercero_id,fecha,saldo,estado,tipo&tercero_id=not.is.null&order=fecha.desc&limit=5000')]);
  const info = new Map<string, { ultima: string; saldo: number }>();
  docs.filter((d) => d.estado !== 'anulada' && d.tipo !== 'cotizacion').forEach((d) => {
    const i = info.get(d.tercero_id) || { ultima: '', saldo: 0 };
    if (d.fecha > i.ultima) i.ultima = d.fecha; i.saldo += d.saldo; info.set(d.tercero_id, i);
  });
  const list = h('div', {});
  const draw = () => {
    const limite = daysAgo(camp.dias).toISOString();
    const aud = ters.filter((t) => t.telefono && t.tipo !== 'proveedor' && (!camp.tipo || t.tipo === camp.tipo) && (!camp.ciudad || (t.ciudad || '').toLowerCase().includes(camp.ciudad.toLowerCase())) && (() => {
      const i = info.get(t.id);
      if (camp.filtro === 'saldo') return (i?.saldo || 0) > 0;
      if (camp.filtro === 'activos') return !!i && i.ultima >= limite;
      if (camp.filtro === 'inactivos') return !i || i.ultima < limite;
      return true;
    })());
    const txt = (t: Any) => camp.texto.replaceAll('{nombre}', t.nombre.split(' ')[0]).replaceAll('{saldo}', cop(info.get(t.id)?.saldo || 0));
    list.replaceChildren(h('p', { class: 'g-muted', text: `${aud.length} destinatario(s) con teléfono · ${[...camp.enviados].filter((id) => aud.some((t) => t.id === id)).length} abiertos en esta sesión` }),
      table(['Cliente', 'Tipo', 'Ciudad', 'Última compra', 'Saldo', ''], aud.map((t) => {
        const i = info.get(t.id), sent = camp.enviados.has(t.id);
        return h('tr', {}, h('td', {}, h('b', { text: t.nombre }), h('div', { class: 'g-muted', text: t.telefono })), h('td', { text: t.tipo }), h('td', { text: t.ciudad || '' }),
          h('td', { text: i ? fd(i.ultima) : '—' }), h('td', { class: 'n', text: i?.saldo ? cop(i.saldo) : '—' }),
          h('td', {}, h('button', { type: 'button', class: `g-btn g-btn--sm ${sent ? '' : 'g-btn--pri'}`, text: sent ? 'Abierto ✓' : 'Enviar', onclick: () => {
            open(`https://wa.me/${waNum(t.telefono)}?text=${encodeURIComponent(txt(t))}`, '_blank', 'noopener'); camp.enviados.add(t.id); draw();
          } })));
      }), [4]));
  };
  const f = (k: 'tipo' | 'ciudad' | 'filtro') => (e: Event) => { camp[k] = (e.target as HTMLInputElement).value; draw(); };
  const ta = h('textarea', { maxlength: 1000, value: camp.texto, oninput: (e: Event) => { camp.texto = (e.target as HTMLTextAreaElement).value; draw(); } }) as HTMLTextAreaElement;
  root.replaceChildren(
    h('div', { class: 'g-card', style: 'display:grid;gap:12px' }, h('h2', { text: '📣 Nueva campaña' }),
      h('div', { class: 'g-filters' },
        field('Público', sel([['', 'Clientes y mayoristas'], ['cliente', 'Solo clientes'], ['mayorista', 'Solo mayoristas']], camp.tipo, { onchange: f('tipo') })),
        field('Ciudad contiene', h('input', { value: camp.ciudad, oninput: f('ciudad') })),
        field('Segmento', sel([['', 'Todos'], ['saldo', 'Con saldo pendiente'], ['activos', 'Compraron en los últimos N días'], ['inactivos', 'Sin compras en N días']], camp.filtro, { onchange: f('filtro') })),
        field('N días', h('input', { type: 'number', min: 1, value: camp.dias, onchange: (e: Event) => { camp.dias = Math.max(1, +(e.target as HTMLInputElement).value || 60); draw(); } }))),
      field('Plantilla', sel([['', 'Elegir plantilla…'], ...PLANTILLAS.map(([n], i) => [String(i), n] as [string, string])], '', { onchange: (e: Event) => { const p = PLANTILLAS[+(e.target as HTMLSelectElement).value]; if (p) { camp.texto = p[1]; ta.value = p[1]; draw(); } } })),
      field('Mensaje ({nombre} y {saldo} se reemplazan por cada cliente)', ta),
      h('p', { class: 'g-muted', text: 'WhatsApp no permite envíos masivos desde la web: cada botón abre el chat con el mensaje listo y tú lo envías.' })),
    h('div', { class: 'g-card' }, list));
  draw();
};

/* ---------- REPORTES ---------- */
// shortcut: Supabase devuelve como máximo 1000 filas por consulta por defecto; para periodos con más ventas, subir «Max rows» en la API o paginar.
const rep = { desde: isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), hasta: isoDate() };
async function ventasPeriodo(desde: string, hasta: string) {
  const f = `fecha=gte.${isoStart(desde)}&fecha=lt.${isoEnd(hasta)}`;
  const [docs, items, pagos, cots] = await Promise.all([
    get<Any[]>(`v_documentos?select=*&${f}&tipo=neq.cotizacion&estado=neq.anulada&order=fecha`),
    get<Any[]>(`documento_items?select=slug,variante,nombre,cantidad,precio,costo,total,documentos!inner(fecha,estado,tipo,lista,cliente,descuento,subtotal)&documentos.fecha=gte.${isoStart(desde)}&documentos.fecha=lt.${isoEnd(hasta)}&documentos.estado=neq.anulada&documentos.tipo=neq.cotizacion`),
    get<Any[]>(`pagos?select=valor,metodo,fecha,documentos!inner(estado)&${f}&documentos.estado=neq.anulada`),
    get<Any[]>(`documentos?select=estado&${f}&tipo=eq.cotizacion`),
  ]);
  // Descuento del documento repartido proporcionalmente entre sus líneas para que la utilidad por producto cuadre con el total.
  items.forEach((i) => { const d = i.documentos; i.neto = d.subtotal ? Math.round(i.total * (1 - d.descuento / d.subtotal)) : i.total; i.util = i.neto - i.costo * i.cantidad; });
  return { docs, items, pagos, cots };
}
const csv = (name: string, rows: (string | number)[][]) => {
  const txt = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })), download: name }) as HTMLAnchorElement;
  document.body.append(a); a.click(); a.remove();
};
VIEWS.reportes = async (root: HTMLElement) => {
  const body = h('div', { style: 'display:grid;gap:18px' }, h('p', { class: 'g-muted', text: 'Cargando…' }));
  const load = async () => {
    const { docs, items, pagos, cots } = await ventasPeriodo(rep.desde, rep.hasta);
    const ventas = sum(docs, (d) => d.total), util = sum(items, (i) => i.util), costo = sum(items, (i) => i.costo * i.cantidad);
    const porProd = new Map<string, Any>();
    items.forEach((i) => { const k = i.nombre; const r = porProd.get(k) || { nombre: k, cant: 0, venta: 0, util: 0 }; r.cant += i.cantidad; r.venta += i.neto; r.util += i.util; porProd.set(k, r); });
    const prods = [...porProd.values()].sort((a, b) => b.venta - a.venta);
    body.replaceChildren(
      h('div', { class: 'g-kpis' }, kpi('Ventas netas', cop(ventas), `${docs.length} documento(s)`, 'g-kpi--hero'), kpi('Ticket promedio', cop(docs.length ? ventas / docs.length : 0)),
        kpi('Utilidad bruta', cop(util), ventas ? `margen ${Math.round((util / ventas) * 100)}%` : '', 'g-kpi--ok'), kpi('Recaudado', cop(sum(pagos, (p) => p.valor))),
        kpi('Cotizaciones', String(cots.length), cots.length ? `${Math.round((cots.filter((c) => c.estado === 'convertida').length / cots.length) * 100)}% convertidas en venta` : '')),
      costo ? '' : h('div', { class: 'g-banner g-banner--warn', text: 'Sin costos registrados: la utilidad aparece igual a la venta. Registra costos en Inventario o con Compras.' }),
      h('div', { class: 'g-grid2' },
        h('div', { class: 'g-card' }, h('h2', { text: 'Ventas por día' }), bars(groupSum(docs, (d) => fd(d.fecha), (d) => d.total).sort((a, b) => a[0].split('/').reverse().join('').localeCompare(b[0].split('/').reverse().join(''))))),
        h('div', { class: 'g-card' }, h('h2', { text: 'Por método de pago' }), bars(groupSum(pagos, (p) => p.metodo, (p) => p.valor)),
          h('h2', { text: 'Por lista de precios', style: 'margin-top:18px' }), bars(groupSum(docs, (d) => (d.lista === 'mayorista' ? 'Mayorista' : 'Cliente final'), (d) => d.total)),
          h('h2', { text: 'Por tipo de documento', style: 'margin-top:18px' }), bars(groupSum(docs, (d) => TIPO[d.tipo], (d) => d.total)))),
      h('div', { class: 'g-card' }, h('h2', {}, 'Productos', btn('Exportar CSV', () => csv(`productos-${rep.desde}-${rep.hasta}.csv`, [['Producto', 'Unidades', 'Venta neta', 'Utilidad', 'Margen %'], ...prods.map((p) => [p.nombre, p.cant, p.venta, p.util, p.venta ? Math.round((p.util / p.venta) * 100) : 0])]), 'g-btn--sm')),
        table(['Producto', 'Unidades', 'Venta neta', 'Utilidad', 'Margen'], prods.map((p) => h('tr', {}, h('td', { text: p.nombre }), h('td', { class: 'n', text: p.cant }), h('td', { class: 'n', text: cop(p.venta) }), h('td', { class: 'n', text: cop(p.util) }), h('td', { class: 'n', text: p.venta ? `${Math.round((p.util / p.venta) * 100)}%` : '—' }))), [1, 2, 3, 4])),
      h('div', { class: 'g-grid2' },
        h('div', { class: 'g-card' }, h('h2', { text: 'Top 10 clientes' }), bars(groupSum(docs, (d) => d.cliente?.nombre || 'Consumidor final', (d) => d.total).slice(0, 10))),
        h('div', { class: 'g-card' }, h('h2', {}, 'Detalle de ventas', btn('Exportar CSV', () => csv(`ventas-${rep.desde}-${rep.hasta}.csv`, [['Número', 'Tipo', 'Fecha', 'Cliente', 'Lista', 'Subtotal', 'Descuento', 'Total', 'Pagado', 'Saldo', 'Estado'],
          ...docs.map((d) => [d.numero, TIPO[d.tipo], fdt(d.fecha), d.cliente?.nombre || '', d.lista, d.subtotal, d.descuento, d.total, d.pagado, d.saldo, d.estado])]), 'g-btn--sm')),
          h('p', { class: 'g-muted', text: `${docs.length} documento(s) en el periodo. Ábrelos en Facturas y anulaciones.` }))));
  };
  root.replaceChildren(h('div', { class: 'g-card g-noprint' }, h('div', { class: 'g-filters' }, rangeFields(rep, () => load().catch(fail)), btn('Imprimir', () => print()))), body);
  await load();
};

/* ---------- ESTADOS FINANCIEROS (simplificados, no reemplazan la contabilidad) ---------- */
const fin = { desde: rep.desde, hasta: rep.hasta };
VIEWS.financieros = async (root: HTMLElement) => {
  const body = h('div', { style: 'display:grid;gap:18px' }, h('p', { class: 'g-muted', text: 'Cargando…' }));
  const load = async () => {
    const [{ docs, items, pagos }, gastos, compras, pagosProv, cartera, cxp] = await Promise.all([
      ventasPeriodo(fin.desde, fin.hasta),
      get<Any[]>(`gastos?select=categoria,valor&fecha=gte.${fin.desde}&fecha=lte.${fin.hasta}`),
      get<Any[]>(`compras?select=total&estado=neq.anulada&fecha=gte.${isoStart(fin.desde)}&fecha=lt.${isoEnd(fin.hasta)}`),
      get<Any[]>(`pagos_compras?select=valor&fecha=gte.${isoStart(fin.desde)}&fecha=lt.${isoEnd(fin.hasta)}`),
      get<Any[]>('v_documentos?select=saldo&saldo=gt.0'),
      get<Any[]>('v_compras?select=saldo&saldo=gt.0'),
      loadRef(),
    ]);
    const ingresos = sum(docs, (d) => d.total), costo = sum(items, (i) => i.costo * i.cantidad), bruta = ingresos - costo;
    const gCat = groupSum(gastos, (g) => g.categoria, (g) => g.valor), gTot = sum(gastos, (g) => g.valor), oper = bruta - gTot;
    const cobros = sum(pagos, (p) => p.valor), pProv = sum(pagosProv, (p) => p.valor), flujo = cobros - gTot - pProv;
    const invVal = sum([...INV.values()], (r) => Math.max(r.stock, 0) * r.costo), cxc = sum(cartera, (d) => d.saldo), cxpT = sum(cxp, (c) => c.saldo);
    const pct = (v: number) => (ingresos ? ` (${Math.round((v / ingresos) * 100)}%)` : '');
    const row = (k: string, v: number, cls = '') => h('tr', { class: cls }, h('td', { text: k }), h('td', { text: cop(v) }));
    body.replaceChildren(
      h('div', { class: 'g-kpis' }, kpi('Ventas netas', cop(ingresos), '', 'g-kpi--hero'), kpi('Utilidad bruta', cop(bruta), pct(bruta).trim(), 'g-kpi--ok'), kpi('Utilidad operacional', cop(oper), pct(oper).trim(), oper < 0 ? '' : 'g-kpi--ok'), kpi('Flujo de caja neto', cop(flujo))),
      h('div', { class: 'g-grid2' },
        h('div', { class: 'g-card' }, h('h2', { text: `Estado de resultados · ${fd(fin.desde)} a ${fd(fin.hasta)}` }), h('table', { class: 'g-fin' }, h('tbody', {},
          row('Ingresos operacionales (ventas netas)', ingresos), row('− Costo de ventas', costo, 'neg'), row(`Utilidad bruta${pct(bruta)}`, bruta, 'tot'),
          h('tr', {}, h('td', { text: 'Gastos operacionales' }), h('td', { text: '' })), gCat.map(([c, v]) => row(c, v, 'sub')), row('− Total gastos', gTot, 'neg'),
          row(`Utilidad operacional${pct(oper)}`, oper, `tot ${oper < 0 ? 'neg' : 'pos'}`)))),
        h('div', { style: 'display:grid;gap:18px' },
          h('div', { class: 'g-card' }, h('h2', { text: 'Flujo de caja del periodo' }), h('table', { class: 'g-fin' }, h('tbody', {},
            row('+ Cobros a clientes (todas las formas de pago)', cobros), row('− Gastos', gTot, 'neg'), row('− Pagos a proveedores', pProv, 'neg'), row('Flujo neto', flujo, `tot ${flujo < 0 ? 'neg' : 'pos'}`),
            row('Compras de mercancía del periodo (informativo)', sum(compras, (c) => c.total), 'sub')))),
          h('div', { class: 'g-card' }, h('h2', { text: 'Situación a hoy (simplificada)' }), h('table', { class: 'g-fin' }, h('tbody', {},
            row('Inventario al costo', invVal), row('Cuentas por cobrar', cxc), row('Total activos registrados', invVal + cxc, 'tot'),
            row('Cuentas por pagar a proveedores', cxpT, 'neg'), row('Patrimonio estimado (sin caja ni bancos)', invVal + cxc - cxpT, 'tot')))))),
      h('p', { class: 'g-muted', text: 'Informe de gestión calculado con los datos del sistema (ventas, costos de inventario, gastos y compras). No reemplaza los estados financieros de tu contador: no incluye impuestos, depreciaciones, caja/bancos ni obligaciones fuera del sistema.' }));
  };
  root.replaceChildren(h('div', { class: 'g-card g-noprint' }, h('div', { class: 'g-filters' }, rangeFields(fin, () => load().catch(fail)), btn('Imprimir', () => print()))), body);
  await load();
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
