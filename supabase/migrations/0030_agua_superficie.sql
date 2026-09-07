-- Agua en superficie por lote y por fecha.
--
-- Sale del mismo pedido a Copernicus que el NDVI: el guion calcula además el
-- NDWI de McFeeters y devuelve 1 donde hay agua y 0 donde no, así el promedio
-- del lote ES la fracción anegada. No cuesta un pedido más.
alter table ndvi_lote
  add column if not exists agua numeric;

-- Marca de qué versión del guion produjo la serie. Al cambiar el guion, las
-- series viejas quedan sin este valor y se vuelven a pedir solas.
alter table ndvi_consulta
  add column if not exists version int not null default 1;

-- Índice para encontrar rápido las fechas anegadas de un lote.
create index if not exists ndvi_lote_agua_idx
  on ndvi_lote (lote_id, agua)
  where agua > 0;
