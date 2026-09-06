-- Las celdas de la grilla provincial, para que la tarea diaria sepa qué puntos
-- pedirle a Open-Meteo. Va como un solo JSON porque son ~1600 y PostgREST
-- corta las respuestas de función en 1000 filas.
create or replace function celdas_provincia()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_array(lat_celda, lon_celda)), '[]'::jsonb)
  from (
    select distinct lat_celda, lon_celda
    from clima_dia
    where en_provincia
  ) t;
$$;

grant execute on function celdas_provincia() to authenticated, service_role;
