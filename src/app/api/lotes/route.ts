import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Colores por cultivo, iguales a los de la app anterior.
const COLOR_CULTIVO: Record<string, { fill: string; borde: string }> = {
  soja: { fill: "#4CAF50", borde: "#2E7D32" },
  soya: { fill: "#4CAF50", borde: "#2E7D32" },
  maiz: { fill: "#FFC107", borde: "#FF8F00" },
  maíz: { fill: "#FFC107", borde: "#FF8F00" },
  trigo: { fill: "#795548", borde: "#5D4037" },
  girasol: { fill: "#FF9800", borde: "#EF6C00" },
  algodon: { fill: "#2196F3", borde: "#1976D2" },
  algodón: { fill: "#2196F3", borde: "#1976D2" },
  sorgo: { fill: "#E91E63", borde: "#C2185B" },
};
const COLOR_DEFAULT = { fill: "#9C27B0", borde: "#7B1FA2" };

export function colorPorCultivo(cultivo: string | null) {
  if (!cultivo) return COLOR_DEFAULT;
  return COLOR_CULTIVO[cultivo.trim().toLowerCase()] ?? COLOR_DEFAULT;
}

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lotes_mapa")
    .select(
      "id, id_lote_externo, cultivo, hectareas_aseguradas, cliente_id, zona_id, cliente_nombre, geometry, siniestros"
    )
    .limit(6000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const features = (data ?? []).map((lote) => {
    const color = colorPorCultivo(lote.cultivo);
    return {
      type: "Feature" as const,
      geometry: lote.geometry,
      properties: {
        id: lote.id,
        id_lote_externo: lote.id_lote_externo,
        cultivo: lote.cultivo,
        hectareas: lote.hectareas_aseguradas,
        cliente: lote.cliente_nombre,
        siniestros: lote.siniestros,
        fill: color.fill,
        borde: color.borde,
      },
    };
  });

  return NextResponse.json({ type: "FeatureCollection", features });
}
