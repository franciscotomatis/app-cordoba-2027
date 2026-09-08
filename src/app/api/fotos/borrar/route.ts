import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Borra una foto: la fila primero, que es donde la RLS decide si este usuario
 * puede, y después el archivo.
 *
 * El archivo se borra con la clave de servicio y no con la sesión del usuario.
 * La política de lectura del bucket exige que exista una fila en "fotos" que
 * apunte al archivo; una vez borrada la fila, el archivo queda invisible para
 * esa sesión y "remove" no encuentra nada que borrar, sin dar error. Resultado:
 * la foto desaparecía del listado pero el archivo seguía ocupando lugar.
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !clave) {
    return NextResponse.json({
      ok: true,
      aviso: "Se quitó del listado, pero el archivo quedó en el depósito (falta SUPABASE_SERVICE_ROLE_KEY).",
    });
  }

  const servicio = createServiceClient(url, clave, { auth: { persistSession: false } });
  const { data: borradosArchivo, error: errorArchivo } = await servicio.storage
    .from("fotos")
    .remove([foto.storage_path]);

  const seBorroElArchivo = !errorArchivo && (borradosArchivo?.length ?? 0) > 0;

  return NextResponse.json({
    ok: true,
    aviso: seBorroElArchivo
      ? null
      : "Se quitó del listado, pero el archivo quedó en el depósito.",
  });
}
