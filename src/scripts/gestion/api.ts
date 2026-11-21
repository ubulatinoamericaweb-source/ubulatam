/* Acceso a Supabase para el panel de gestión. La autorización real está en la base de datos (RLS + funciones con
   _exigir_admin, ver supabase/gestion.sql); aquí solo se arma la petición con el token del administrador. */
import { sb, freshSession, endSession } from '../pricing';

/** Se lanza cuando la sesión venció y no se pudo renovar: la interfaz vuelve al ingreso. */
export class SessionLost extends Error { constructor() { super('Tu sesión venció. Ingresa de nuevo.'); } }

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const s = await freshSession('admin');
  if (!s) { lost(); throw new SessionLost(); }
  const r = await sb(path, init, s.t);
  if (r.ok) { const t = await r.text(); return (t ? JSON.parse(t) : null) as T; }
  const j = await r.json().catch(() => ({} as any));
  const txt = JSON.stringify(j);
  if (r.status === 401 && /jwt|expired/i.test(txt)) { lost(); throw new SessionLost(); }
  if (r.status === 401 || r.status === 403 || /42501|Sin permiso/.test(txt)) throw new Error('Sin permiso: esta cuenta no es administradora.');
  if (/does not exist|PGRST20[25]/.test(txt)) throw new Error('Falta ejecutar supabase/gestion.sql en Supabase.');
  // Mensajes de las funciones (raise exception) llegan en j.message y ya están en español
  throw new Error(j.message && j.code === 'P0001' ? j.message : /check/i.test(txt) ? 'Algún valor no es válido (números enteros, no negativos).' : `Error del servidor (${r.status}).`);
}
export const get = <T = any>(path: string) => api<T>(`/rest/v1/${path}`);
export const rpc = <T = any>(fn: string, args: object) => api<T>(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
export const upsert = (table: string, conflict: string, rows: object[]) =>
  api(`/rest/v1/${table}?on_conflict=${conflict}`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
export const insert = <T = any>(table: string, row: object) =>
  api<T[]>(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }).then((x) => x[0]);
export const patch = (table: string, filter: string, row: object) =>
  api(`/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
export const del = (table: string, filter: string) => api(`/rest/v1/${table}?${filter}`, { method: 'DELETE' });

function lost() { endSession('admin'); dispatchEvent(new CustomEvent('ubu:session-lost')); }
