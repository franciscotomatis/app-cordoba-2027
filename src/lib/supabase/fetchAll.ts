import type { SupabaseClient } from "@supabase/supabase-js";

const PAGINA = 1000; // PostgREST corta las respuestas en 1000 filas por defecto.

// Trae todas las filas de una tabla/vista paginando, sin quedar limitado al tope de PostgREST.
export async function fetchAll<T>(
  supabase: SupabaseClient,
  tabla: string,
  columnas: string,
  orden?: { columna: string; ascendente?: boolean }
): Promise<{ data: T[]; error: string | null }> {
  const filas: T[] = [];

  for (let desde = 0; ; desde += PAGINA) {
    let query = supabase
      .from(tabla)
      .select(columnas)
      .range(desde, desde + PAGINA - 1);

    if (orden) {
      query = query.order(orden.columna, { ascending: orden.ascendente ?? true });
    }

    const { data, error } = await query;
    if (error) return { data: filas, error: error.message };

    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
  }

  return { data: filas, error: null };
}
