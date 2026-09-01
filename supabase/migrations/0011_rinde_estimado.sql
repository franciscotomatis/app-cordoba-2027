-- Rinde estimado que carga el perito en cada lote, expresado en qq/ha.
-- (rendimiento_asegurado, en cambio, viene del sistema y es el TOTAL de
-- quintales asegurados del lote: dividido por las hectáreas da los qq/ha.)

alter table lotes
  add column if not exists rinde_estimado numeric,
  add column if not exists rinde_estimado_por uuid references profiles(id) on delete set null,
  add column if not exists rinde_estimado_en timestamptz;

alter table lotes drop constraint if exists lotes_rinde_estimado_check;
alter table lotes add constraint lotes_rinde_estimado_check
  check (rinde_estimado is null or (rinde_estimado >= 0 and rinde_estimado <= 500));

-- Un perito puede cargar el rinde de los lotes de sus asegurados, pero no
-- modificar el resto de los datos del lote: se limita por columna.
revoke update on lotes from authenticated, anon;
grant update (rinde_estimado, rinde_estimado_por, rinde_estimado_en)
  on lotes to authenticated;

drop policy if exists "lotes_update_admin" on lotes;
drop policy if exists "lotes_update_rinde" on lotes;
create policy "lotes_update_rinde" on lotes for update
  using (
    auth_role() = 'admin'
    or (auth_role() = 'perito' and cliente_id in (select clientes_asignados_al_perito()))
  )
  with check (
    auth_role() = 'admin'
    or (auth_role() = 'perito' and cliente_id in (select clientes_asignados_al_perito()))
  );

-- ============================================
-- VISTAS
-- ============================================
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
  st_y(st_centroid(l.geom))::float as lat,
  st_x(st_centroid(l.geom))::float as lon,
  (select count(*) from fotos f where f.lote_id = l.id)::int as fotos
from siniestros s
join lotes l on l.id = s.lote_id
left join clientes c on c.id = l.cliente_id
left join zonas z on z.id = l.zona_id
left join profiles pe on pe.id = s.perito_id;

-- El multirriesgo se liquida por CUIT + cultivo: una fila por esa combinación.
-- Los quintales estimados solo suman los lotes que ya tienen rinde cargado;
-- por eso se informa "lotes_con_rinde" y el cálculo se marca como parcial
-- mientras falte cargar alguno.
drop view if exists public.clientes_cultivo;
create view public.clientes_cultivo
with (security_invoker = true) as
select
  base.*,
  greatest(base.qq_asegurados - base.qq_estimados, 0) as indemnizacion_qq,
  case
    when base.qq_asegurados > 0
      then round(greatest(base.qq_asegurados - base.qq_estimados, 0) / base.qq_asegurados * 100, 1)
    else 0
  end as porcentaje_indemnizacion
from (
  select
    c.id as cliente_id,
    c.nombre as cliente_nombre,
    c.cuit as cliente_cuit,
    coalesce(nullif(trim(l.cultivo), ''), 'Sin especificar') as cultivo,
    count(*)::int as lotes,
    count(l.rinde_estimado)::int as lotes_con_rinde,
    count(*) filter (
      where exists (select 1 from siniestros s where s.lote_id = l.id)
    )::int as lotes_con_siniestro,
    coalesce(sum(l.hectareas_aseguradas), 0)::numeric as hectareas,
    coalesce(sum(l.rendimiento_asegurado), 0)::numeric as qq_asegurados,
    coalesce(sum(l.hectareas_aseguradas * l.rinde_estimado), 0)::numeric as qq_estimados
  from lotes l
  join clientes c on c.id = l.cliente_id
  group by c.id, c.nombre, c.cuit, 4
) base;

grant select on public.lotes_mapa, public.siniestros_gestion, public.clientes_cultivo
  to authenticated;
