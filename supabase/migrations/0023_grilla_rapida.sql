-- La grilla de lluvia agrega ~140 mil filas y, con RLS, la política se evalúa
-- fila por fila y la consulta se pasa del tiempo límite de PostgREST.
-- Como es dato público de una fuente abierta (no hay nada por usuario), la
-- función pasa a SECURITY DEFINER: adentro no se aplica RLS y vuela.
-- El control de acceso sigue estando: solo usuarios autenticados pueden
-- ejecutarla.
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
    group by lat_celda, lon_celda
  ) t;
$$;

revoke execute on function lluvia_grilla(date, date) from public, anon;
grant execute on function lluvia_grilla(date, date) to authenticated;

-- Índice de cobertura: la consulta se resuelve sin ir a la tabla.
create index if not exists clima_dia_cobertura_idx
  on clima_dia (fecha) include (lat_celda, lon_celda, pp_mm);

analyze clima_dia;
