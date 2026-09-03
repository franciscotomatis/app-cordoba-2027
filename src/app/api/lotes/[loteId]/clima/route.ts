import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Precipitación mensual del lote: promedio histórico contra el año en curso.
 *
 * Fuente: Open-Meteo (reanálisis ERA5-Land), la misma para las dos series.
 * Es a propósito: si el histórico saliera de un producto y el año actual de
 * otro, la diferencia entre ambos arrastraría el sesgo entre las fuentes y la
 * comparación no diría nada.
 *
 * El dato se guarda por celda de 0,1° (~11 km, la resolución real del
 * producto), así que los lotes vecinos comparten la misma consulta.
 */

const INICIO_NORMAL = 1991;
const FIN_NORMAL = 2020;
const ZONA = "America/Argentina/Cordoba";

const aCelda = (v: number) => Math.round(v * 10) / 10;

type FilaClima = {
  anio: number;
  mes: number;
  pp_mm: number;
  t_min: number | null;
  t_med: number | null;
  t_max: number | null;
};

async function bajarDeOpenMeteo(lat: number, lon: number, desde: string, hasta: string) {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${desde}&end_date=${hasta}` +
    `&daily=precipitation_sum,temperature_2m_min,temperature_2m_mean,temperature_2m_max` +
    `&timezone=${encodeURIComponent(ZONA)}`;

  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`);

  const datos = (await r.json()) as {
    daily?: {
      time: string[];
      precipitation_sum: (number | null)[];
      temperature_2m_min: (number | null)[];
      temperature_2m_mean: (number | null)[];
      temperature_2m_max: (number | null)[];
    };
  };
  if (!datos.daily) throw new Error("Open-Meteo no devolvió datos diarios");

  // De diario a mensual: la lluvia se suma, las temperaturas se promedian.
  const porMes = new Map<
    string,
    { mm: number; min: number; med: number; max: number; dias: number }
  >();

  datos.daily.time.forEach((dia, i) => {
    const clave = dia.slice(0, 7); // aaaa-mm
    const acumulado = porMes.get(clave) ?? { mm: 0, min: 0, med: 0, max: 0, dias: 0 };

    acumulado.mm += datos.daily!.precipitation_sum[i] ?? 0;

    const tmin = datos.daily!.temperature_2m_min[i];
    const tmed = datos.daily!.temperature_2m_mean[i];
    const tmax = datos.daily!.temperature_2m_max[i];
    if (tmin !== null && tmed !== null && tmax !== null) {
      acumulado.min += tmin;
      acumulado.med += tmed;
      acumulado.max += tmax;
      acumulado.dias++;
    }

    porMes.set(clave, acumulado);
  });

  const redondear = (v: number) => Math.round(v * 10) / 10;

  return [...porMes.entries()].map(([clave, a]) => ({
    anio: Number(clave.slice(0, 4)),
    mes: Number(clave.slice(5, 7)),
    pp_mm: redondear(a.mm),
    t_min: a.dias ? redondear(a.min / a.dias) : null,
    t_med: a.dias ? redondear(a.med / a.dias) : null,
    t_max: a.dias ? redondear(a.max / a.dias) : null,
  }));
}

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

  // El lote se lee con RLS: si el usuario no puede verlo, tampoco ve su clima.
  const { data: lote } = await supabase
    .from("lotes_mapa")
    .select("lat, lon")
    .eq("id", loteId)
    .maybeSingle();

  if (!lote?.lat || !lote?.lon) {
    return NextResponse.json({ error: "Lote sin ubicación" }, { status: 404 });
  }

  const lat = aCelda(lote.lat);
  const lon = aCelda(lote.lon);
  const anioActual = new Date().getFullYear();

  const { data: guardado } = await supabase
    .from("clima_celda")
    .select("anio, mes, pp_mm, t_min, t_med, t_max")
    .eq("lat_celda", lat)
    .eq("lon_celda", lon);

  let filas = (guardado ?? []) as FilaClima[];

  const tieneNormales = filas.some(
    (f) => f.anio >= INICIO_NORMAL && f.anio <= FIN_NORMAL
  );
  const mesesActuales = filas.filter((f) => f.anio === anioActual).length;
  const mesEsperado = new Date().getMonth() + 1;
  // Se rearma el año en curso si falta algún mes ya transcurrido.
  const faltaActual = mesesActuales < mesEsperado - 1;

  if (!tieneNormales || faltaActual) {
    const nuevas: FilaClima[] = [];

    try {
      if (!tieneNormales) {
        nuevas.push(
          ...(await bajarDeOpenMeteo(
            lat,
            lon,
            `${INICIO_NORMAL}-01-01`,
            `${FIN_NORMAL}-12-31`
          ))
        );
      }
      if (faltaActual) {
        const hoy = new Date();
        hoy.setDate(hoy.getDate() - 6); // el reanálisis tiene unos días de demora
        nuevas.push(
          ...(await bajarDeOpenMeteo(
            lat,
            lon,
            `${anioActual}-01-01`,
            hoy.toISOString().slice(0, 10)
          ))
        );
      }
    } catch (e) {
      // Si la fuente falla, se responde con lo que haya en caché.
      if (filas.length === 0) {
        return NextResponse.json(
          { error: `No se pudo obtener la precipitación: ${(e as Error).message}` },
          { status: 502 }
        );
      }
    }

    if (nuevas.length > 0) {
      await supabase.from("clima_celda").upsert(
        nuevas.map((f) => ({
          lat_celda: lat,
          lon_celda: lon,
          anio: f.anio,
          mes: f.mes,
          pp_mm: f.pp_mm,
          t_min: f.t_min,
          t_med: f.t_med,
          t_max: f.t_max,
          actualizado_en: new Date().toISOString(),
        })),
        { onConflict: "lat_celda,lon_celda,anio,mes" }
      );

      const soloNuevas = new Set(nuevas.map((f) => `${f.anio}-${f.mes}`));
      filas = [...filas.filter((f) => !soloNuevas.has(`${f.anio}-${f.mes}`)), ...nuevas];
    }
  }

  // Promedio 1991-2020 por mes.
  const acumulado = new Map<number, { suma: number; n: number }>();
  const temperatura = new Map<
    number,
    { min: number; med: number; max: number; n: number }
  >();

  for (const f of filas) {
    if (f.anio < INICIO_NORMAL || f.anio > FIN_NORMAL) continue;

    const a = acumulado.get(f.mes) ?? { suma: 0, n: 0 };
    a.suma += Number(f.pp_mm);
    a.n++;
    acumulado.set(f.mes, a);

    if (f.t_min !== null && f.t_med !== null && f.t_max !== null) {
      const t = temperatura.get(f.mes) ?? { min: 0, med: 0, max: 0, n: 0 };
      t.min += Number(f.t_min);
      t.med += Number(f.t_med);
      t.max += Number(f.t_max);
      t.n++;
      temperatura.set(f.mes, t);
    }
  }

  const actualPorMes = new Map(
    filas.filter((f) => f.anio === anioActual).map((f) => [f.mes, Number(f.pp_mm)])
  );

  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  const serie = MESES.map((etiqueta, i) => {
    const mes = i + 1;
    const h = acumulado.get(mes);
    return {
      mes: etiqueta,
      historico: h && h.n > 0 ? Math.round((h.suma / h.n) * 10) / 10 : null,
      actual: actualPorMes.has(mes) ? actualPorMes.get(mes)! : null,
    };
  });

  const totalHistorico = serie.reduce((a, m) => a + (m.historico ?? 0), 0);
  const totalActual = serie.reduce((a, m) => a + (m.actual ?? 0), 0);
  // Para comparar peras con peras: el histórico solo de los meses ya vividos.
  const historicoALaFecha = serie.reduce(
    (a, m) => a + (m.actual !== null ? (m.historico ?? 0) : 0),
    0
  );

  const redondearT = (v: number) => Math.round(v * 10) / 10;

  const serieTemperatura = MESES.map((etiqueta, i) => {
    const t = temperatura.get(i + 1);
    if (!t || t.n === 0) {
      return { mes: etiqueta, min: null, med: null, max: null, rango: null };
    }
    const min = redondearT(t.min / t.n);
    const max = redondearT(t.max / t.n);
    return {
      mes: etiqueta,
      min,
      med: redondearT(t.med / t.n),
      max,
      // Recharts dibuja una banda cuando el valor es un par [desde, hasta].
      rango: [min, max] as [number, number],
    };
  });

  return NextResponse.json({
    anio: anioActual,
    serie,
    temperatura: serieTemperatura,
    totalHistorico: Math.round(totalHistorico),
    totalActual: Math.round(totalActual),
    historicoALaFecha: Math.round(historicoALaFecha),
    fuente: `Open-Meteo · reanálisis ERA5-Land · normal ${INICIO_NORMAL}-${FIN_NORMAL}`,
    celda: { lat, lon },
  });
}
