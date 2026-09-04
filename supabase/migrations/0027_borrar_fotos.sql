-- Borrado de fotos desde la app.
-- El admin puede borrar cualquiera; el perito solo las que subió él, para que
-- pueda corregir una foto mal sacada sin poder tocar el trabajo de otro.

drop policy if exists "fotos_delete_admin" on fotos;

create policy "fotos_delete" on fotos for delete
  using (
    auth_role() = 'admin'
    or (auth_role() = 'perito' and subido_por = auth.uid())
  );

-- Misma regla en el archivo del bucket. La ruta se arma como
-- "<id del usuario>/<timestamp>.<ext>", así que la primera carpeta identifica
-- a quien la subió.
drop policy if exists "fotos_storage_delete" on storage.objects;

create policy "fotos_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'fotos'
    and (
      auth_role() = 'admin'
      or (
        auth_role() = 'perito'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
    )
  );
