import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CAMPANIA, MESES_CAMPANIA } from "@/lib/campania";
import { clienteDeServicio } from "@/lib/supabase/servicio";

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
// El histórico termina el año antes de que arranque la campaña. Si llegara
// hasta hoy, la campaña se estaría comparando contra un promedio que la
// contiene. La normal oficial de la OMM es 1991-2020; acá la serie es más
// larga porque para juzgar una campaña sirve el clima reciente, no el de hace
// treinta años.
const FIN_NORMAL = Number(CAMPANIA.desde.slice(0, 4)) - 1;

/** Último día con dato: el reanálisis publica con unos días de atraso. */
function ultimoDiaDisponible() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  const iso = d.toISOString().slice(0, 10);
  return iso < CAMPANIA.hasta ? iso : CAMPANIA.hasta;
}
const ZONA = "America/Argentina/Cordoba";

const aCelda = (v: number) => Math.round(v * 10) / 10;

type FilaClima = {
  anio: number;
  mes: number;
  pp_mm: number;
  t_min: number | null;
  t_med: number | null;
  t_max: number | null;
  actualizado_en?: string | null;
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

  // La caché la escribe el servidor. El permiso ya se verificó arriba al leer
  // el lote con la sesión del usuario: si no puede verlo, no llega hasta acá.
  const cache = clienteDeServicio() ?? supabase;

  const lat = aCelda(lote.lat);
  const lon = aCelda(lote.lon);

  const { data: guardado } = await supabase
    .from("clima_celda")
    .select("anio, mes, pp_mm, t_min, t_med, t_max, actualizado_en")
    .eq("lat_celda", lat)
    .eq("lon_celda", lon);

  let filas = (guardado ?? []) as FilaClima[];

  // Años del histórico que no están completos (12 meses). Sirve tanto para la
  // primera carga como para sumar el año que se cerró en diciembre.
  const mesesPorAnio = new Map<number, number>();
  // Un año guardado mientras todavía transcurría tiene el último mes a medias,
  // así que no sirve para el promedio: se vuelve a pedir entero.
  const aEstrenar = new Set<number>();
  for (const f of filas) {
    if (f.anio < INICIO_NORMAL || f.anio > FIN_NORMAL) continue;
    mesesPorAnio.set(f.anio, (mesesPorAnio.get(f.anio) ?? 0) + 1);
    const guardadoEn = f.actualizado_en ? new Date(f.actualizado_en).getFullYear() : 0;
    if (guardadoEn <= f.anio) aEstrenar.add(f.anio);
  }
  const aniosFaltantes: number[] = [];
  for (let a = INICIO_NORMAL; a <= FIN_NORMAL; a++) {
    if ((mesesPorAnio.get(a) ?? 0) < 12 || aEstrenar.has(a)) aniosFaltantes.push(a);
  }

  // Meses de la campaña que ya transcurrieron y deberían tener dato.
  const finDatos = ultimoDiaDisponible();
  const mesesEsperados = MESES_CAMPANIA.filter(
    (m) => `${m.anio}-${String(m.mes).padStart(2, "0")}-01` <= finDatos
  );
  const ultimoEsperado = mesesEsperados[mesesEsperados.length - 1];
  const filaUltimo = ultimoEsperado
    ? filas.find((f) => f.anio === ultimoEsperado.anio && f.mes === ultimoEsperado.mes)
    : undefined;

  // Mientras la campaña corre, su último mes se rehace una vez por día: si no,
  // queda congelado en los milímetros que llevaba cuando se miró por primera
  // vez. Terminada la campaña el dato ya es definitivo y no se vuelve a pedir.
  const campaniaEnCurso = finDatos < CAMPANIA.hasta;
  const faltaActual =
    mesesEsperados.some(
      (m) => !filas.some((f) => f.anio === m.anio && f.mes === m.mes)
    ) ||
    (campaniaEnCurso &&
      (!filaUltimo ||
        Date.now() - new Date(filaUltimo.actualizado_en ?? 0).getTime() > 86_400_000));

  if (aniosFaltantes.length > 0 || faltaActual) {
    const nuevas: FilaClima[] = [];

    try {
      if (aniosFaltantes.length > 0) {
        nuevas.push(
          ...(await bajarDeOpenMeteo(
            lat,
            lon,
            `${aniosFaltantes[0]}-01-01`,
            `${aniosFaltantes[aniosFaltantes.length - 1]}-12-31`
          ))
        );
      }
      if (faltaActual) {
        nuevas.push(...(await bajarDeOpenMeteo(lat, lon, CAMPANIA.desde, finDatos)));
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
      await cache.from("clima_celda").upsert(
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

  // Promedio del período histórico, mes a mes.
  const acumulado = new Map<number, { suma: number; n: number }>();

  for (const f of filas) {
    if (f.anio < INICIO_NORMAL || f.anio > FIN_NORMAL) continue;
    const a = acumulado.get(f.mes) ?? { suma: 0, n: 0 };
    a.suma += Number(f.pp_mm);
    a.n++;
    acumulado.set(f.mes, a);
  }

  // La serie sigue el año agrícola, de julio a junio: partirla por año
  // calendario cortaría la campaña justo en el medio del verano.
  const porAnioMes = new Map(
    filas.map((f) => [`${f.anio}-${f.mes}`, Number(f.pp_mm)])
  );

  const serie = MESES_CAMPANIA.map((m) => {
    const h = acumulado.get(m.mes);
    const actual = porAnioMes.get(`${m.anio}-${m.mes}`);
    return {
      mes: m.etiqueta,
      anio: m.anio,
      numeroMes: m.mes,
      historico: h && h.n > 0 ? Math.round((h.suma / h.n) * 10) / 10 : null,
      actual: actual === undefined ? null : actual,
    };
  });

  const totalHistorico = serie.reduce((a, m) => a + (m.historico ?? 0), 0);
  const totalActual = serie.reduce((a, m) => a + (m.actual ?? 0), 0);
  // Para comparar peras con peras: el histórico solo de los meses ya vividos.
  const historicoALaFecha = serie.reduce(
    (a, m) => a + (m.actual !== null ? (m.historico ?? 0) : 0),
    0
  );

  // --- Día a día de la campaña ---
  // El promedio mensual esconde las heladas y los golpes de calor, y también
  // esconde si los 200 mm de un mes cayeron en una tarde o repartidos.
  const desdeISO = CAMPANIA.desde;
  const hastaISO = finDatos;

  let { data: dias } = await supabase
    .from("clima_dia")
    .select("fecha, pp_mm, t_min, t_med, t_max")
    .eq("lat_celda", lat)
    .eq("lon_celda", lon)
    .gte("fecha", desdeISO)
    .lte("fecha", hastaISO)
    .order("fecha");

  const conTemperatura = (dias ?? []).filter((d) => d.t_med !== null).length;
  const esperados = Math.round(
    (new Date(hastaISO).getTime() - new Date(desdeISO).getTime()) / 86400000
  );

  // Si falta buena parte del período, se pide de nuevo y se guarda.
  if (conTemperatura < esperados * 0.9) {
    try {
      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${desdeISO}&end_date=${hastaISO}` +
        `&daily=precipitation_sum,temperature_2m_min,temperature_2m_mean,temperature_2m_max` +
        `&timezone=${encodeURIComponent(ZONA)}`;

      const r = await fetch(url);
      if (r.ok) {
        const d = (await r.json()) as {
          daily?: {
            time: string[];
            precipitation_sum: (number | null)[];
            temperature_2m_min: (number | null)[];
            temperature_2m_mean: (number | null)[];
            temperature_2m_max: (number | null)[];
          };
        };

        if (d.daily) {
          const filasDia = d.daily.time.map((fecha, i) => ({
            lat_celda: lat,
            lon_celda: lon,
            fecha,
            pp_mm: d.daily!.precipitation_sum[i] ?? 0,
            t_min: d.daily!.temperature_2m_min[i],
            t_med: d.daily!.temperature_2m_mean[i],
            t_max: d.daily!.temperature_2m_max[i],
          }));

          await cache
            .from("clima_dia")
            .upsert(filasDia, { onConflict: "lat_celda,lon_celda,fecha" });

          dias = filasDia.map((f) => ({
            fecha: f.fecha,
            pp_mm: f.pp_mm,
            t_min: f.t_min,
            t_med: f.t_med,
            t_max: f.t_max,
          }));
        }
      }
    } catch {
      // Si falla, se muestra lo que haya guardado.
    }
  }

  const serieTemperatura = (dias ?? [])
    .filter((d) => d.t_min !== null && d.t_max !== null)
    .map((d) => ({
      fecha: d.fecha as string,
      min: Number(d.t_min),
      med: d.t_med === null ? null : Number(d.t_med),
      max: Number(d.t_max),
      // Recharts dibuja una banda cuando el valor es un par [desde, hasta].
      rango: [Number(d.t_min), Number(d.t_max)] as [number, number],
    }));

  // Umbrales agronómicos: helada meteorológica a 0 °C y golpe de calor a 35 °C.
  const HELADA = 0;
  const CALOR = 35;
  const heladas = serieTemperatura.filter((d) => d.min <= HELADA);
  const calores = serieTemperatura.filter((d) => d.max >= CALOR);

  const resumenTemperatura = serieTemperatura.length
    ? {
        desde: serieTemperatura[0].fecha,
        hasta: serieTemperatura[serieTemperatura.length - 1].fecha,
        heladas: heladas.length,
        ultimaHelada: heladas.length ? heladas[heladas.length - 1].fecha : null,
        minima: Math.min(...serieTemperatura.map((d) => d.min)),
        diasCalor: calores.length,
        maxima: Math.max(...serieTemperatura.map((d) => d.max)),
        umbralHelada: HELADA,
        umbralCalor: CALOR,
      }
    : null;

  // Día a día también para la lluvia: es lo que permite mirar un mes puntual
  // y ver en qué fechas cayó, en vez de un único número mensual.
  const lluviaDiaria = (dias ?? [])
    .filter((d) => d.pp_mm !== null && d.pp_mm !== undefined)
    .map((d) => ({ fecha: d.fecha as string, mm: Number(d.pp_mm) }));

  return NextResponse.json({
    campania: CAMPANIA.etiqueta,
    desde: CAMPANIA.desde,
    hasta: finDatos,
    serie,
    lluviaDiaria,
    temperatura: serieTemperatura,
    resumenTemperatura,
    totalHistorico: Math.round(totalHistorico),
    totalActual: Math.round(totalActual),
    historicoALaFecha: Math.round(historicoALaFecha),
    fuente: `Open-Meteo · reanálisis ERA5-Land · normal ${INICIO_NORMAL}-${FIN_NORMAL}`,
    celda: { lat, lon },
  });
}
