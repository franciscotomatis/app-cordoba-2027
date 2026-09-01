-- Guarda el resto de los atributos que venían en el GeoJSON original y que
-- la primera importación descartaba (hacen falta para las fichas del mapa
-- y para la exportación a Excel).

alter table lotes
  add column if not exists lote_nombre text,
  add column if not exists campo text,
  add column if not exists campo_id text,
  add column if not exists departamento text,
  add column if not exists localidad text,
  add column if not exists fecha_siembra date,
  add column if not exists cultivo_anterior text,
  add column if not exists rendimiento_anterior numeric,
  add column if not exists hectareas_declaradas numeric,
  add column if not exists porcentaje_asegurado numeric,
  add column if not exists rendimiento_asegurado numeric,
  add column if not exists suma_asegurada numeric,
  add column if not exists estado text,
  add column if not exists fecha_creacion date;

create index if not exists lotes_cultivo_idx on lotes (cultivo);
create index if not exists lotes_departamento_idx on lotes (departamento);

-- Vista del mapa: agrega CUIT, zona y todos los campos nuevos.
drop view if exists public.lotes_mapa;
create view public.lotes_mapa
with (security_invoker = true) as
select
  l.id,
  l.id_lote_externo,
  l.cultivo,
  l.hectareas_aseguradas,
  l.hectareas_declaradas,
  l.porcentaje_asegurado,
  l.rendimiento_asegurado,
  l.suma_asegurada,
  l.cultivo_anterior,
  l.rendimiento_anterior,
  l.fecha_siembra,
  l.estado,
  l.lote_nombre,
  l.campo,
  l.departamento,
  l.localidad,
  l.cliente_id,
  l.zona_id,
  c.nombre as cliente_nombre,
  c.cuit as cliente_cuit,
  z.nombre as zona_nombre,
  st_asgeojson(l.geom)::json as geometry,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('causa', s.causa, 'fecha', s.fecha, 'danio_estimado', s.danio_estimado)
        order by s.fecha desc nulls last
      )
      from siniestros s
      where s.lote_id = l.id
    ),
    '[]'::jsonb
  ) as siniestros
from lotes l
left join clientes c on c.id = l.cliente_id
left join zonas z on z.id = l.zona_id;

-- Vista tabular: mismos campos nuevos, sin geometría.
drop view if exists public.lotes_tabla;
create view public.lotes_tabla
with (security_invoker = true) as
select
  l.id,
  l.id_lote_externo,
  l.lote_nombre,
  l.campo,
  l.departamento,
  l.localidad,
  l.cultivo,
  l.hectareas_aseguradas,
  l.hectareas_declaradas,
  l.suma_asegurada,
  l.estado,
  l.fecha_siembra,
  c.nombre as cliente_nombre,
  c.cuit as cliente_cuit,
  z.nombre as zona_nombre,
  st_y(st_centroid(l.geom))::float as lat,
  st_x(st_centroid(l.geom))::float as lon,
  exists (select 1 from siniestros s where s.lote_id = l.id) as tiene_siniestro
from lotes l
left join clientes c on c.id = l.cliente_id
left join zonas z on z.id = l.zona_id;

grant select on public.lotes_mapa, public.lotes_tabla to authenticated;
