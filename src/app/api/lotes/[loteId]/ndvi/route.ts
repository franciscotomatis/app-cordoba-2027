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
    .select("consultado_en, desde, hasta, error, version")
    .eq("lote_id", loteId)
    .maybeSingle();

  // Versión del guion que se le manda a Copernicus. Al subirla, las series
  // pedidas con la versión anterior se rehacen solas la próxima vez que
  // alguien abra el lote. La 2 agrega el agua en superficie.
  const VERSION_SERIE = 2;

  // Se vuelve a pedir si nunca se consultó, si cambió el guion, o si pasó más
  // de una semana.
  const vencido =
    !consulta ||
    (consulta.version ?? 1) < VERSION_SERIE ||
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
              agua: p.agua,
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
            version: VERSION_SERIE,
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
    .select("fecha, ndvi, agua, nubosidad")
    .eq("lote_id", loteId)
    .gte("fecha", desdeISO)
    .order("fecha");

  const valores = (serie ?? []).map((p) => Number(p.ndvi));

  // Anegamiento: qué pasadas vieron agua sobre el lote y cuánta.
  // Se cuenta desde el 5% del lote para arriba; por debajo suele ser ruido de
  // borde (una cuneta, un bebedero) y no un lote con agua.
  const MINIMO_RELEVANTE = 0.05;
  const conAgua = (serie ?? [])
    .filter((p) => p.agua !== null && Number(p.agua) >= MINIMO_RELEVANTE)
    .map((p) => ({ fecha: p.fecha as string, agua: Number(p.agua) }));

  const agua = conAgua.length
    ? {
        fechas: conAgua.length,
        primera: conAgua[0].fecha,
        ultima: conAgua[conAgua.length - 1].fecha,
        maximo: Math.max(...conAgua.map((p) => p.agua)),
        fechaMaximo: conAgua.reduce((a, b) => (b.agua > a.agua ? b : a)).fecha,
        // Días entre la primera y la última pasada con agua. No es "días
        // anegado": es la ventana en la que se lo vio así.
        ventanaDias:
          Math.round(
            (new Date(conAgua[conAgua.length - 1].fecha).getTime() -
              new Date(conAgua[0].fecha).getTime()) /
              86400000
          ) + 5,
        detalle: conAgua,
      }
    : null;

  return NextResponse.json({
    serie: (serie ?? []).map((p) => ({
      fecha: p.fecha,
      ndvi: Number(p.ndvi),
      agua: p.agua === null ? null : Number(p.agua),
      nubosidad: p.nubosidad === null ? null : Number(p.nubosidad),
    })),
    agua,
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
