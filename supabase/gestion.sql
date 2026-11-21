-- UBU Latinoamérica · módulo de GESTIÓN (inventario, POS, cotizaciones, facturas, remisiones, clientes, cartera, gastos).
-- Ejecútalo en el SQL Editor de Supabase (jzezcxrwmfdebmibzoln) DESPUÉS de schema.sql / migracion-jzez.sql.
-- Idempotente: se puede volver a ejecutar sin perder datos.
--
-- Seguridad: todo es solo para administradores (RLS con public.is_admin()). Documentos, ítems, pagos, stock y kardex
-- NO se escriben directo desde el navegador: solo a través de las funciones de abajo, que validan, calculan totales
-- en el servidor, asignan el consecutivo y mueven el inventario en una sola transacción.
-- Los documentos son internos (cotización, factura de venta POS, remisión): NO son factura electrónica DIAN.

-- ---------- Tablas ----------
create table if not exists public.terceros (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null default 'cliente' check (tipo in ('cliente','mayorista','proveedor')),
  nombre     text not null check (char_length(nombre) between 1 and 120),
  documento  text check (char_length(documento) <= 30),
  telefono   text check (char_length(telefono) <= 30),
  email      text check (char_length(email) <= 120),
  ciudad     text check (char_length(ciudad) <= 80),
  direccion  text check (char_length(direccion) <= 160),
  notas      text check (char_length(notas) <= 600),
  created_at timestamptz not null default now()
);

create table if not exists public.inventario (
  slug       text not null references public.productos(slug) on delete cascade,
  variante   text not null default '',
  stock      integer not null default 0,
  costo      integer not null default 0 check (costo >= 0),
  minimo     integer not null default 0 check (minimo >= 0),
  updated_at timestamptz not null default now(),
  primary key (slug, variante)
);

create table if not exists public.kardex (
  id        bigint generated always as identity primary key,
  fecha     timestamptz not null default now(),
  slug      text not null,
  variante  text not null default '',
  tipo      text not null,            -- entrada | ajuste | venta | anulacion | garantia
  cantidad  integer not null,         -- + entra, - sale
  saldo     integer not null,
  ref       text,
  nota      text
);

create table if not exists public.consecutivos (
  tipo      text primary key,
  prefijo   text not null,
  siguiente integer not null default 1
);
insert into public.consecutivos (tipo, prefijo) values ('cotizacion','COT'),('factura','FV'),('remision','REM')
on conflict (tipo) do nothing;

create table if not exists public.documentos (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('cotizacion','factura','remision')),
  numero     text not null unique,
  fecha      timestamptz not null default now(),
  tercero_id uuid references public.terceros(id) on delete set null,
  cliente    jsonb not null default '{}',  -- copia de los datos del cliente al momento de emitir
  lista      text not null default 'publico' check (lista in ('publico','mayorista')),
  subtotal   integer not null check (subtotal >= 0),
  descuento  integer not null default 0 check (descuento >= 0),
  total      integer not null check (total >= 0),
  estado     text not null,                -- vigente | convertida | pendiente | parcial | pagada | anulada
  vence      date,
  notas      text,
  motivo_anulacion text,
  origen_id  uuid references public.documentos(id) on delete set null
);
create index if not exists documentos_fecha on public.documentos (fecha desc);

create table if not exists public.documento_items (
  id           bigint generated always as identity primary key,
  documento_id uuid not null references public.documentos(id) on delete cascade,
  slug         text not null,
  variante     text not null default '',
  nombre       text not null,
  cantidad     integer not null check (cantidad > 0),
  precio       integer not null check (precio >= 0),
  costo        integer not null default 0,
  total        integer not null
);
create index if not exists items_doc on public.documento_items (documento_id);

