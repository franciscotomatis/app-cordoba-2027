import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { colorPorCultivo } from "@/lib/colores";
import type { Geometry } from "geojson";

type LoteMapa = {
  id: string;
  id_lote_externo: string;
  cultivo: string | null;
  hectareas_aseguradas: number | null;
  cliente_nombre: string | null;
  geometry: Geometry;
  siniestros: { causa: string; fecha: string | null; danio_estimado: number | null }[];
};

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await fetchAll<LoteMapa>(
    supabase,
    "lotes_mapa",
    "id, id_lote_externo, cultivo, hectareas_aseguradas, cliente_nombre, geometry, siniestros"
  );

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const features = data.map((lote) => {
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
