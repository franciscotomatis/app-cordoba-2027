-- Vista de solo lectura para el mapa: geometría como GeoJSON + siniestros embebidos.
-- Al ser una vista normal (no security definer), respeta las políticas RLS de "lotes".
create or replace view public.lotes_mapa
with (security_invoker = true)
as
select
  l.id,
  l.id_lote_externo,
  l.cultivo,
  l.hectareas_aseguradas,
  l.cliente_id,
  l.zona_id,
  c.nombre as cliente_nombre,
  st_asgeojson(l.geom)::json as geometry,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('causa', s.causa, 'fecha', s.fecha, 'danio_estimado', s.danio_estimado)
      )
      from siniestros s
      where s.lote_id = l.id
    ),
    '[]'::jsonb
  ) as siniestros
from lotes l
left join clientes c on c.id = l.cliente_id;

grant select on public.lotes_mapa to authenticated;
