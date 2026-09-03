-- Las imágenes NDVI necesitan su propio bucket: las políticas de "fotos" están
-- atadas a la tabla fotos (cada archivo debe tener su ficha), que es correcto
-- para las fotos de campo pero no aplica a una imagen derivada de satélite.
insert into storage.buckets (id, name, public)
values ('ndvi', 'ndvi', false)
on conflict (id) do nothing;

-- Es dato público derivado de Sentinel-2: lo lee cualquier usuario autenticado
-- y lo escribe la propia aplicación al pedir una imagen.
drop policy if exists "ndvi_storage_select" on storage.objects;
create policy "ndvi_storage_select" on storage.objects for select
  using (bucket_id = 'ndvi' and auth.uid() is not null);

drop policy if exists "ndvi_storage_insert" on storage.objects;
create policy "ndvi_storage_insert" on storage.objects for insert
  with check (bucket_id = 'ndvi' and auth.uid() is not null);

drop policy if exists "ndvi_storage_update" on storage.objects;
create policy "ndvi_storage_update" on storage.objects for update
  using (bucket_id = 'ndvi' and auth.uid() is not null)
  with check (bucket_id = 'ndvi' and auth.uid() is not null);

drop policy if exists "ndvi_storage_delete" on storage.objects;
create policy "ndvi_storage_delete" on storage.objects for delete
  using (bucket_id = 'ndvi' and auth_role() = 'admin');
