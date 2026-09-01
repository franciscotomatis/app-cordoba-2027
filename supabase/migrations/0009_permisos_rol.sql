-- Permisos configurables por rol: qué secciones ve y qué acciones puede hacer.
-- Antes estaban escritos a mano en el código del menú; ahora se editan desde
-- la sección Administración.

create table if not exists permisos_rol (
  rol user_role not null,
  clave text not null,
  permitido boolean not null default false,
  primary key (rol, clave)
);

alter table permisos_rol enable row level security;

drop policy if exists "permisos_select_todos" on permisos_rol;
create policy "permisos_select_todos" on permisos_rol for select
  using (auth.uid() is not null);

drop policy if exists "permisos_write_admin" on permisos_rol;
create policy "permisos_write_admin" on permisos_rol for all
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- Valores por defecto: replican exactamente lo que hacía el menú hasta ahora.
insert into permisos_rol (rol, clave, permitido) values
  -- Administrador: todo
  ('admin', 'seccion:resumen', true),
  ('admin', 'seccion:mapa', true),
  ('admin', 'seccion:clientes', true),
  ('admin', 'seccion:siniestros', true),
  ('admin', 'seccion:fotos', true),
  ('admin', 'seccion:peritos', true),
  ('admin', 'seccion:admin', true),
  ('admin', 'accion:subir_fotos', true),
  ('admin', 'accion:cambiar_estado', true),
  ('admin', 'accion:asignar_perito', true),
  ('admin', 'accion:exportar', true),

  -- Perito de campo
  ('perito', 'seccion:resumen', true),
  ('perito', 'seccion:mapa', true),
  ('perito', 'seccion:clientes', true),
  ('perito', 'seccion:siniestros', true),
  ('perito', 'seccion:fotos', true),
  ('perito', 'seccion:peritos', true),
  ('perito', 'seccion:admin', false),
  ('perito', 'accion:subir_fotos', true),
  ('perito', 'accion:cambiar_estado', true),
  ('perito', 'accion:asignar_perito', false),
  ('perito', 'accion:exportar', true),

  -- Cliente / productor: solo lo suyo
  ('cliente', 'seccion:resumen', true),
  ('cliente', 'seccion:mapa', true),
  ('cliente', 'seccion:clientes', false),
  ('cliente', 'seccion:siniestros', true),
  ('cliente', 'seccion:fotos', true),
  ('cliente', 'seccion:peritos', false),
  ('cliente', 'seccion:admin', false),
  ('cliente', 'accion:subir_fotos', false),
  ('cliente', 'accion:cambiar_estado', false),
  ('cliente', 'accion:asignar_perito', false),
  ('cliente', 'accion:exportar', false),

  -- Solo lectura interno
  ('lectura', 'seccion:resumen', true),
  ('lectura', 'seccion:mapa', true),
  ('lectura', 'seccion:clientes', true),
  ('lectura', 'seccion:siniestros', true),
  ('lectura', 'seccion:fotos', true),
  ('lectura', 'seccion:peritos', true),
  ('lectura', 'seccion:admin', false),
  ('lectura', 'accion:subir_fotos', false),
  ('lectura', 'accion:cambiar_estado', false),
  ('lectura', 'accion:asignar_perito', false),
  ('lectura', 'accion:exportar', true)
on conflict (rol, clave) do nothing;

-- Fotos en el mapa: hace falta la ubicación como GeoJSON.
drop view if exists public.fotos_mapa;
create view public.fotos_mapa
with (security_invoker = true) as
select
  f.id,
  f.lote_id,
  f.storage_path,
  f.nombre_original,
  f.created_at,
  f.subido_por,
  p.nombre_completo as subido_por_nombre,
  p.email as subido_por_email,
  l.id_lote_externo,
  c.nombre as cliente_nombre,
  st_y(f.geom)::float as lat,
  st_x(f.geom)::float as lon
from fotos f
left join profiles p on p.id = f.subido_por
left join lotes l on l.id = f.lote_id
left join clientes c on c.id = l.cliente_id
where f.geom is not null;

grant select on public.fotos_mapa to authenticated;
