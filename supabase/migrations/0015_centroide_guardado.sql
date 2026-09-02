-- Las demás vistas también dejan de recalcular el centroide en cada consulta.
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
  l.rinde_estimado,
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
  l.centro_lat as lat,
  l.centro_lon as lon,
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
  l.centro_lat as lat,
  l.centro_lon as lon,
  exists (select 1 from siniestros s where s.lote_id = l.id) as tiene_siniestro
from lotes l
left join clientes c on c.id = l.cliente_id
left join zonas z on z.id = l.zona_id;

grant select on public.lotes_mapa, public.lotes_tabla to authenticated;
