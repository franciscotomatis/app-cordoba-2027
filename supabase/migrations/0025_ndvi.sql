-- Serie de NDVI por lote. Se pide una sola vez por lote a la API estadística
-- de Copernicus (que devuelve toda la campaña en un pedido) y queda guardada:
-- pedir una imagen por lote y por fecha gastaría la cuota mensual en un día.
create table if not exists ndvi_lote (
  lote_id uuid not null references lotes(id) on delete cascade,
  fecha date not null,
  ndvi numeric not null,
  nubosidad numeric,
  primary key (lote_id, fecha)
);

alter table ndvi_lote enable row level security;

-- Se ve si se ve el lote: la política mira el lote, no el NDVI.
drop policy if exists "ndvi_select" on ndvi_lote;
create policy "ndvi_select" on ndvi_lote for select
  using (
    exists (select 1 from lotes l where l.id = ndvi_lote.lote_id)
  );

drop policy if exists "ndvi_write" on ndvi_lote;
create policy "ndvi_write" on ndvi_lote for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists ndvi_lote_fecha_idx on ndvi_lote (lote_id, fecha);

-- Registro de cuándo se pidió la serie de cada lote, para no repetir el pedido
-- cada vez que alguien abre la ficha.
create table if not exists ndvi_consulta (
  lote_id uuid primary key references lotes(id) on delete cascade,
  desde date not null,
  hasta date not null,
  consultado_en timestamptz not null default now(),
  fechas int not null default 0,
  error text
);

alter table ndvi_consulta enable row level security;

drop policy if exists "ndvi_consulta_todo" on ndvi_consulta;
create policy "ndvi_consulta_todo" on ndvi_consulta for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
