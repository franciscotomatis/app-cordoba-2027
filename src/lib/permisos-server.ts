import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Permisos } from "@/lib/permisos";

/** Permisos del rol indicado, como { "seccion:mapa": true, ... } */
export async function permisosDelRol(rol: string): Promise<Permisos> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("permisos_rol")
    .select("clave, permitido")
    .eq("rol", rol);

  const permisos: Permisos = {};
  for (const p of data ?? []) permisos[p.clave] = p.permitido;
  return permisos;
}
