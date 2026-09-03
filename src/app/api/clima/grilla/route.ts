import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Grilla de lluvia acumulada sobre la provincia entre dos fechas.
 * Devuelve las celdas de 0,1° con sus milímetros, para dibujar la capa.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  if (!desde || !hasta) {
    return NextResponse.json(
      { error: "Hacen falta las fechas desde y hasta." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await supabase.rpc("lluvia_grilla", { desde, hasta });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const celdas = (data ?? []) as { lat: number; lon: number; mm: number }[];

  // Rango de fechas disponible, para avisar si se pide un período sin datos.
  const { data: primera } = await supabase
    .from("clima_dia")
    .select("fecha")
    .order("fecha", { ascending: true })
    .limit(1);
  const { data: ultima } = await supabase
    .from("clima_dia")
    .select("fecha")
    .order("fecha", { ascending: false })
    .limit(1);

  return NextResponse.json({
    celdas,
    disponible: {
      desde: primera?.[0]?.fecha ?? null,
      hasta: ultima?.[0]?.fecha ?? null,
    },
  });
}
