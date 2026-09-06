import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Pone al día la capa de lluvia de la provincia. La ejecuta Vercel Cron una vez
 * por día (ver vercel.json); un administrador también puede dispararla a mano.
 *
 * Rehace siempre una ventana de los últimos días en lugar de continuar desde el
 * último dato: así, si una corrida queda a medias, la siguiente la completa
 * sola. Volver a escribir un día ya guardado no cuesta nada porque el upsert
 * pisa el valor.
 */

export const maxDuration = 60;

const ZONA = "America/Argentina/Cordoba";
// ERA5-Land publica con unos días de atraso: pedir hasta hoy devuelve vacío.
const DEMORA_DIAS = 6;
const VENTANA_DIAS = 12;
const GAP_MAXIMO_DIAS = 60;
const PUNTOS_POR_CONSULTA = 100;
const EN_PARALELO = 3;
const PRESUPUESTO_MS = 50_000;

const fechaISO = (d: Date) => d.toISOString().slice(0, 10);

async function pedir(url: string, intentos = 3): Promise<Response> {
  for (let i = 1; i <= intentos; i++) {
    const r = await fetch(url);
    if (r.ok) return r;
    if (r.status !== 429) throw new Error(`Open-Meteo respondió ${r.status}`);
    await new Promise((res) => setTimeout(res, 1500 * i));
  }
  throw new Error("Open-Meteo sigue rechazando por límite de consultas");
}

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  const cabecera = request.headers.get("authorization");
  const esCron = Boolean(secreto) && cabecera === `Bearer ${secreto}`;

  if (!esCron) {
    // Sin el secreto, solo un administrador logueado puede correrla.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: perfil } = user
      ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : { data: null };
    if (perfil?.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 500 }
    );
  }
  const db = createServiceClient(url, clave, { auth: { persistSession: false } });

  const { data: celdasCrudas, error: errorCeldas } = await db.rpc("celdas_provincia");
  if (errorCeldas) {
    return NextResponse.json({ error: errorCeldas.message }, { status: 500 });
  }
  const celdas = (celdasCrudas ?? []) as [number, number][];
  if (celdas.length === 0) {
    return NextResponse.json({
      ok: true,
      aviso: "La grilla está vacía: hay que hacer la carga inicial con scripts/cargar-lluvia.mjs.",
    });
  }

  const hasta = new Date();
  hasta.setDate(hasta.getDate() - DEMORA_DIAS);

  // Se rehace la ventana habitual, o el hueco entero si hace mucho que no corre.
  const { data: ultima } = await db
    .from("clima_dia")
    .select("fecha")
    .eq("en_provincia", true)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - VENTANA_DIAS);
  if (ultima?.fecha) {
    const tope = new Date(hasta);
    tope.setDate(tope.getDate() - GAP_MAXIMO_DIAS);
    const ultimaFecha = new Date(`${String(ultima.fecha).slice(0, 10)}T00:00:00Z`);
    if (ultimaFecha < desde) desde.setTime(Math.max(ultimaFecha.getTime(), tope.getTime()));
  }

  const desdeISO = fechaISO(desde);
  const hastaISO = fechaISO(hasta);
  if (desdeISO > hastaISO) {
    return NextResponse.json({ ok: true, aviso: "Ya está al día." });
  }

  const arranque = Date.now();
  const grupos: [number, number][][] = [];
  for (let i = 0; i < celdas.length; i += PUNTOS_POR_CONSULTA) {
    grupos.push(celdas.slice(i, i + PUNTOS_POR_CONSULTA));
  }

  let guardados = 0;
  let gruposHechos = 0;
  let fallo: string | null = null;

  for (let i = 0; i < grupos.length && !fallo; i += EN_PARALELO) {
    if (Date.now() - arranque > PRESUPUESTO_MS) break;

    const tanda = grupos.slice(i, i + EN_PARALELO);
    const respuestas = await Promise.all(
      tanda.map(async (grupo) => {
        const consulta =
          `https://archive-api.open-meteo.com/v1/archive` +
          `?latitude=${grupo.map((g) => g[0]).join(",")}` +
          `&longitude=${grupo.map((g) => g[1]).join(",")}` +
          `&start_date=${desdeISO}&end_date=${hastaISO}&daily=precipitation_sum` +
          `&timezone=${encodeURIComponent(ZONA)}`;
        const r = await pedir(consulta);
        return { grupo, cuerpo: await r.json() };
      })
    ).catch((e: Error) => {
      fallo = e.message;
      return [];
    });

    const filas: {
      lat_celda: number;
      lon_celda: number;
      fecha: string;
      pp_mm: number;
      en_provincia: boolean;
    }[] = [];

    for (const { grupo, cuerpo } of respuestas) {
      const lista = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]) as {
        daily?: { time: string[]; precipitation_sum: (number | null)[] };
      }[];

      lista.forEach((punto, indice) => {
        const celda = grupo[indice];
        if (!celda) return;
        const dias = punto?.daily?.time ?? [];
        const mm = punto?.daily?.precipitation_sum ?? [];
        dias.forEach((dia, j) => {
          const valor = mm[j];
          if (valor === null || valor === undefined) return;
          filas.push({
            lat_celda: celda[0],
            lon_celda: celda[1],
            fecha: dia,
            pp_mm: Math.round(valor * 10) / 10,
            en_provincia: true,
          });
        });
      });
    }

    for (let k = 0; k < filas.length; k += 2000) {
      const { error } = await db
        .from("clima_dia")
        .upsert(filas.slice(k, k + 2000), { onConflict: "lat_celda,lon_celda,fecha" });
      if (error) {
        fallo = error.message;
        break;
      }
      guardados += Math.min(2000, filas.length - k);
    }

    gruposHechos += tanda.length;
  }

  return NextResponse.json({
    ok: !fallo,
    error: fallo,
    desde: desdeISO,
    hasta: hastaISO,
    celdas: celdas.length,
    gruposHechos,
    gruposTotales: grupos.length,
    diasGuardados: guardados,
    segundos: Math.round((Date.now() - arranque) / 1000),
  });
}
