-- La asignación se guarda con la sesión del usuario (no con la clave de
-- servicio), así que las columnas de asignación se suman al permiso de
-- escritura por columna sobre "lotes". El resto de los datos del lote sigue
-- siendo de solo lectura desde la aplicación.
grant update (
  rinde_estimado,
  rinde_estimado_por,
  rinde_estimado_en,
  perito_id,
  asignado_en,
  asignado_por
) on lotes to authenticated;