create table if not exists public.pagos (
  id           bigint generated always as identity primary key,
  documento_id uuid not null references public.documentos(id) on delete cascade,
  fecha        timestamptz not null default now(),
  valor        integer not null check (valor > 0),
  metodo       text not null check (metodo in ('efectivo','transferencia','nequi','daviplata','tarjeta','otro')),
  nota         text
);
create index if not exists pagos_doc on public.pagos (documento_id);

create table if not exists public.gastos (
  id          bigint generated always as identity primary key,
  fecha       date not null default current_date,
  categoria   text not null check (char_length(categoria) between 1 and 60),
  descripcion text check (char_length(descripcion) <= 300),
  valor       integer not null check (valor > 0),
  metodo      text not null default 'efectivo'
);

-- Cartera: cuánto se ha pagado y cuánto falta en cada documento.
create or replace view public.v_documentos with (security_invoker = on) as
select d.*, coalesce(p.pagado, 0)::int as pagado,
       case when d.tipo = 'cotizacion' or d.estado = 'anulada' then 0 else greatest(d.total - coalesce(p.pagado, 0), 0) end::int as saldo
from public.documentos d
left join (select documento_id, sum(valor) as pagado from public.pagos group by documento_id) p on p.documento_id = d.id;

-- ---------- RLS: solo administradores leen; terceros y gastos también se editan directo ----------
alter table public.terceros        enable row level security;
alter table public.inventario      enable row level security;
alter table public.kardex          enable row level security;
alter table public.consecutivos    enable row level security;
alter table public.documentos      enable row level security;
alter table public.documento_items enable row level security;
alter table public.pagos           enable row level security;
alter table public.gastos          enable row level security;

