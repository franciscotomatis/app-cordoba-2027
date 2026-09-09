import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave de servicio, para escribir las tablas de caché.
 *
 * El clima y el NDVI se piden a proveedores externos y se guardan para no
 * volver a pedirlos. Esa escritura la hace el servidor, no la persona: si se
 * hiciera con la sesión del usuario habría que dejar esas tablas abiertas a
 * cualquiera con cuenta, y entonces un cliente podría ensuciar el NDVI de
 * lotes que ni siquiera puede ver.
 *
 * IMPORTANTE: esta clave saltea la RLS. Usarla solo para escribir caché, nunca
 * para leer datos que la persona no debería ver. La verificación de si el
 * usuario puede ver el lote se hace antes, con su propia sesión.
 */
export function clienteDeServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;
  return createClient(url, clave, { auth: { persistSession: false } });
}
