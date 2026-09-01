-- Evita que un admin se saque a sí mismo el rol y quede sin acceso al panel.
-- Los scripts de mantenimiento (conexión directa a Postgres) no tienen auth.uid(),
-- así que siguen pudiendo corregir roles desde afuera.
create or replace function impedir_autocambio_rol() returns trigger as $$
begin
  if new.role is distinct from old.role and old.id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol. Pedíselo a otro administrador.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_no_autocambio_rol on profiles;
create trigger profiles_no_autocambio_rol
  before update on profiles
  for each row execute function impedir_autocambio_rol();
