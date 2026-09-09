-- Aviso de seguridad de Supabase: "spatial_ref_sys" sin RLS.
--
-- La tabla es de PostGIS, no nuestra: guarda las definiciones de los sistemas
-- de coordenadas (EPSG:4326, etc.), que son un estándar público. No hay ahí un
-- solo dato de clientes, lotes ni siniestros, así que no hay fuga posible.
--
-- No se le puede activar RLS porque pertenece a la extensión y su dueño es
-- supabase_admin. Pero el aviso sí destapa algo real: PostGIS le dio permiso
-- de INSERT, UPDATE, DELETE y TRUNCATE a "anon", es decir a cualquiera con la
-- clave pública de la aplicación. No podría leer nada privado, pero sí podría
-- vaciar la tabla y romper las operaciones geográficas.
--
-- Se le deja solo lectura, que es lo único que PostGIS necesita en tiempo de
-- ejecución.
revoke insert, update, delete, truncate, references, trigger
  on public.spatial_ref_sys from anon, authenticated;

grant select on public.spatial_ref_sys to anon, authenticated;
