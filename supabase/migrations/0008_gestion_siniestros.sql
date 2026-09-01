-- Gestión de siniestros: estado del caso, asignación a un perito y vista de trabajo.

alter table siniestros
  add column if not exists estado text not null default 'DENUNCIADO',
  add column if not exists perito_id uuid references profiles(id) on delete set null,
  add column if not exists asignado_en timestamptz,
  add column if not exists notas text,
  add column if not exists actualizado_por uuid references profiles(id) on delete set null;

alter table siniestros drop constraint if exists siniestros_estado_check;
alter table siniestros add constraint siniestros_estado_check
  check (estado in ('DENUNCIADO', 'PENDIENTE_INSPECCION', 'CERRADO', 'PAGADO'));

create index if not exists siniestros_estado_idx on siniestros (estado);
create index if not exists siniestros_perito_idx on siniestros (perito_id);

-- Vista de trabajo: un caso por fila, con los datos del lote, del asegurado,
-- del perito asignado y la cantidad de fotos ya cargadas.
drop view if exists public.siniestros_gestion;
create view public.siniestros_gestion
with (security_invoker = true) as
select
  s.id,
  s.causa,
  s.fecha,
  s.danio_estimado,
  s.estado,
  s.perito_id,
  s.asignado_en,
  s.notas,
  pe.email as perito_email,
  pe.nombre_completo as perito_nombre,
  l.id as lote_id,
  l.id_lote_externo,
  l.lote_nombre,
  l.campo,
  l.departamento,
  l.localidad,
  l.cultivo,
  l.hectareas_aseguradas,
  l.hectareas_declaradas,
  l.suma_asegurada,
  l.rendimiento_asegurado,
  l.fecha_siembra,
  c.nombre as cliente_nombre,
  c.cuit as cliente_cuit,
  z.nombre as zona_nombre,
  st_y(st_centroid(l.geom))::float as lat,
  st_x(st_centroid(l.geom))::float as lon,
  (select count(*) from fotos f where f.lote_id = l.id)::int as fotos
from siniestros s
join lotes l on l.id = s.lote_id
left join clientes c on c.id = l.cliente_id
left join zonas z on z.id = l.zona_id
left join profiles pe on pe.id = s.perito_id;

-- Vista del mapa: se agrega el centroide (para la selección con lazo) y el
-- estado del siniestro. Las coordenadas se recortan a 6 decimales (~10 cm),
-- lo que reduce bastante el tamaño de la respuesta sin pérdida práctica.
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
  st_y(st_centroid(l.geom))::float as lat,
  st_x(st_centroid(l.geom))::float as lon,
  st_asgeojson(l.geom, 6)::json as geometry,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'causa', s.causa,
          'fecha', s.fecha,
          'danio_estimado', s.danio_estimado,
          'estado', s.estado
        )
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

grant select on public.siniestros_gestion, public.lotes_mapa to authenticated;
