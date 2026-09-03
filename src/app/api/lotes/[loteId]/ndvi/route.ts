import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hayCredenciales, serieNdvi } from "@/lib/copernicus";
import type { Geometry } from "geojson";

// Ventana de la serie: los últimos doce meses, que cubren la campaña en curso.
const MESES = 12;

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

  // Se lee con RLS: si el usuario no ve el lote, tampoco su NDVI.
  const { data: lote } = await supabase
    .from("lotes_mapa")
    .select("geometry")
    .eq("id", loteId)
    .maybeSingle();

  if (!lote?.geometry) {
    return NextResponse.json({ error: "Lote sin geometría" }, { status: 404 });
  }

  const hasta = new Date();
  hasta.setDate(hasta.getDate() - 1);
  const desde = new Date(hasta);
  desde.setMonth(desde.getMonth() - MESES);
  const desdeISO = desde.toISOString().slice(0, 10);
  const hastaISO = hasta.toISOString().slice(0, 10);

  const { data: consulta } = await supabase
    .from("ndvi_consulta")
    .select("consultado_en, desde, hasta, error")
    .eq("lote_id", loteId)
    .maybeSingle();

  // Se vuelve a pedir si nunca se consultó o si pasó más de una semana.
  const vencido =
    !consulta ||
    consulta.desde > desdeISO ||
    Date.now() - new Date(consulta.consultado_en).getTime() > 7 * 86400000;

  let avisoFuente: string | null = null;

  if (vencido) {
    if (!hayCredenciales()) {
      avisoFuente =
        "Falta configurar las credenciales de Copernicus (COPERNICUS_CLIENT_ID y COPERNICUS_CLIENT_SECRET).";
    } else {
      try {
        const { puntos, diagnostico } = await serieNdvi(
          lote.geometry as Geometry,
          desdeISO,
          hastaISO
        );

        // Si no hay ninguna fecha útil conviene decir por qué.
        if (puntos.length === 0) {
          avisoFuente =
            diagnostico.conError > 0
              ? `Copernicus no pudo procesar ${diagnostico.conError} de ${diagnostico.intervalos} períodos (${diagnostico.motivos.join(", ")}).`
              : diagnostico.descartadosPorNubes > 0
                ? `Las ${diagnostico.descartadosPorNubes} pasadas del período tenían demasiadas nubes sobre el lote (cobertura observada: ${diagnostico.coberturas.join(", ")}).`
                : "Sentinel-2 no devolvió imágenes útiles para este lote en el período.";
        }

        if (puntos.length > 0) {
          await supabase.from("ndvi_lote").upsert(
            puntos.map((p) => ({
              lote_id: loteId,
              fecha: p.fecha,
              ndvi: p.ndvi,
              nubosidad: 1 - p.cobertura,
            })),
            { onConflict: "lote_id,fecha" }
          );
        }

        await supabase.from("ndvi_consulta").upsert(
          {
            lote_id: loteId,
            desde: desdeISO,
            hasta: hastaISO,
            consultado_en: new Date().toISOString(),
            fechas: puntos.length,
            error: null,
          },
          { onConflict: "lote_id" }
        );
      } catch (e) {
        avisoFuente = (e as Error).message;
        await supabase.from("ndvi_consulta").upsert(
          {
            lote_id: loteId,
            desde: desdeISO,
            hasta: hastaISO,
            consultado_en: new Date().toISOString(),
            fechas: 0,
            error: avisoFuente,
          },
          { onConflict: "lote_id" }
        );
      }
    }
  }

  const { data: serie } = await supabase
    .from("ndvi_lote")
    .select("fecha, ndvi, nubosidad")
    .eq("lote_id", loteId)
    .gte("fecha", desdeISO)
    .order("fecha");

  const valores = (serie ?? []).map((p) => Number(p.ndvi));

  return NextResponse.json({
    serie: (serie ?? []).map((p) => ({
      fecha: p.fecha,
      ndvi: Number(p.ndvi),
      nubosidad: p.nubosidad === null ? null : Number(p.nubosidad),
    })),
    resumen: valores.length
      ? {
          desde: serie![0].fecha,
          hasta: serie![serie!.length - 1].fecha,
          fechas: valores.length,
          maximo: Math.max(...valores),
          ultimo: valores[valores.length - 1],
        }
      : null,
    aviso: avisoFuente,
    fuente: "Sentinel-2 L2A · Copernicus Data Space Ecosystem",
  });
}
