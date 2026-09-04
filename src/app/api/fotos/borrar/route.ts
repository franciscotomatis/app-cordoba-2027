import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Borra una foto: primero la fila (ahí manda la RLS, que es la que decide si
 * este usuario puede) y después el archivo del bucket.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "Falta el id de la foto." }, { status: 400 });

  const { data: foto } = await supabase
    .from("fotos")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!foto) return NextResponse.json({ error: "La foto ya no existe." }, { status: 404 });

  const { data: borradas, error } = await supabase
    .from("fotos")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!borradas?.length) {
    // La RLS no devolvió error, simplemente no dejó borrar ninguna fila.
    return NextResponse.json(
      { error: "No tenés permiso para borrar esta foto." },
      { status: 403 }
    );
  }

  const { error: errorArchivo } = await supabase.storage
    .from("fotos")
    .remove([foto.storage_path]);

  return NextResponse.json({
    ok: true,
    aviso: errorArchivo ? "Se quitó del listado, pero el archivo quedó en el depósito." : null,
  });
}
