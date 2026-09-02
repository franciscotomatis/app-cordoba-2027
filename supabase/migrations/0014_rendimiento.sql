-- Rendimiento: faltaban los índices por lote_id, así que cada join y cada
-- conteo de fotos recorría la tabla entera. Además el conteo de fotos se hacía
-- con una subconsulta por fila (5701 veces); pasa a ser un join agregado.

-- El centroide se calculaba en cada consulta para cada polígono; ahora queda
-- guardado y se actualiza solo cuando cambia la geometría.
alter table lotes
  add column if not exists centro_lat double precision
    generated always as (st_y(st_centroid(geom))) stored,
  add column if not exists centro_lon double precision
    generated always as (st_x(st_centroid(geom))) stored;

create index if not exists siniestros_lote_idx on siniestros (lote_id);
create index if not exists fotos_lote_idx on fotos (lote_id);
create index if not exists lotes_cliente_cultivo_idx on lotes (cliente_id, cultivo);

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
  l.centro_lat as lat,
  l.centro_lon as lon,
  coalesce(fc.fotos, 0) as fotos,
  (u.cliente_id is not null) as unidad_con_denuncia
from lotes l
left join siniestros s on s.lote_id = l.id
left join clientes c on c.id = l.cliente_id
left join zonas z on z.id = l.zona_id
left join profiles pe on pe.id = s.perito_id
left join (
  select lote_id, count(*)::int as fotos
  from fotos
  where lote_id is not null
  group by lote_id
) fc on fc.lote_id = l.id
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

-- Misma optimización para la vista de casos.
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
  l.rinde_estimado,
  l.fecha_siembra,
  c.nombre as cliente_nombre,
  c.cuit as cliente_cuit,
  z.nombre as zona_nombre,
  l.centro_lat as lat,
  l.centro_lon as lon,
  coalesce(fc.fotos, 0) as fotos
from siniestros s
join lotes l on l.id = s.lote_id
left join clientes c on c.id = l.cliente_id
left join zonas z on z.id = l.zona_id
left join profiles pe on pe.id = s.perito_id
left join (
  select lote_id, count(*)::int as fotos
  from fotos
  where lote_id is not null
  group by lote_id
) fc on fc.lote_id = l.id;

grant select on public.gestion_lotes, public.siniestros_gestion to authenticated;

analyze lotes;
analyze siniestros;
analyze fotos;
