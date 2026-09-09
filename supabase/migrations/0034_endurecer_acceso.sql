-- Endurecimiento después de revisar el acceso anónimo tabla por tabla.

-- 1. "zonas" se leía sin iniciar sesión. La política decía "true", y como
--    Supabase le da permisos a "anon" por defecto, cualquiera con la clave
--    pública veía los nombres de zona y las hectáreas meta. Es poco, pero es
--    dato de la empresa saliendo sin autenticación. De paso tapa kpi_zonas,
--    que apoyaba en esta tabla.
drop policy if exists "zonas_select_all" on zonas;
create policy "zonas_select" on zonas for select
  using (auth.uid() is not null);

-- 2. Al crear una función, Postgres le da permiso de ejecución a PUBLIC. El
--    GRANT explícito a "authenticated" no quita ese permiso heredado, así que
--    estas tres se podían llamar sin sesión: lluvia_rango contestaba, y
--    celdas_provincia llegaba a ejecutar una consulta pesada sobre 680.000
--    filas, que es una forma barata de hacerle gastar tiempo al servidor.
revoke execute on function lluvia_grilla(date, date) from public, anon;
revoke execute on function lluvia_rango() from public, anon;
revoke execute on function celdas_provincia() from public, anon;

grant execute on function lluvia_grilla(date, date) to authenticated;
grant execute on function lluvia_rango() to authenticated;
grant execute on function celdas_provincia() to authenticated, service_role;

-- 3. auth_role() y auth_cliente_id() son SECURITY DEFINER y no fijaban su
--    search_path. Hoy no es explotable porque ni "anon" ni "authenticated"
--    pueden crear objetos en ningún esquema, pero una función con permisos de
--    superusuario que resuelve nombres de tabla en tiempo de ejecución no
--    debería depender de eso.
create or replace function auth_role() returns user_role
  language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create or replace function auth_cliente_id() returns uuid
  language sql stable security definer set search_path = public
as $$ select cliente_id from profiles where id = auth.uid() $$;

-- 4. Las tablas de caché (clima y NDVI) aceptaban escritura de cualquier
--    usuario con sesión, incluido un cliente. No exponía nada, pero permitía
--    ensuciar el NDVI o la lluvia de lotes que esa persona ni siquiera puede
--    ver. Ahora las escribe el servidor con la clave de servicio, así que
--    desde el navegador quedan de solo lectura.
drop policy if exists "clima_insert" on clima_celda;
drop policy if exists "clima_update" on clima_celda;
drop policy if exists "clima_delete_admin" on clima_celda;
create policy "clima_celda_write_admin" on clima_celda for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

drop policy if exists "ndvi_write" on ndvi_lote;
create policy "ndvi_write_admin" on ndvi_lote for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

drop policy if exists "ndvi_consulta_todo" on ndvi_consulta;
create policy "ndvi_consulta_select" on ndvi_consulta for select
  using (auth.uid() is not null);
create policy "ndvi_consulta_write_admin" on ndvi_consulta for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
