-- UBU Latinoamérica · esquema SUGERIDO de Supabase (NO se ha aplicado a ningún proyecto).
-- Motivo: al revisar el proyecto referenciado por el sitio anterior, las tablas `productos`,
-- `solicitudes` y `admins` no existen, por lo que el panel y los precios en vivo no funcionaban.
-- Revisa y ejecuta esto tú, en el proyecto correcto, desde el SQL Editor de Supabase.

create table if not exists public.productos (
  slug       text primary key,            -- = sbSlug en src/data/products.json
  nombre     text not null,
  categoria  text not null check (categoria in ('conectividad','hidrogel')),
  precio     integer not null check (precio >= 0),   -- COP
  desde      boolean not null default false,
  unidad     text,
  activo     boolean not null default true,
  orden      integer not null,            -- orden del catálogo PDF
  updated_at timestamptz not null default now()
);

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

create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);

alter table public.productos   enable row level security;
alter table public.solicitudes enable row level security;
alter table public.admins      enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- Productos: lectura pública solo de activos; escritura solo administradores.
create policy "productos_lectura_publica" on public.productos for select using (activo = true or public.is_admin());
create policy "productos_admin_escribe"   on public.productos for all    using (public.is_admin()) with check (public.is_admin());

-- Solicitudes: cualquiera puede INSERTAR (formulario); solo administradores pueden LEER/EDITAR.
create policy "solicitudes_insert_publico" on public.solicitudes for insert with check (true);
create policy "solicitudes_admin_lee"      on public.solicitudes for select using (public.is_admin());
create policy "solicitudes_admin_edita"    on public.solicitudes for update using (public.is_admin()) with check (public.is_admin());

-- Admins: cada usuario solo ve su propia fila; se agregan a mano desde el panel de Supabase.
create policy "admins_ve_su_fila" on public.admins for select using (user_id = auth.uid());
