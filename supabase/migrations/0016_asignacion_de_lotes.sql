-- La asignación a un perito pasa a ser del LOTE, no solo del siniestro: al
-- inspeccionar hay que recorrer también los lotes del mismo CUIT+cultivo que no
-- fueron denunciados, porque entran en la misma liquidación.
-- El estado del caso (denunciado / pendiente / cerrado / pagado) sigue viviendo
-- en siniestros, que es donde tiene sentido.

alter table lotes
  add column if not exists perito_id uuid references profiles(id) on delete set null,
  add column if not exists asignado_en timestamptz,
  add column if not exists asignado_por uuid references profiles(id) on delete set null;

create index if not exists lotes_perito_idx on lotes (perito_id);

-- El alcance del perito ahora también contempla los lotes asignados directo,
-- no solo los que tienen un siniestro a su nombre.
create or replace function clientes_asignados_al_perito()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct cliente_id from (
    select l.cliente_id
    from siniestros s
    join lotes l on l.id = s.lote_id
    where s.perito_id = auth.uid() and l.cliente_id is not null
    union
    select l.cliente_id
    from lotes l
    where l.perito_id = auth.uid() and l.cliente_id is not null
  ) t;
$$;

-- La vista de trabajo expone el perito del lote (y, si hay caso, el del caso).
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
  coalesce(l.perito_id, s.perito_id) as perito_id,
  coalesce(l.asignado_en, s.asignado_en) as asignado_en,
  coalesce(pl.email, ps.email) as perito_email,
  coalesce(pl.nombre_completo, ps.nombre_completo) as perito_nombre,
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
left join profiles pl on pl.id = l.perito_id
left join profiles ps on ps.id = s.perito_id
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

grant select on public.gestion_lotes to authenticated;
