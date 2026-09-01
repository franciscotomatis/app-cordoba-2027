-- El negocio del multirriesgo es la combinación CUIT + cultivo. Cuando en la
-- gestión se piden los lotes sin denuncia, solo interesan los de las unidades
-- que tienen al menos un caso denunciado: los demás cultivos del mismo cliente
-- (y el resto del programa) no entran en esa liquidación.
drop view if exists public.gestion_lotes;
create view public.gestion_lotes
with (security_invoker = true) as
select
  l.id as lote_id,
  s.id as siniestro_id,
  s.causa,
  s.fecha,
  s.danio_estimado,
  s.estado,
  s.perito_id,
  s.asignado_en,
  pe.email as perito_email,
  pe.nombre_completo as perito_nombre,
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
  l.rinde_estimado,
  l.fecha_siembra,
  c.nombre as cliente_nombre,
  c.cuit as cliente_cuit,
  z.nombre as zona_nombre,
  st_y(st_centroid(l.geom))::float as lat,
  st_x(st_centroid(l.geom))::float as lon,
  (select count(*) from fotos f where f.lote_id = l.id)::int as fotos,
  (u.cliente_id is not null) as unidad_con_denuncia
from lotes l
left join siniestros s on s.lote_id = l.id
left join clientes c on c.id = l.cliente_id
left join zonas z on z.id = l.zona_id
left join profiles pe on pe.id = s.perito_id
left join (
  select distinct
    l2.cliente_id,
    coalesce(nullif(trim(l2.cultivo), ''), '') as cultivo
  from siniestros s2
  join lotes l2 on l2.id = s2.lote_id
  where l2.cliente_id is not null
) u
  on u.cliente_id = l.cliente_id
  and u.cultivo = coalesce(nullif(trim(l.cultivo), ''), '');

grant select on public.gestion_lotes to authenticated;
