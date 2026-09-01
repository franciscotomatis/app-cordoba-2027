import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { colorPorCultivo } from "@/lib/colores";
import type { Geometry } from "geojson";

type Siniestro = { causa: string; fecha: string | null; danio_estimado: number | null };

type LoteMapa = {
  id: string;
  id_lote_externo: string;
  lote_nombre: string | null;
  campo: string | null;
  departamento: string | null;
  localidad: string | null;
  cultivo: string | null;
  cultivo_anterior: string | null;
  hectareas_aseguradas: number | null;
  hectareas_declaradas: number | null;
  porcentaje_asegurado: number | null;
  rendimiento_asegurado: number | null;
  rendimiento_anterior: number | null;
  suma_asegurada: number | null;
  fecha_siembra: string | null;
  estado: string | null;
  cliente_nombre: string | null;
  cliente_cuit: string | null;
  zona_nombre: string | null;
  geometry: Geometry;
  siniestros: Siniestro[];
};

const COLUMNAS = [
  "id",
  "id_lote_externo",
  "lote_nombre",
  "campo",
  "departamento",
  "localidad",
  "cultivo",
  "cultivo_anterior",
  "hectareas_aseguradas",
  "hectareas_declaradas",
  "porcentaje_asegurado",
  "rendimiento_asegurado",
  "rendimiento_anterior",
  "suma_asegurada",
  "fecha_siembra",
  "estado",
  "cliente_nombre",
  "cliente_cuit",
  "zona_nombre",
  "geometry",
  "siniestros",
].join(", ");

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await fetchAll<LoteMapa>(supabase, "lotes_mapa", COLUMNAS);

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const features = data.map((l) => {
    const color = colorPorCultivo(l.cultivo);
    return {
      type: "Feature" as const,
      geometry: l.geometry,
      properties: {
        id: l.id,
        loteId: l.id_lote_externo,
        lote: l.lote_nombre,
        campo: l.campo,
        departamento: l.departamento,
        localidad: l.localidad,
        cultivo: l.cultivo,
        cultivoAnterior: l.cultivo_anterior,
        hectareas: l.hectareas_aseguradas,
        hectareasDeclaradas: l.hectareas_declaradas,
        porcentajeAsegurado: l.porcentaje_asegurado,
        rendimientoAsegurado: l.rendimiento_asegurado,
        rendimientoAnterior: l.rendimiento_anterior,
        sumaAsegurada: l.suma_asegurada,
        fechaSiembra: l.fecha_siembra,
        estado: l.estado,
        cliente: l.cliente_nombre,
        cuit: l.cliente_cuit,
        zona: l.zona_nombre,
        siniestros: l.siniestros ?? [],
        fill: color.fill,
        borde: color.borde,
      },
    };
  });

  return NextResponse.json({ type: "FeatureCollection", features });
}
