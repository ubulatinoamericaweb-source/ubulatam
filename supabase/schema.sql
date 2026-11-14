-- UBU Latinoamérica · esquema de Supabase para catálogo, precios mayoristas y administración.
-- Aplícalo tú en el SQL Editor del proyecto (ksfabuzurjxofapqoonc). Es idempotente: se puede volver a ejecutar.
-- Después ejecuta supabase/seed.sql (carga los productos sin pisar lo que ya se haya editado).
--
-- Seguridad (todo se valida en la base de datos, no en el navegador):
--   · productos            → lectura pública (slug y activo); escritura solo administradores.
--   · precios              → precio de cliente final; lectura pública solo de productos activos; escritura solo admin.
--   · precios_mayoristas   → lectura solo mayoristas y admin; escritura solo admin. El visitante anónimo recibe 0 filas.
--   · admins / mayoristas  → qué usuarios de Supabase Auth tienen cada rol. Un mayorista NO es admin.
-- Los precios son enteros COP >= 0 (check en la tabla); null = sin precio configurado.

create table if not exists public.productos (
  slug       text primary key,                 -- = slug en src/data/products.json
  nombre     text not null,
  categoria  text not null check (categoria in ('conectividad','hidrogel')),
  orden      integer not null,                 -- orden del catálogo PDF
  activo     boolean not null default true,
  updated_at timestamptz not null default now()
);

-- variante = '' para productos de precio único; = modelo (p. ej. 'IPHONE X') en tablas de baterías.
create table if not exists public.precios (
  slug       text not null references public.productos(slug) on delete cascade,
  variante   text not null default '',
  precio     integer check (precio >= 0),
  updated_at timestamptz not null default now(),
  primary key (slug, variante)
);

create table if not exists public.precios_mayoristas (
  slug       text not null references public.productos(slug) on delete cascade,
  variante   text not null default '',
  precio     integer check (precio >= 0),
  updated_at timestamptz not null default now(),
  primary key (slug, variante)
);

create table if not exists public.admins     (user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists public.mayoristas (user_id uuid primary key references auth.users(id) on delete cascade);

alter table public.productos          enable row level security;
alter table public.precios            enable row level security;
alter table public.precios_mayoristas enable row level security;
alter table public.admins             enable row level security;
alter table public.mayoristas         enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

create or replace function public.is_mayorista() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.mayoristas where user_id = auth.uid()) $$;

-- Rol de la sesión actual para la interfaz ('admin' | 'mayorista' | null). Admin tiene prioridad.
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as
$$ select case when public.is_admin() then 'admin' when public.is_mayorista() then 'mayorista' end $$;

create or replace function public.producto_activo(s text) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select activo from public.productos where slug = s), false) $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists t_productos on public.productos;
create trigger t_productos before update on public.productos for each row execute function public.touch_updated_at();
drop trigger if exists t_precios on public.precios;
create trigger t_precios before update on public.precios for each row execute function public.touch_updated_at();
drop trigger if exists t_precios_may on public.precios_mayoristas;
create trigger t_precios_may before update on public.precios_mayoristas for each row execute function public.touch_updated_at();

-- Políticas (se recrean para que el script sea re-ejecutable).
drop policy if exists "productos_lectura_publica" on public.productos;
drop policy if exists "productos_admin_escribe"   on public.productos;
create policy "productos_lectura_publica" on public.productos for select using (true);
create policy "productos_admin_escribe"   on public.productos for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "precios_lectura" on public.precios;
drop policy if exists "precios_admin"   on public.precios;
create policy "precios_lectura" on public.precios for select using (public.producto_activo(slug) or public.is_admin());
create policy "precios_admin"   on public.precios for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "precios_may_lectura" on public.precios_mayoristas;
drop policy if exists "precios_may_admin"   on public.precios_mayoristas;
create policy "precios_may_lectura" on public.precios_mayoristas for select
  using (public.is_admin() or (public.is_mayorista() and public.producto_activo(slug)));
create policy "precios_may_admin"   on public.precios_mayoristas for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins_ve_su_fila"     on public.admins;
drop policy if exists "mayoristas_ve_su_fila" on public.mayoristas;
create policy "admins_ve_su_fila"     on public.admins     for select using (user_id = auth.uid());
create policy "mayoristas_ve_su_fila" on public.mayoristas for select using (user_id = auth.uid());

-- Nadie anónimo puede escribir aunque se equivoque una política.
revoke insert, update, delete on public.productos, public.precios, public.precios_mayoristas, public.admins, public.mayoristas from anon;
grant execute on function public.mi_rol() to anon, authenticated;

-- Tabla de solicitudes del formulario de contacto (sin cambios respecto a la versión anterior).
create table if not exists public.solicitudes (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  tipo             text,
  nombre           text not null check (char_length(nombre) <= 80),
  ciudad           text check (char_length(ciudad) <= 60),
  tipo_cliente     text,
  productos        text check (char_length(productos) <= 2000),
  mensaje          text check (char_length(mensaje) <= 600),
  acepta_comercial boolean not null default false,
  estado           text not null default 'nueva'
);
alter table public.solicitudes enable row level security;
drop policy if exists "solicitudes_insert_publico" on public.solicitudes;
drop policy if exists "solicitudes_admin_lee"      on public.solicitudes;
drop policy if exists "solicitudes_admin_edita"    on public.solicitudes;
create policy "solicitudes_insert_publico" on public.solicitudes for insert with check (true);
create policy "solicitudes_admin_lee"      on public.solicitudes for select using (public.is_admin());
create policy "solicitudes_admin_edita"    on public.solicitudes for update using (public.is_admin()) with check (public.is_admin());
