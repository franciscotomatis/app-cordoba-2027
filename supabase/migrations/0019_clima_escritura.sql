-- El caché de clima lo completa la propia aplicación cuando alguien abre un
-- lote, así que cualquier usuario autenticado tiene que poder escribirlo (si
-- solo pudiera el admin, un perito nunca vería el gráfico). Es dato público
-- derivado de una fuente abierta: lo peor que puede pasar es tener que
-- volver a pedirlo.
drop policy if exists "clima_write_admin" on clima_celda;

drop policy if exists "clima_insert" on clima_celda;
create policy "clima_insert" on clima_celda for insert
  with check (auth.uid() is not null);

drop policy if exists "clima_update" on clima_celda;
create policy "clima_update" on clima_celda for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "clima_delete_admin" on clima_celda;
create policy "clima_delete_admin" on clima_celda for delete
  using (auth_role() = 'admin');
