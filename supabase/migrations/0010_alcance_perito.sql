-- Alcance del rol perito: ve solo los casos que tiene asignados, y además
-- todos los lotes de esos mismos asegurados (aunque no estén denunciados).
--
-- La función es SECURITY DEFINER y pertenece a "postgres" (que puede saltear
-- RLS), así que consultarla desde una policy de "lotes" no genera recursión.
create or replace function clientes_asignados_al_perito()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct l.cliente_id
  from siniestros s
  join lotes l on l.id = s.lote_id
  where s.perito_id = auth.uid()
    and l.cliente_id is not null;
$$;

-- ============================================
-- LOTES
-- ============================================
drop policy if exists "lotes_select" on lotes;
create policy "lotes_select" on lotes for select
  using (
    auth_role() in ('admin', 'lectura')
    or (auth_role() = 'cliente' and cliente_id = auth_cliente_id())
    or (auth_role() = 'perito' and cliente_id in (select clientes_asignados_al_perito()))
  );

-- La carga de lotes la hace la importación (conexión directa, sin RLS);
-- desde la app solo un admin podría tocarlos.
drop policy if exists "lotes_write_admin_perito" on lotes;
drop policy if exists "lotes_insert_admin" on lotes;
drop policy if exists "lotes_update_admin" on lotes;
drop policy if exists "lotes_delete_admin" on lotes;
create policy "lotes_insert_admin" on lotes for insert with check (auth_role() = 'admin');
create policy "lotes_update_admin" on lotes for update using (auth_role() = 'admin');
create policy "lotes_delete_admin" on lotes for delete using (auth_role() = 'admin');

-- ============================================
-- SINIESTROS
-- ============================================
-- Ojo: la policy anterior era FOR ALL, lo que también habilitaba el SELECT de
-- todos los casos a cualquier perito. Se separa por operación.
drop policy if exists "siniestros_select" on siniestros;
drop policy if exists "siniestros_write_admin_perito" on siniestros;
drop policy if exists "siniestros_insert_admin" on siniestros;
drop policy if exists "siniestros_update" on siniestros;
drop policy if exists "siniestros_delete_admin" on siniestros;

create policy "siniestros_select" on siniestros for select
  using (
    auth_role() in ('admin', 'lectura')
    or (auth_role() = 'perito' and perito_id = auth.uid())
    or (
      auth_role() = 'cliente'
      and exists (
        select 1 from lotes l
        where l.id = siniestros.lote_id and l.cliente_id = auth_cliente_id()
      )
    )
  );

create policy "siniestros_update" on siniestros for update
  using (
    auth_role() = 'admin'
    or (auth_role() = 'perito' and perito_id = auth.uid())
  );

create policy "siniestros_insert_admin" on siniestros for insert
  with check (auth_role() = 'admin');

create policy "siniestros_delete_admin" on siniestros for delete
  using (auth_role() = 'admin');

-- ============================================
-- CLIENTES
-- ============================================
drop policy if exists "clientes_select_all" on clientes;
drop policy if exists "clientes_select" on clientes;
create policy "clientes_select" on clientes for select
  using (
    auth_role() in ('admin', 'lectura')
    or (auth_role() = 'perito' and id in (select clientes_asignados_al_perito()))
    or (auth_role() = 'cliente' and id = auth_cliente_id())
  );

-- ============================================
-- FOTOS
-- ============================================
drop policy if exists "fotos_select" on fotos;
create policy "fotos_select" on fotos for select
  using (
    auth_role() in ('admin', 'lectura')
    or (
      auth_role() = 'perito'
      and (
        subido_por = auth.uid()
        or exists (
          select 1 from lotes l
          where l.id = fotos.lote_id
            and l.cliente_id in (select clientes_asignados_al_perito())
        )
      )
    )
    or (
      auth_role() = 'cliente'
      and exists (
        select 1 from lotes l
        where l.id = fotos.lote_id and l.cliente_id = auth_cliente_id()
      )
    )
  );

-- El archivo en Storage se puede leer solo si la fila de "fotos" es visible
-- para quien consulta (antes cualquier usuario podía leer todo el bucket).
drop policy if exists "fotos_storage_select" on storage.objects;
create policy "fotos_storage_select" on storage.objects for select
  using (
    bucket_id = 'fotos'
    and exists (
      select 1 from public.fotos f where f.storage_path = storage.objects.name
    )
  );
