-- La versión anterior devolvía una fila por lote y PostgREST corta esas
-- respuestas en 1000 filas, así que el mapa recibía solo una parte y el resto
-- de los lotes quedaba sin dato. Devolviendo un único objeto JSON no hay tope.
drop function if exists lluvia_por_lote(date, date);

create or replace function lluvia_por_lote(desde date, hasta date)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_object_agg(t.id::text, t.mm), '{}'::jsonb)
  from (
    select l.id,
           coalesce(sum(d.pp_mm), 0)::numeric as mm
    from lotes l
    left join clima_dia d
      on d.lat_celda = round(l.centro_lat::numeric, 1)
     and d.lon_celda = round(l.centro_lon::numeric, 1)
     and d.fecha between desde and hasta
    group by l.id
  ) t;
$$;

grant execute on function lluvia_por_lote(date, date) to authenticated;
