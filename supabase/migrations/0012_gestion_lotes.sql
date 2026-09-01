-- Vista de trabajo que incluye TODOS los lotes visibles, tengan denuncia o no.
-- El cálculo del multirriesgo necesita el rinde estimado de todos los lotes del
-- CUIT, no solo de los siniestrados, así que el perito tiene que poder cargarlo
-- en cualquiera. Hoy cada lote tiene como mucho un siniestro, por eso el LEFT
-- JOIN devuelve una fila por lote.
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
  (select count(*) from fotos f where f.lote_id = l.id)::int as fotos
from lotes l
left join siniestros s on s.lote_id = l.id
left join clientes c on c.id = l.cliente_id
left join zonas z on z.id = l.zona_id
left join profiles pe on pe.id = s.perito_id;

grant select on public.gestion_lotes to authenticated;