do $$ declare t text; begin
  foreach t in array array['inventario','kardex','consecutivos','documentos','documento_items','pagos'] loop
    execute format('drop policy if exists "%1$s_admin_lee" on public.%1$s', t);
    execute format('create policy "%1$s_admin_lee" on public.%1$s for select using (public.is_admin())', t);
  end loop;
  foreach t in array array['terceros','gastos'] loop
    execute format('drop policy if exists "%1$s_admin" on public.%1$s', t);
    execute format('create policy "%1$s_admin" on public.%1$s for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
revoke all on public.terceros, public.inventario, public.kardex, public.consecutivos, public.documentos,
  public.documento_items, public.pagos, public.gastos, public.v_documentos from anon;

-- ---------- Funciones ----------
create or replace function public._exigir_admin() returns void language plpgsql stable security definer set search_path = public as
$$ begin if not public.is_admin() then raise exception 'Sin permiso' using errcode = '42501'; end if; end $$;

-- Mueve stock y deja rastro en el kardex. Crea la fila de inventario si no existe.
create or replace function public._mover_stock(s text, v text, cant integer, t text, r text, n text) returns void
language plpgsql security definer set search_path = public as $$
declare nuevo integer;
begin
  insert into public.inventario (slug, variante, stock) values (s, coalesce(v, ''), cant)
  on conflict (slug, variante) do update set stock = public.inventario.stock + cant, updated_at = now()
  returning stock into nuevo;
  insert into public.kardex (slug, variante, tipo, cantidad, saldo, ref, nota) values (s, coalesce(v, ''), t, cant, nuevo, r, n);
end $$;

create or replace function public._estado_pago(doc uuid) returns void language plpgsql security definer set search_path = public as $$
declare tot integer; pag integer;
begin
  select total into tot from public.documentos where id = doc;
  select coalesce(sum(valor), 0) into pag from public.pagos where documento_id = doc;
  update public.documentos set estado = case when pag >= tot then 'pagada' when pag > 0 then 'parcial' else 'pendiente' end
  where id = doc and tipo <> 'cotizacion' and estado <> 'anulada';
end $$;

-- Emite cotización, factura o remisión. p = {tipo, tercero_id?, cliente{}, lista, items:[{slug,variante,nombre,cantidad,precio}],
--   descuento?, notas?, vence?, origen_id?, pago?:{valor, metodo}}. Devuelve {id, numero}.
create or replace function public.emitir_documento(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t text := p->>'tipo'; doc uuid; num text; sub integer := 0; des integer := coalesce((p->>'descuento')::int, 0);
  it jsonb; c integer; pr integer; pago integer := coalesce((p->'pago'->>'valor')::int, 0);
begin
  perform public._exigir_admin();
  if t not in ('cotizacion','factura','remision') then raise exception 'Tipo de documento inválido'; end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then raise exception 'El documento no tiene productos'; end if;
  if jsonb_array_length(p->'items') > 200 then raise exception 'Máximo 200 líneas por documento'; end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    c := (it->>'cantidad')::int; pr := (it->>'precio')::int;
    if c is null or c <= 0 or c > 100000 then raise exception 'Cantidad inválida en %', it->>'nombre'; end if;
    if pr is null or pr < 0 then raise exception 'Precio inválido en %', it->>'nombre'; end if;
    sub := sub + c * pr;
  end loop;
  if des < 0 or des > sub then raise exception 'Descuento inválido'; end if;
  if pago < 0 or pago > sub - des then raise exception 'El pago no puede superar el total'; end if;
  if t = 'cotizacion' and pago > 0 then raise exception 'Una cotización no recibe pagos'; end if;

  update public.consecutivos set siguiente = siguiente + 1 where tipo = t returning prefijo || '-' || (siguiente - 1) into num;

  insert into public.documentos (tipo, numero, tercero_id, cliente, lista, subtotal, descuento, total, estado, vence, notas, origen_id)
  values (t, num, nullif(p->>'tercero_id','')::uuid, coalesce(p->'cliente','{}'), coalesce(p->>'lista','publico'),
          sub, des, sub - des, case when t = 'cotizacion' then 'vigente' else 'pendiente' end,
          nullif(p->>'vence','')::date, left(p->>'notas', 600), nullif(p->>'origen_id','')::uuid)
  returning id into doc;

  insert into public.documento_items (documento_id, slug, variante, nombre, cantidad, precio, costo, total)
  select doc, i->>'slug', coalesce(i->>'variante',''), left(i->>'nombre', 160), (i->>'cantidad')::int, (i->>'precio')::int,
         coalesce((select costo from public.inventario v where v.slug = i->>'slug' and v.variante = coalesce(i->>'variante','')), 0),
         (i->>'cantidad')::int * (i->>'precio')::int
  from jsonb_array_elements(p->'items') i;

  if t in ('factura','remision') then
    for it in select * from jsonb_array_elements(p->'items') loop
      perform public._mover_stock(it->>'slug', coalesce(it->>'variante',''), -(it->>'cantidad')::int, 'venta', num, null);
    end loop;
    if pago > 0 then
      insert into public.pagos (documento_id, valor, metodo) values (doc, pago, coalesce(p->'pago'->>'metodo','efectivo'));
    end if;
    perform public._estado_pago(doc);
    if p->>'origen_id' is not null then
      update public.documentos set estado = 'convertida' where id = (p->>'origen_id')::uuid and tipo = 'cotizacion';
    end if;
  end if;
  return jsonb_build_object('id', doc, 'numero', num);
end $$;

create or replace function public.registrar_pago(doc uuid, valor integer, metodo text, nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare d record; pag integer;
begin
  perform public._exigir_admin();
  select * into d from public.documentos where id = doc for update;
  if d is null or d.tipo = 'cotizacion' or d.estado = 'anulada' then raise exception 'Documento no admite pagos'; end if;
  select coalesce(sum(p.valor), 0) into pag from public.pagos p where documento_id = doc;
  if valor is null or valor <= 0 or valor > d.total - pag then raise exception 'El abono debe ser mayor a 0 y no superar el saldo (%)', d.total - pag; end if;
  insert into public.pagos (documento_id, valor, metodo, nota) values (doc, valor, metodo, left(nota, 300));
  perform public._estado_pago(doc);
end $$;

-- Anula: devuelve el stock de facturas/remisiones y deja el motivo. Los pagos quedan registrados pero el documento sale de ventas y cartera.
create or replace function public.anular_documento(doc uuid, motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare d record; it record;
begin
  perform public._exigir_admin();
  if coalesce(trim(motivo), '') = '' then raise exception 'Escribe el motivo de la anulación'; end if;
  select * into d from public.documentos where id = doc for update;
  if d is null or d.estado = 'anulada' then raise exception 'El documento ya está anulado o no existe'; end if;
  if d.tipo in ('factura','remision') then
    for it in select * from public.documento_items where documento_id = doc loop
      perform public._mover_stock(it.slug, it.variante, it.cantidad, 'anulacion', d.numero, motivo);
    end loop;
  end if;
  update public.documentos set estado = 'anulada', motivo_anulacion = left(motivo, 300) where id = doc;
end $$;

-- Entrada de mercancía o ajuste de inventario (cantidad con signo). Costo y mínimo opcionales.
create or replace function public.ajustar_inventario(s text, v text, cantidad integer, tipo text, nota text default null,
  nuevo_costo integer default null, nuevo_minimo integer default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir_admin();
  if tipo not in ('entrada','ajuste') then raise exception 'Tipo inválido'; end if;
  if cantidad is null or abs(cantidad) > 1000000 then raise exception 'Cantidad inválida'; end if;
  if tipo = 'entrada' and cantidad <= 0 then raise exception 'Una entrada debe ser mayor a 0'; end if;
  if nuevo_costo is not null and nuevo_costo < 0 or nuevo_minimo is not null and nuevo_minimo < 0 then raise exception 'Costo o mínimo inválido'; end if;
  if cantidad <> 0 then perform public._mover_stock(s, coalesce(v,''), cantidad, tipo, null, left(nota, 300)); end if;
  insert into public.inventario (slug, variante, costo, minimo) values (s, coalesce(v,''), coalesce(nuevo_costo, 0), coalesce(nuevo_minimo, 0))
  on conflict (slug, variante) do update set costo = coalesce(nuevo_costo, public.inventario.costo),
    minimo = coalesce(nuevo_minimo, public.inventario.minimo), updated_at = now();
end $$;

revoke execute on function public._mover_stock(text,text,integer,text,text,text), public._estado_pago(uuid) from public, anon, authenticated;
revoke execute on function public.emitir_documento(jsonb), public.registrar_pago(uuid,integer,text,text),
  public.anular_documento(uuid,text), public.ajustar_inventario(text,text,integer,text,text,integer,integer) from public, anon;
grant execute on function public.emitir_documento(jsonb), public.registrar_pago(uuid,integer,text,text),
  public.anular_documento(uuid,text), public.ajustar_inventario(text,text,integer,text,text,integer,integer) to authenticated;

-- ---------- Dos listas de precios ----------
-- Los precios que hoy publica la web pasan a ser la lista MAYORISTA (solo llena las que están vacías; no pisa ediciones).
-- La lista de cliente final se carga desde el admin (Catálogo y precios) cuando llegue el catálogo de cliente final.
insert into public.precios_mayoristas (slug, variante, precio)
select slug, variante, precio from public.precios where precio is not null
on conflict (slug, variante) do update set precio = excluded.precio where public.precios_mayoristas.precio is null;


-- =====================================================================================================
-- FASE 2 · garantías, compras a proveedores (cuentas por pagar) y caja (apertura/cierre).
-- =====================================================================================================
create table if not exists public.garantias (
  id           bigint generated always as identity primary key,
  fecha        timestamptz not null default now(),
  tercero_id   uuid references public.terceros(id) on delete set null,
  cliente      jsonb not null default '{}',
  documento_id uuid references public.documentos(id) on delete set null,
  slug         text not null,
  variante     text not null default '',
  nombre       text not null,
  cantidad     integer not null default 1 check (cantidad > 0),
  falla        text not null check (char_length(falla) between 1 and 600),
  estado       text not null default 'recibida' check (estado in ('recibida','en_revision','cambiada','reparada','rechazada','entregada')),
  resolucion   text,
  cerrada_en   timestamptz
);

create table if not exists public.compras (
  id           uuid primary key default gen_random_uuid(),
  numero       text not null unique,
  fecha        timestamptz not null default now(),
  proveedor_id uuid references public.terceros(id) on delete set null,
  proveedor    text not null,
  factura_prov text,
  total        integer not null check (total >= 0),
  vence        date,
  notas        text,
  estado       text not null default 'pendiente'   -- pendiente | parcial | pagada | anulada
);
create table if not exists public.compra_items (
  id        bigint generated always as identity primary key,
  compra_id uuid not null references public.compras(id) on delete cascade,
  slug      text not null,
  variante  text not null default '',
  nombre    text not null,
  cantidad  integer not null check (cantidad > 0),
  costo     integer not null check (costo >= 0),
  total     integer not null
);
create table if not exists public.pagos_compras (
  id        bigint generated always as identity primary key,
  compra_id uuid not null references public.compras(id) on delete cascade,
  fecha     timestamptz not null default now(),
  valor     integer not null check (valor > 0),
  metodo    text not null,
  nota      text
);
create or replace view public.v_compras with (security_invoker = on) as
select c.*, coalesce(p.pagado, 0)::int as pagado,
       case when c.estado = 'anulada' then 0 else greatest(c.total - coalesce(p.pagado, 0), 0) end::int as saldo
from public.compras c left join (select compra_id, sum(valor) pagado from public.pagos_compras group by compra_id) p on p.compra_id = c.id;

create table if not exists public.cajas (
  id          bigint generated always as identity primary key,
  abierta_en  timestamptz not null default now(),
  base        integer not null check (base >= 0),
  cerrada_en  timestamptz,
  esperado    integer,     -- base + cobros en efectivo − gastos en efectivo − pagos a proveedores en efectivo
  contado     integer check (contado >= 0),
  diferencia  integer,
  resumen     jsonb,
  notas       text
);
create unique index if not exists una_caja_abierta on public.cajas ((true)) where cerrada_en is null;

insert into public.consecutivos (tipo, prefijo) values ('compra','OC') on conflict (tipo) do nothing;

alter table public.garantias     enable row level security;
alter table public.compras       enable row level security;
alter table public.compra_items  enable row level security;
alter table public.pagos_compras enable row level security;
alter table public.cajas         enable row level security;
do $$ declare t text; begin
  foreach t in array array['compras','compra_items','pagos_compras','cajas'] loop
    execute format('drop policy if exists "%1$s_admin_lee" on public.%1$s', t);
    execute format('create policy "%1$s_admin_lee" on public.%1$s for select using (public.is_admin())', t);
  end loop;
  drop policy if exists "garantias_admin" on public.garantias;
  create policy "garantias_admin" on public.garantias for all using (public.is_admin()) with check (public.is_admin());
end $$;
revoke all on public.garantias, public.compras, public.compra_items, public.pagos_compras, public.cajas, public.v_compras from anon;

-- Compra a proveedor: entra el stock y el costo pasa a ser el PROMEDIO PONDERADO (stock anterior positivo × costo anterior + compra).
-- p = {proveedor_id?, proveedor, factura_prov?, vence?, notas?, items:[{slug,variante,nombre,cantidad,costo}], pago?:{valor,metodo}}
create or replace function public.registrar_compra(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c uuid; num text; tot integer := 0; it jsonb; q integer; k integer; st integer; co integer;
  pago integer := coalesce((p->'pago'->>'valor')::int, 0);
begin
  perform public._exigir_admin();
  if coalesce(trim(p->>'proveedor'), '') = '' then raise exception 'Indica el proveedor'; end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then raise exception 'La compra no tiene productos'; end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    q := (it->>'cantidad')::int; k := (it->>'costo')::int;
    if q is null or q <= 0 or q > 1000000 or k is null or k < 0 then raise exception 'Cantidad o costo inválido en %', it->>'nombre'; end if;
    tot := tot + q * k;
  end loop;
  if pago < 0 or pago > tot then raise exception 'El pago no puede superar el total'; end if;
  update public.consecutivos set siguiente = siguiente + 1 where tipo = 'compra' returning prefijo || '-' || (siguiente - 1) into num;
  insert into public.compras (numero, proveedor_id, proveedor, factura_prov, total, vence, notas)
  values (num, nullif(p->>'proveedor_id','')::uuid, left(p->>'proveedor', 120), left(p->>'factura_prov', 40), tot,
          nullif(p->>'vence','')::date, left(p->>'notas', 600))
  returning id into c;
  for it in select * from jsonb_array_elements(p->'items') loop
    q := (it->>'cantidad')::int; k := (it->>'costo')::int; st := null; co := null;
    insert into public.compra_items (compra_id, slug, variante, nombre, cantidad, costo, total)
    values (c, it->>'slug', coalesce(it->>'variante',''), left(it->>'nombre', 160), q, k, q * k);
    select stock, costo into st, co from public.inventario where slug = it->>'slug' and variante = coalesce(it->>'variante','');
    perform public._mover_stock(it->>'slug', coalesce(it->>'variante',''), q, 'entrada', num, left(p->>'proveedor', 120));
    update public.inventario set costo = case when coalesce(st, 0) > 0
        then round((st::numeric * co + q::numeric * k) / (st + q))::int else k end
    where slug = it->>'slug' and variante = coalesce(it->>'variante','');
  end loop;
  if pago > 0 then
    insert into public.pagos_compras (compra_id, valor, metodo) values (c, pago, coalesce(p->'pago'->>'metodo','efectivo'));
  end if;
  update public.compras set estado = case when pago >= tot then 'pagada' when pago > 0 then 'parcial' else 'pendiente' end where id = c;
  return jsonb_build_object('id', c, 'numero', num);
end $$;

create or replace function public.pagar_compra(c uuid, valor integer, metodo text, nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare d record; pag integer;
begin
  perform public._exigir_admin();
  select * into d from public.compras where id = c for update;
  if d is null or d.estado = 'anulada' then raise exception 'Compra no admite pagos'; end if;
  select coalesce(sum(x.valor), 0) into pag from public.pagos_compras x where x.compra_id = c;
  if valor is null or valor <= 0 or valor > d.total - pag then raise exception 'El pago debe ser mayor a 0 y no superar el saldo (%)', d.total - pag; end if;
  insert into public.pagos_compras (compra_id, valor, metodo, nota) values (c, valor, metodo, left(nota, 300));
  update public.compras set estado = case when pag + valor >= d.total then 'pagada' else 'parcial' end where id = c;
end $$;

-- Anular compra: saca de nuevo el stock que entró (el costo promedio no se recalcula).
create or replace function public.anular_compra(c uuid, motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare d record; it record;
begin
  perform public._exigir_admin();
  if coalesce(trim(motivo), '') = '' then raise exception 'Escribe el motivo de la anulación'; end if;
  select * into d from public.compras where id = c for update;
  if d is null or d.estado = 'anulada' then raise exception 'La compra ya está anulada o no existe'; end if;
  for it in select * from public.compra_items where compra_id = c loop
    perform public._mover_stock(it.slug, it.variante, -it.cantidad, 'anulacion', d.numero, motivo);
  end loop;
  update public.compras set estado = 'anulada', notas = coalesce(notas || ' · ', '') || 'Anulada: ' || left(motivo, 300) where id = c;
end $$;

-- Cambio de estado de una garantía. 'cambiada' entrega un producto nuevo: descuenta stock (kardex tipo garantia).
create or replace function public.resolver_garantia(g bigint, nuevo text, resolucion text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform public._exigir_admin();
  select * into r from public.garantias where id = g for update;
  if r is null then raise exception 'Garantía no encontrada'; end if;
  if nuevo not in ('recibida','en_revision','cambiada','reparada','rechazada','entregada') then raise exception 'Estado inválido'; end if;
  if r.estado in ('cambiada','reparada','rechazada','entregada') and nuevo <> 'entregada' then raise exception 'La garantía ya fue resuelta'; end if;
  if nuevo = 'cambiada' then
    perform public._mover_stock(r.slug, r.variante, -r.cantidad, 'garantia', 'GAR-' || g, left(resolucion, 300));
  end if;
  update public.garantias set estado = nuevo, resolucion = coalesce(left(resolver_garantia.resolucion, 600), garantias.resolucion),
    cerrada_en = case when nuevo in ('cambiada','reparada','rechazada','entregada') then coalesce(cerrada_en, now()) else null end
  where id = g;
end $$;

create or replace function public.abrir_caja(base integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  perform public._exigir_admin();
  if abrir_caja.base is null or abrir_caja.base < 0 then raise exception 'Base inválida'; end if;
  if exists (select 1 from public.cajas where cerrada_en is null) then raise exception 'Ya hay una caja abierta'; end if;
  insert into public.cajas (base) values (abrir_caja.base) returning id into i;
  return i;
end $$;

-- Cierre: el esperado lo calcula el servidor con los movimientos en EFECTIVO desde la apertura.
create or replace function public.cerrar_caja(contado integer, notas text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record; cob integer; gas integer; pro integer; esp integer; res jsonb;
begin
  perform public._exigir_admin();
  if cerrar_caja.contado is null or cerrar_caja.contado < 0 then raise exception 'Valor contado inválido'; end if;
  select * into c from public.cajas where cerrada_en is null for update;
  if c is null then raise exception 'No hay caja abierta'; end if;
  select coalesce(sum(p.valor), 0) into cob from public.pagos p join public.documentos d on d.id = p.documento_id
    where p.fecha >= c.abierta_en and p.metodo = 'efectivo' and d.estado <> 'anulada';
  -- shortcut: los gastos solo tienen fecha (sin hora): cuenta los del día de apertura en adelante.
  select coalesce(sum(valor), 0) into gas from public.gastos where metodo = 'efectivo' and fecha >= (c.abierta_en at time zone 'America/Bogota')::date;
  select coalesce(sum(valor), 0) into pro from public.pagos_compras where metodo = 'efectivo' and fecha >= c.abierta_en;
  esp := c.base + cob - gas - pro;
  res := jsonb_build_object('base', c.base, 'cobros_efectivo', cob, 'gastos_efectivo', gas, 'pagos_proveedores_efectivo', pro,
    'por_metodo', (select coalesce(jsonb_object_agg(x.metodo, x.v), '{}') from (select p.metodo, sum(p.valor) v from public.pagos p
       join public.documentos d on d.id = p.documento_id where p.fecha >= c.abierta_en and d.estado <> 'anulada' group by p.metodo) x));
  update public.cajas set cerrada_en = now(), esperado = esp, contado = cerrar_caja.contado, diferencia = cerrar_caja.contado - esp,
    resumen = res, notas = left(cerrar_caja.notas, 600) where id = c.id;
  return res || jsonb_build_object('esperado', esp, 'contado', cerrar_caja.contado, 'diferencia', cerrar_caja.contado - esp);
end $$;

revoke execute on function public.registrar_compra(jsonb), public.pagar_compra(uuid,integer,text,text), public.anular_compra(uuid,text),
  public.resolver_garantia(bigint,text,text), public.abrir_caja(integer), public.cerrar_caja(integer,text) from public, anon;
grant execute on function public.registrar_compra(jsonb), public.pagar_compra(uuid,integer,text,text), public.anular_compra(uuid,text),
  public.resolver_garantia(bigint,text,text), public.abrir_caja(integer), public.cerrar_caja(integer,text) to authenticated;
