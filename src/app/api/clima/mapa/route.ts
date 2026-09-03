import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Lluvia acumulada por lote entre dos fechas, para pintar el mapa.
 * Sale de la tabla diaria por celda (Open-Meteo / ERA5-Land), agregada en la
 * base con la función lluvia_por_lote.
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

  const { data, error } = await supabase.rpc("lluvia_por_lote", { desde, hasta });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // La función devuelve un único objeto { loteId: mm }: así no aplica el tope
  // de 1000 filas que PostgREST impone a las respuestas tabulares.
  const lluvia = (data ?? {}) as Record<string, number>;

  // Cobertura del período: si no hay datos cargados para esas fechas conviene
  // decirlo, en vez de mostrar un mapa todo en cero.
  const { data: rango } = await supabase
    .from("clima_dia")
    .select("fecha")
    .order("fecha", { ascending: true })
    .limit(1);
  const { data: rangoFin } = await supabase
    .from("clima_dia")
    .select("fecha")
    .order("fecha", { ascending: false })
    .limit(1);

  return NextResponse.json({
    lluvia,
    disponible: {
      desde: rango?.[0]?.fecha ?? null,
      hasta: rangoFin?.[0]?.fecha ?? null,
    },
  });
}
