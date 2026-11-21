/* Panel de administración: activar/ocultar productos y editar precios de cliente final y mayorista.
   La autorización real la hace Supabase con RLS (solo usuarios de la tabla `admins` pueden escribir);
   este script solo arma la interfaz. Si un guardado falla, los valores escritos se conservan para reintentar. */
import { priceKey, parsePrice } from './pricing';
import { get, upsert, SessionLost } from './gestion/api';

interface Var { k: string; l: string; c: number | null }
interface Item { slug: string; name: string; cat: 'conectividad' | 'hidrogel'; order: number; vars: Var[] }
type Row = { slug: string; variante: string; precio: number | null };

const items: Item[] = JSON.parse(document.getElementById('a-data')?.textContent || '[]');
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('a-status'), list = $('a-list');
export const dirty = new Set<string>();
const onSessionLost = (e: unknown) => e instanceof SessionLost;

/** Vista «Catálogo y precios» del panel de gestión. */
export async function loadPanel() {
  status.textContent = 'Cargando productos…'; list.replaceChildren();
  try {
    const [prods, pub, may] = (await Promise.all([
      get('productos?select=slug,activo'),
      get('precios?select=slug,variante,precio'),
      get('precios_mayoristas?select=slug,variante,precio'),
    ])) as [{ slug: string; activo: boolean }[], Row[], Row[]];
    const active = new Map(prods.map((p) => [p.slug, p.activo]));
    const P = new Map(pub.map((r) => [priceKey(r.slug, r.variante), r.precio]));
    const M = new Map(may.map((r) => [priceKey(r.slug, r.variante), r.precio]));
    items.forEach((it) => list.append(card(it, active.get(it.slug) ?? true, P, M)));
    status.textContent = `${items.length} productos.${prods.length ? '' : ' Aún no hay productos cargados en la base de datos: ejecuta supabase/seed.sql o guarda cada producto.'}`;
    filter();
  } catch (e) {
    if (!onSessionLost(e)) status.textContent = `No se pudieron cargar los productos: ${(e as Error).message}`;
  }
}

function field(label: string, value: number | null | undefined, placeholder: string) {
  const l = document.createElement('label');
  const i = document.createElement('input');
  i.inputMode = 'numeric'; i.autocomplete = 'off'; i.value = value == null ? '' : String(value); i.placeholder = placeholder;
  l.append(label, i);
  return { l, i };
}

function card(it: Item, activo: boolean, P: Map<string, number | null>, M: Map<string, number | null>) {
  const el = document.createElement('article'); el.className = 'ap'; el.dataset.slug = it.slug; el.dataset.cat = it.cat; el.dataset.name = it.name.toLowerCase();
  const head = document.createElement('div'); head.className = 'ap__head';
  const t = document.createElement('div');
  const n = document.createElement('div'); n.className = 'ap__name'; n.textContent = it.name;
  const m = document.createElement('div'); m.className = 'ap__meta'; m.textContent = `#${it.order} · ${it.cat === 'hidrogel' ? 'Hidrogel' : 'Conectividad'} · /${it.slug}`;
  t.append(n, m);
  const vis = document.createElement('label'); vis.className = 'ap__vis';
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = activo;
  vis.append(cb, 'Visible en el catálogo');
  head.append(t, vis);

  const prices = document.createElement('div'); prices.className = 'ap__prices';
  const inputs = it.vars.map((v) => {
    const row = document.createElement('div'); row.className = 'ap__row';
    const lab = document.createElement('span'); lab.textContent = v.l;
    const pub = field('Cliente final', P.get(priceKey(it.slug, v.k)), v.c == null ? 'Sin precio' : `Catálogo: ${v.c}`);
    const may = field('Mayorista', M.get(priceKey(it.slug, v.k)), 'Consultar precio');
    pub.i.setAttribute('aria-label', `${it.name}, ${v.l}: precio cliente final`);
    may.i.setAttribute('aria-label', `${it.name}, ${v.l}: precio mayorista`);
    row.append(lab, pub.l, may.l); prices.append(row);
    return { v, pub: pub.i, may: may.i };
  });

  const foot = document.createElement('div'); foot.className = 'ap__foot';
  const save = document.createElement('button'); save.type = 'button'; save.className = 'btn btn--sm'; save.textContent = 'Guardar cambios';
  const msg = document.createElement('span'); msg.className = 'ap__msg'; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
  foot.append(save, msg);
  el.append(head, prices, foot);
  el.classList.toggle('is-off', !activo);

  const markDirty = () => { dirty.add(it.slug); el.classList.add('is-dirty'); msg.className = 'ap__msg'; msg.textContent = 'Cambios sin guardar'; };
  el.addEventListener('input', markDirty);
  cb.addEventListener('change', () => el.classList.toggle('is-off', !cb.checked));

  save.addEventListener('click', async () => {
    // Validación local (la definitiva es el check >= 0 de la base de datos)
    let bad: HTMLInputElement | null = null;
    const vals = inputs.map(({ v, pub, may }) => {
      const a = parsePrice(pub.value), b = parsePrice(may.value);
      pub.setAttribute('aria-invalid', String(Number.isNaN(a))); may.setAttribute('aria-invalid', String(Number.isNaN(b)));
      if (Number.isNaN(a)) bad ??= pub;
      if (Number.isNaN(b)) bad ??= may;
      return { k: v.k, a, b };
    });
    if (bad) { msg.className = 'ap__msg is-bad'; msg.textContent = 'Revisa los precios marcados: deben ser números enteros, sin decimales y no negativos.'; (bad as HTMLInputElement).focus(); return; }

    save.disabled = true; save.setAttribute('aria-busy', 'true'); msg.className = 'ap__msg'; msg.textContent = 'Guardando…';
    try {
      await upsert('productos', 'slug', [{ slug: it.slug, nombre: it.name, categoria: it.cat, orden: it.order, activo: cb.checked }]);
      await upsert('precios', 'slug,variante', vals.map((x) => ({ slug: it.slug, variante: x.k, precio: x.a })));
      await upsert('precios_mayoristas', 'slug,variante', vals.map((x) => ({ slug: it.slug, variante: x.k, precio: x.b })));
      dirty.delete(it.slug); el.classList.remove('is-dirty');
      msg.className = 'ap__msg is-ok';
      msg.textContent = `Guardado ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}${cb.checked ? '' : ' · oculto en el catálogo'}`;
    } catch (e) {
      if (onSessionLost(e)) return;
      msg.className = 'ap__msg is-bad'; msg.textContent = `No se guardó: ${(e as Error).message} Tus cambios siguen en pantalla.`;
    } finally { save.disabled = false; save.removeAttribute('aria-busy'); }
  });
  return el;
}

function filter() {
  const q = $<HTMLInputElement>('a-q').value.trim().toLowerCase(), c = $<HTMLSelectElement>('a-cat').value, v = $<HTMLSelectElement>('a-vis').value;
  let shown = 0;
  list.querySelectorAll<HTMLElement>('.ap').forEach((el) => {
    const off = el.classList.contains('is-off');
    const ok = (!q || el.dataset.name!.includes(q)) && (!c || el.dataset.cat === c) && (!v || (v === 'off') === off);
    el.hidden = !ok; if (ok) shown++;
  });
  if (list.children.length) status.textContent = `${shown} de ${items.length} productos`;
}
['a-q', 'a-cat', 'a-vis'].forEach((id) => $(id).addEventListener('input', filter));

