/* Precios en vivo, productos ocultos y vista mayorista (Supabase, solo si hay variables PUBLIC_SUPABASE_*).
   La seguridad vive en la base de datos (RLS, ver supabase/schema.sql): con la clave pública solo se leen productos
   activos y precios de cliente final; los precios mayoristas solo llegan con el token de un usuario de la tabla `mayoristas`.
   El navegador guarda el token de sesión (nunca la contraseña) en sessionStorage: se borra al cerrar la pestaña y caduca
   con el token (1 h por defecto en Supabase). shortcut: sin refresh token; al caducar se vuelve a precios públicos. */

export const SB_URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
export const sbOn = !!(SB_URL && SB_KEY);

export type Role = 'admin' | 'mayorista';
export interface Session { t: string; exp: number }
const KEYS: Record<Role, string> = { admin: 'ubu_admin', mayorista: 'ubu_may' };

export function getSession(role: Role): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEYS[role]) || 'null') as Session | null;
    if (s && s.t && s.exp > Date.now() + 5000) return s;
    sessionStorage.removeItem(KEYS[role]);
  } catch { /* almacenamiento bloqueado: sin sesión */ }
  return null;
}
export function endSession(role: Role) {
  const s = getSession(role);
  try { sessionStorage.removeItem(KEYS[role]); } catch { /* nada */ }
  if (s) sb('/auth/v1/logout', { method: 'POST' }, s.t).catch(() => {}); // revoca el refresh token en Supabase
}

export function sb(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  headers.set('apikey', SB_KEY!);
  headers.set('Authorization', `Bearer ${token || SB_KEY}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return fetch(SB_URL + path, { ...init, headers });
}

/** Inicia sesión y exige el rol pedido: un mayorista no entra a administración ni al revés. */
/** Los usuarios de Supabase Auth exigen correo: quien ingresa escribe solo el usuario ("admin") y se completa con el dominio de UBU. */
const USER_DOMAIN = 'ubulatinoamerica.com';
export async function signIn(role: Role, user: string, password: string): Promise<Session> {
  const u = user.trim().toLowerCase();
  const email = u.includes('@') ? u : `${u}@${USER_DOMAIN}`;
  const r = await sb('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (r.status === 400 || r.status === 401) throw new Error('Usuario o contraseña incorrectos.');
  if (r.status === 429) throw new Error('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
  if (!r.ok) throw new Error('No se pudo conectar con el servidor. Inténtalo de nuevo.');
  const j = await r.json();
  const s: Session = { t: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  const rr = await sb('/rest/v1/rpc/mi_rol', { method: 'POST', body: '{}' }, s.t);
  const got = rr.ok ? ((await rr.json()) as Role | null) : null;
  if (got !== role) {
    sb('/auth/v1/logout', { method: 'POST' }, s.t).catch(() => {});
    throw new Error(role === 'admin' ? 'Esta cuenta no tiene permisos de administración.' : 'Esta cuenta no es de acceso mayorista.');
  }
  sessionStorage.setItem(KEYS[role], JSON.stringify(s));
  return s;
}

export const priceKey = (slug: string, variante = '') => `${slug}|${variante}`;
export interface Prices { active: Map<string, boolean>; pub: Map<string, number | null>; may: Map<string, number | null> | null }
type Row = { slug: string; variante: string; precio: number | null };

let cached: Promise<Prices | null> | null = null;
/** Una sola carga por página (la usan el catálogo y el carrito). null = sin Supabase o sin conexión: se usa el catálogo. */
export function loadPrices(): Promise<Prices | null> {
  return (cached ??= (async () => {
    if (!sbOn) return null;
    try {
      const [p, pr] = await Promise.all([
        sb('/rest/v1/productos?select=slug,activo').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        sb('/rest/v1/precios?select=slug,variante,precio').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      ]);
      const out: Prices = {
        active: new Map((p as { slug: string; activo: boolean }[]).map((x) => [x.slug, x.activo])),
        pub: new Map((pr as Row[]).map((x) => [priceKey(x.slug, x.variante), x.precio])),
        may: null,
      };
      const s = getSession('mayorista');
      if (s) {
        const r = await sb('/rest/v1/precios_mayoristas?select=slug,variante,precio', {}, s.t);
        if (r.ok) out.may = new Map(((await r.json()) as Row[]).map((x) => [priceKey(x.slug, x.variante), x.precio]));
        else endSession('mayorista'); // token vencido o revocado: vuelve a la vista pública
      }
      return out;
    } catch {
      return null;
    }
  })());
}

const cop = (n: number) => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Precio a mostrar: mayorista (o null = "Consultar precio") en vista mayorista; público, o el del catálogo, en vista normal. */
export function priceFor(p: Prices | null, key: string, catalog: number | null): number | null {
  if (p?.may) return p.may.get(key) ?? null;
  const v = p?.pub.get(key);
  return typeof v === 'number' ? v : catalog;
}

export async function applyPrices() {
  if (!sbOn) return;
  const p = await loadPrices();
  if (!p) return;
  document.querySelectorAll<HTMLElement>('[data-product]').forEach((el) => {
    if (p.active.get(el.dataset.product!) === false) el.hidden = true;
  });
  const page = document.querySelector<HTMLElement>('[data-product-page]');
  if (page && p.active.get(page.dataset.productPage!) === false) { location.replace(page.dataset.back || '/'); return; }

  document.querySelectorAll<HTMLElement>('[data-sb-price]').forEach((el) => {
    const num = el.querySelector<HTMLElement>('[data-num]');
    if (!num) return;
    const orig = (el.dataset.orig ??= num.textContent || '');
    const [slug, variante = ''] = el.dataset.sbPrice!.split('|'); // "slug" o "slug|MODELO"
    const v = priceFor(p, priceKey(slug, variante), null);
    el.classList.toggle('is-ask', v == null && !!p.may);
    if (v == null) num.textContent = p.may ? 'Consultar precio' : orig;
    else num.textContent = (orig.startsWith('Desde ') ? 'Desde ' : '') + cop(v);
  });
  if (p.may) showWholesaleBar();
}

function showWholesaleBar() {
  if (document.querySelector('.may-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'may-bar';
  bar.setAttribute('role', 'status');
  const t = document.createElement('span');
  t.innerHTML = '<b>Vista mayorista activa</b><span class="may-bar__x"> · estás viendo precios mayoristas</span>';
  const out = document.createElement('button');
  out.type = 'button';
  out.className = 'may-bar__out';
  out.textContent = 'Cerrar sesión';
  out.addEventListener('click', () => { endSession('mayorista'); location.reload(); });
  bar.append(t, out);
  document.body.prepend(bar);
  document.documentElement.classList.add('is-may');
}

/** Normaliza lo que se escribe en un campo de precio: '' → null; '1.150.000' o '$ 49000' → número. NaN = inválido. */
export function parsePrice(raw: string): number | null {
  const s = raw.replace(/[\s$.]/g, '');
  if (s === '') return null;
  return /^\d{1,10}$/.test(s) && Number(s) <= 2_000_000_000 ? Number(s) : NaN;
}
