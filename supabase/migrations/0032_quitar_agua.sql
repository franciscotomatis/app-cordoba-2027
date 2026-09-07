-- Se saca el agua en superficie por NDWI. La lectura no convenció y no vale la
-- pena mantener una columna que nadie mira; el guion de Copernicus vuelve a
-- calcular solo el NDVI.
--
-- La columna "version" de ndvi_consulta se mantiene: sirve para rehacer las
-- series cuando cambie el guion, sea por lo que sea.
drop index if exists ndvi_lote_agua_idx;

alter table ndvi_lote
  drop column if exists agua;
