-- El registro público de Supabase estaba habilitado: cualquiera en internet
-- podía crearse una cuenta. El disparador le asignaba el rol "lectura", que
-- según las políticas puede leer TODOS los clientes con nombre y CUIT, todos
-- los lotes y todos los siniestros. Lo único que lo frenaba era confirmar el
-- correo, cosa que se hace con cualquier casilla real.
--
-- Hay que apagar el registro en el panel de Supabase (Authentication →
-- Sign In / Providers → Email → "Allow new users to sign up"), pero eso es una
-- casilla que alguien puede volver a prender sin darse cuenta. Esto es la
-- segunda línea: aunque el registro quede abierto, quien entre solo no ve nada.
--
-- El rol por defecto pasa a "cliente" SIN cliente asignado. Todas las políticas
-- de ese rol comparan contra auth_cliente_id(), que en ese caso es nulo, así
-- que ninguna fila coincide. El alta real la sigue haciendo el administrador,
-- que después de crear al usuario le fija el rol que corresponde.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'cliente')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Un cliente sin empresa asignada tampoco tiene por qué ver las zonas ni la
-- matriz de permisos, que eran lo único que quedaba visible con solo tener
-- sesión iniciada.
drop policy if exists "zonas_select" on zonas;
create policy "zonas_select" on zonas for select
  using (auth_role() in ('admin', 'perito', 'lectura'));

drop policy if exists "permisos_select_todos" on permisos_rol;
create policy "permisos_select" on permisos_rol for select
  using (auth_role() in ('admin', 'perito', 'lectura', 'cliente'));
