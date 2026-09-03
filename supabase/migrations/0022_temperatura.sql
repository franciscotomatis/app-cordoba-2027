-- Temperatura mensual por celda, para el gráfico de la ficha del lote.
-- Se guarda junto a la precipitación porque viene de la misma consulta.
alter table clima_celda
  add column if not exists t_min numeric,
  add column if not exists t_med numeric,
  add column if not exists t_max numeric;

-- Lluvia diaria: se amplía a toda la provincia, no solo donde hay lotes, para
-- poder dibujar la capa completa. Se marca el origen para saber qué celdas
-- pertenecen a la grilla provincial.
alter table clima_dia
  add column if not exists en_provincia boolean not null default false;

create index if not exists clima_dia_provincia_idx on clima_dia (en_provincia, fecha);

-- Devuelve la grilla de lluvia acumulada de un período, como GeoJSON de celdas.
-- Una sola fila de respuesta: PostgREST no corta objetos JSON.
create or replace function lluvia_grilla(desde date, hasta date)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lat', t.lat_celda,
        'lon', t.lon_celda,
        'mm', round(t.mm, 1)
      )
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

grant execute on function lluvia_grilla(date, date) to authenticated;
