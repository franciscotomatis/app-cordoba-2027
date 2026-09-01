-- Soporte para el dashboard: email en profiles + alta automática de perfiles,
-- visibilidad de peritos, y bucket de Storage para fotos.

alter table profiles add column if not exists email text;

-- Alta automática de perfil al crear un usuario en auth.users (antes se hacía a mano).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'lectura')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill del email para el/los usuarios ya creados manualmente.
update profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Los peritos deben poder ser vistos en un listado por cualquiera que no sea "cliente".
create policy "profiles_select_peritos" on profiles for select
  using (role = 'perito' and auth_role() in ('admin', 'perito', 'lectura'));

-- Bucket de Storage para fotos de campo (privado).
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

create policy "fotos_storage_insert" on storage.objects for insert
  with check (bucket_id = 'fotos' and auth_role() in ('admin', 'perito'));

create policy "fotos_storage_select" on storage.objects for select
  using (bucket_id = 'fotos' and auth_role() in ('admin', 'perito', 'lectura', 'cliente'));

create policy "fotos_storage_delete" on storage.objects for delete
  using (bucket_id = 'fotos' and auth_role() = 'admin');
