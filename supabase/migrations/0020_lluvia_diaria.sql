-- Lluvia diaria por celda de grilla, para poder pintar el mapa por rango de
-- fechas. La tabla mensual (clima_celda) sigue sirviendo al gráfico histórico;
-- esta guarda el detalle diario de los períodos recientes, que es lo que se
-- consulta para ver "qué llovió entre tal y tal fecha".
create table if not exists clima_dia (
  lat_celda numeric(5, 1) not null,
  lon_celda numeric(5, 1) not null,
  fecha date not null,
  pp_mm numeric not null,
  primary key (lat_celda, lon_celda, fecha)
);

alter table clima_dia enable row level security;

drop policy if exists "clima_dia_select" on clima_dia;
create policy "clima_dia_select" on clima_dia for select
  using (auth.uid() is not null);

drop policy if exists "clima_dia_write" on clima_dia;
create policy "clima_dia_write" on clima_dia for all
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

create index if not exists clima_dia_fecha_idx on clima_dia (fecha);

-- Suma de lluvia por lote en un rango, resolviendo la celda de cada lote.
create or replace function lluvia_por_lote(desde date, hasta date)
returns table (lote_id uuid, pp_mm numeric)
language sql
stable
as $$
  select l.id,
         coalesce(sum(d.pp_mm), 0)::numeric as pp_mm
  from lotes l
  left join clima_dia d
    on d.lat_celda = round(l.centro_lat::numeric, 1)
   and d.lon_celda = round(l.centro_lon::numeric, 1)
   and d.fecha between desde and hasta
  group by l.id;
$$;

grant execute on function lluvia_por_lote(date, date) to authenticated;
