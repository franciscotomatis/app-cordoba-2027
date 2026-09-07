-- La grilla de lluvia mezclaba dos cosas distintas.
--
-- clima_dia guarda las celdas de la provincia (que carga la tarea diaria) y
-- también las celdas sueltas de los lotes que alguien abrió alguna vez, que se
-- piden por demanda y cubren otro período. Sin filtrar, un rango anterior a la
-- carga provincial devolvía solo ese puñado de celdas de lotes: en el mapa se
-- veían cuatro píxeles perdidos en vez de "no hay datos".
create or replace function lluvia_grilla(desde date, hasta date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('lat', t.lat_celda, 'lon', t.lon_celda, 'mm', round(t.mm, 1))
    ),
    '[]'::jsonb
  )
  from (
    select lat_celda, lon_celda, sum(pp_mm) as mm
    from clima_dia
    where fecha between desde and hasta
      and en_provincia
    group by lat_celda, lon_celda
  ) t;
$$;

revoke execute on function lluvia_grilla(date, date) from public, anon;
grant execute on function lluvia_grilla(date, date) to authenticated;

-- Rango realmente disponible de la grilla provincial, para que el mapa pueda
-- avisar cuando se pide un período que todavía no se cargó.
create or replace function lluvia_rango()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'desde', min(fecha),
    'hasta', max(fecha)
  )
  from clima_dia
  where en_provincia;
$$;

grant execute on function lluvia_rango() to authenticated;

create index if not exists clima_dia_provincia_idx
  on clima_dia (fecha) include (lat_celda, lon_celda, pp_mm)
  where en_provincia;

analyze clima_dia;
