-- Asignar un caso a un perito pasa a ser exclusivo del administrador.
-- No alcanza con esconder el botón: el navegador habla con la base directo,
-- así que la regla se aplica acá. El resto de lo que hace el perito (cargar
-- rinde, cambiar el estado del caso, subir fotos) sigue igual.

create or replace function impedir_autoasignacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin sesión es el servidor con la clave de servicio: no se toca.
  if auth.uid() is null or auth_role() = 'admin' then
    return new;
  end if;

  if tg_table_name = 'lotes' then
    if new.perito_id is distinct from old.perito_id
       or new.asignado_en is distinct from old.asignado_en
       or new.asignado_por is distinct from old.asignado_por then
      raise exception 'Solo un administrador puede asignar lotes a un perito';
    end if;
  else
    if new.perito_id is distinct from old.perito_id
       or new.asignado_en is distinct from old.asignado_en then
      raise exception 'Solo un administrador puede asignar casos a un perito';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lotes_solo_admin_asigna on lotes;
create trigger lotes_solo_admin_asigna
  before update on lotes
  for each row execute function impedir_autoasignacion();

drop trigger if exists siniestros_solo_admin_asigna on siniestros;
create trigger siniestros_solo_admin_asigna
  before update on siniestros
  for each row execute function impedir_autoasignacion();
