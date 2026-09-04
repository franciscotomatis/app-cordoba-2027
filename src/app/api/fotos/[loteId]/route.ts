import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Fotos de un lote con URL firmada (el bucket es privado).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ loteId: string }> }
) {
  const { loteId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: fotos, error } = await supabase
    .from("fotos")
    .select("id, storage_path, nombre_original, created_at, subido_por")
    .eq("lote_id", loteId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!fotos?.length) return NextResponse.json({ fotos: [] });

  // Quién puede borrar: el admin cualquiera, el perito solo las suyas.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const esAdmin = perfil?.role === "admin";
  const esPerito = perfil?.role === "perito";

  const { data: firmadas } = await supabase.storage
    .from("fotos")
    .createSignedUrls(
      fotos.map((f) => f.storage_path),
      3600
    );
  const urlPorPath = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));

  const autores = [...new Set(fotos.map((f) => f.subido_por).filter(Boolean))] as string[];
  const { data: perfiles } = autores.length
    ? await supabase.from("profiles").select("id, nombre_completo, email").in("id", autores)
    : { data: [] };
  const nombrePorId = new Map(
    (perfiles ?? []).map((p) => [p.id, p.nombre_completo || p.email])
  );

  return NextResponse.json({
    fotos: fotos.map((f) => ({
      id: f.id,
      url: urlPorPath.get(f.storage_path) ?? null,
      nombre_original: f.nombre_original,
      created_at: f.created_at,
      subido_por_nombre: f.subido_por ? (nombrePorId.get(f.subido_por) ?? null) : null,
      puede_borrar: esAdmin || (esPerito && f.subido_por === user.id),
    })),
  });
}
