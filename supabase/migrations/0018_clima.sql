-- Precipitación por celda de grilla.
--
-- Fuente: Open-Meteo (reanálisis ERA5-Land), la MISMA para el histórico y para
-- el año en curso. Es deliberado: si el promedio histórico viniera de un
-- producto y el dato actual de otro, la comparación "por encima / por debajo"
-- arrastraría el sesgo entre ambos y no significaría nada.
--
-- Se guarda por celda de 0,1° (~11 km) y no por lote, porque esa es la
-- resolución real del dato: los 5701 lotes caen en unas pocas cientos de
-- celdas y así se evita repetir la misma consulta miles de veces.
create table if not exists clima_celda (
  lat_celda numeric(5, 1) not null,
  lon_celda numeric(5, 1) not null,
  anio smallint not null,
  mes smallint not null check (mes between 1 and 12),
  pp_mm numeric not null,
  actualizado_en timestamptz not null default now(),
  primary key (lat_celda, lon_celda, anio, mes)
);

alter table clima_celda enable row level security;

-- Es dato público de una fuente abierta: cualquier usuario autenticado lo lee.
drop policy if exists "clima_select" on clima_celda;
create policy "clima_select" on clima_celda for select
  using (auth.uid() is not null);

-- Solo el servidor escribe (a través de la clave de servicio o de migraciones).
drop policy if exists "clima_write_admin" on clima_celda;
create policy "clima_write_admin" on clima_celda for all
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

create index if not exists clima_celda_celda_idx on clima_celda (lat_celda, lon_celda);
