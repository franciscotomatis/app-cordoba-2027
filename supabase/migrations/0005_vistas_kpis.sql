-- Vistas agregadas para el dashboard. security_invoker => respetan RLS del usuario.

create or replace view public.kpi_cultivos
with (security_invoker = true) as
select
  coalesce(nullif(trim(cultivo), ''), 'Sin especificar') as cultivo,
  sum(coalesce(hectareas_aseguradas, 0))::numeric as hectareas,
  count(*)::bigint as lotes
from lotes
group by 1;

create or replace view public.kpi_zonas
with (security_invoker = true) as
select
  z.id,
  z.nombre,
  z.hectareas_meta::numeric as meta,
  coalesce(sum(l.hectareas_aseguradas), 0)::numeric as real
from zonas z
left join lotes l on l.zona_id = z.id
group by z.id, z.nombre, z.hectareas_meta;

create or replace view public.kpi_causas
with (security_invoker = true) as
select
  coalesce(nullif(trim(causa), ''), 'Sin causa') as causa,
  count(*)::bigint as cantidad
from siniestros
group by 1;

create or replace view public.clientes_resumen
with (security_invoker = true) as
select
  c.id,
  c.nombre,
  c.cuit,
  count(l.id)::bigint as lotes,
  coalesce(sum(l.hectareas_aseguradas), 0)::numeric as hectareas
from clientes c
left join lotes l on l.cliente_id = c.id
group by c.id, c.nombre, c.cuit;

create or replace view public.lotes_tabla
with (security_invoker = true) as
select
  l.id,
  l.id_lote_externo,
  l.cultivo,
  l.hectareas_aseguradas,
  c.nombre as cliente_nombre,
  z.nombre as zona_nombre,
  st_y(st_centroid(l.geom))::float as lat,
  st_x(st_centroid(l.geom))::float as lon,
  exists (select 1 from siniestros s where s.lote_id = l.id) as tiene_siniestro
from lotes l
left join clientes c on c.id = l.cliente_id
left join zonas z on z.id = l.zona_id;

grant select on public.kpi_cultivos, public.kpi_zonas, public.kpi_causas,
  public.clientes_resumen, public.lotes_tabla to authenticated;
