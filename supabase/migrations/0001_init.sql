-- Esquema inicial: Programa Córdoba - lotes agrícolas, siniestros, fotos, roles.
create extension if not exists postgis;

create type user_role as enum ('admin', 'perito', 'cliente', 'lectura');

-- Clientes (productores) de la aseguradora.
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cuit text,
  created_at timestamptz not null default now()
);

-- Perfil de cada usuario autenticado, 1:1 con auth.users.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'lectura',
  cliente_id uuid references clientes(id),
  nombre_completo text,
  created_at timestamptz not null default now()
);

create table zonas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  hectareas_meta numeric not null default 0
);

create table lotes (
  id uuid primary key default gen_random_uuid(),
  id_lote_externo text unique, -- ID original de multiriesgo-cba.com
  cliente_id uuid references clientes(id),
  zona_id uuid references zonas(id),
  cultivo text,
  hectareas_aseguradas numeric,
  geom geometry(MultiPolygon, 4326) not null,
  origen text not null default 'scraping', -- 'scraping' | 'import_manual'
  actualizado_en timestamptz not null default now()
);
create index lotes_geom_idx on lotes using gist (geom);
create index lotes_cliente_idx on lotes (cliente_id);

create table siniestros (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid references lotes(id) on delete cascade,
  causa text,
  fecha date,
  danio_estimado numeric,
  actualizado_en timestamptz not null default now()
);

create table fotos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid references lotes(id) on delete set null,
  storage_path text not null,
  geom geometry(Point, 4326),
  subido_por uuid references profiles(id),
  nombre_original text,
  created_at timestamptz not null default now()
);
create index fotos_geom_idx on fotos using gist (geom);

-- ============================================
-- RLS
-- ============================================
alter table clientes enable row level security;
alter table profiles enable row level security;
alter table zonas enable row level security;
alter table lotes enable row level security;
alter table siniestros enable row level security;
alter table fotos enable row level security;

-- Helper: rol y cliente_id del usuario autenticado actual.
create or replace function auth_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function auth_cliente_id() returns uuid as $$
  select cliente_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- profiles: cada usuario ve/edita el suyo; admin ve todos.
create policy "profiles_select_own_or_admin" on profiles for select
  using (id = auth.uid() or auth_role() = 'admin');
create policy "profiles_update_admin" on profiles for update
  using (auth_role() = 'admin');
create policy "profiles_insert_admin" on profiles for insert
  with check (auth_role() = 'admin');

-- clientes, zonas: todo usuario autenticado puede leer; solo admin escribe.
create policy "clientes_select_all" on clientes for select using (true);
create policy "clientes_write_admin" on clientes for all using (auth_role() = 'admin');
create policy "zonas_select_all" on zonas for select using (true);
create policy "zonas_write_admin" on zonas for all using (auth_role() = 'admin');

-- lotes: admin/perito/lectura ven todo; cliente solo los suyos.
create policy "lotes_select" on lotes for select
  using (
    auth_role() in ('admin', 'perito', 'lectura')
    or (auth_role() = 'cliente' and cliente_id = auth_cliente_id())
  );
create policy "lotes_write_admin_perito" on lotes for all
  using (auth_role() in ('admin', 'perito'));

-- siniestros: mismas reglas de visibilidad que su lote.
create policy "siniestros_select" on siniestros for select
  using (
    exists (
      select 1 from lotes l
      where l.id = siniestros.lote_id
      and (
        auth_role() in ('admin', 'perito', 'lectura')
        or (auth_role() = 'cliente' and l.cliente_id = auth_cliente_id())
      )
    )
  );
create policy "siniestros_write_admin_perito" on siniestros for all
  using (auth_role() in ('admin', 'perito'));

-- fotos: admin/perito/lectura ven todas; cliente solo las de sus lotes; perito puede subir.
create policy "fotos_select" on fotos for select
  using (
    auth_role() in ('admin', 'perito', 'lectura')
    or (
      auth_role() = 'cliente'
      and exists (
        select 1 from lotes l
        where l.id = fotos.lote_id and l.cliente_id = auth_cliente_id()
      )
    )
  );
create policy "fotos_insert_perito_admin" on fotos for insert
  with check (auth_role() in ('admin', 'perito'));
create policy "fotos_delete_admin" on fotos for delete
  using (auth_role() = 'admin');
