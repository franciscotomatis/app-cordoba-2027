import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type FotoMapa = {
  id: string;
  lote_id: string | null;
  storage_path: string;
  nombre_original: string | null;
  created_at: string;
  subido_por_nombre: string | null;
  subido_por_email: string | null;
  id_lote_externo: string | null;
  cliente_nombre: string | null;
  lat: number;
  lon: number;
};

// Fotos georreferenciadas para dibujarlas como capa de puntos en el mapa.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await supabase
    .from("fotos_mapa")
    .select(
      "id, lote_id, storage_path, nombre_original, created_at, subido_por_nombre, subido_por_email, id_lote_externo, cliente_nombre, lat, lon"
    )
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fotos = (data ?? []) as FotoMapa[];
  if (fotos.length === 0) {
    return NextResponse.json({ type: "FeatureCollection", features: [] });
  }

  const { data: firmadas } = await supabase.storage
    .from("fotos")
    .createSignedUrls(
      fotos.map((f) => f.storage_path),
      3600
    );
  const urlPorPath = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));

  return NextResponse.json({
    type: "FeatureCollection",
    features: fotos.map((f) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [f.lon, f.lat] },
      properties: {
        id: f.id,
        url: urlPorPath.get(f.storage_path) ?? null,
        nombre: f.nombre_original,
        fecha: f.created_at,
        autor: f.subido_por_nombre || f.subido_por_email || null,
        loteId: f.id_lote_externo,
        cliente: f.cliente_nombre,
      },
    })),
  });
}
