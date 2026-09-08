"use client";

import { createClient } from "@/lib/supabase/client";
import { DEPOSITOS, borrarLocal, guardarLocal, leerTodoLocal } from "./almacen";

/**
 * Cola de trabajo sin señal.
 *
 * A campo no hay datos. En vez de fallar, lo que el perito carga queda guardado
 * en el teléfono y se sube solo cuando vuelve la señal. Todo pasa por acá:
 * incluso con señal, primero se encola y enseguida se intenta subir, así hay un
 * solo camino que mantener en vez de dos que se desincronizan.
 */

export type Pendiente =
  | {
      id?: number;
      tipo: "rinde";
      loteId: string;
      valor: number | null;
      creado: number;
    }
  | {
      id?: number;
      tipo: "foto";
      loteId: string;
      archivo: Blob;
      nombre: string;
      lat: number | null;
      lon: number | null;
      creado: number;
    };

type Escucha = (cantidad: number) => void;
const escuchas = new Set<Escucha>();

async function avisar() {
  const cantidad = (await leerTodoLocal<Pendiente>(DEPOSITOS.cola)).length;
  for (const fn of escuchas) fn(cantidad);
}

export function alCambiarLaCola(fn: Escucha) {
  escuchas.add(fn);
  void avisar();
  return () => escuchas.delete(fn);
}

export async function pendientes() {
  return leerTodoLocal<Pendiente>(DEPOSITOS.cola);
}

/** Encola y, si hay señal, intenta subirlo en el acto. */
async function encolar(item: Pendiente) {
  await guardarLocal(DEPOSITOS.cola, { ...item, creado: Date.now() });
  await avisar();
  if (navigator.onLine) void sincronizar();
}

export const encolarRinde = (loteId: string, valor: number | null) =>
  encolar({ tipo: "rinde", loteId, valor, creado: Date.now() });

export const encolarFoto = (
  loteId: string,
  archivo: Blob,
  nombre: string,
  lat: number | null,
  lon: number | null
) => encolar({ tipo: "foto", loteId, archivo, nombre, lat, lon, creado: Date.now() });

let sincronizando = false;

/**
 * Vacía la cola contra el servidor.
 *
 * Un elemento se borra solo si el servidor lo aceptó. Si falla por falta de
 * señal, se deja para el próximo intento; si falla porque el servidor lo
 * rechazó (un lote borrado, una sesión vencida), se descarta para no quedar
 * reintentando algo que nunca va a entrar.
 */
export async function sincronizar(): Promise<{ subidos: number; fallados: number }> {
  if (sincronizando || !navigator.onLine) return { subidos: 0, fallados: 0 };
  sincronizando = true;

  let subidos = 0;
  let fallados = 0;

  try {
    const cola = await leerTodoLocal<Pendiente>(DEPOSITOS.cola);
    if (cola.length === 0) return { subidos: 0, fallados: 0 };

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { subidos: 0, fallados: cola.length };

    // Del más viejo al más nuevo: si alguien cargó dos veces el rinde del mismo
    // lote, tiene que quedar el último valor.
    for (const item of cola.sort((a, b) => a.creado - b.creado)) {
      if (item.id === undefined) continue;

      try {
        if (item.tipo === "rinde") {
          const { error } = await supabase
            .from("lotes")
            .update({
              rinde_estimado: item.valor,
              rinde_estimado_en: item.valor === null ? null : new Date().toISOString(),
              rinde_estimado_por: item.valor === null ? null : user.id,
            })
            .eq("id", item.loteId);
          if (error) throw new Error(error.message);
        } else {
          const extension = item.nombre.split(".").pop()?.toLowerCase() || "jpg";
          const ruta = `${user.id}/${item.creado}.${extension}`;

          const { error: errorSubida } = await supabase.storage
            .from("fotos")
            .upload(ruta, item.archivo, { contentType: item.archivo.type || "image/jpeg" });
          if (errorSubida) throw new Error(errorSubida.message);

          const { error: errorFila } = await supabase.from("fotos").insert({
            lote_id: item.loteId,
            storage_path: ruta,
            nombre_original: item.nombre,
            subido_por: user.id,
            geom:
              item.lat !== null && item.lon !== null
                ? `SRID=4326;POINT(${item.lon} ${item.lat})`
                : null,
          });
          if (errorFila) throw new Error(errorFila.message);
        }

        await borrarLocal(DEPOSITOS.cola, item.id);
        subidos++;
      } catch {
        fallados++;
        // Sin conexión no tiene sentido seguir probando con el resto.
        if (!navigator.onLine) break;
      }
    }
  } finally {
    sincronizando = false;
    await avisar();
  }

  return { subidos, fallados };
}

/** Arranca la sincronización automática: al volver la señal y al abrir la app. */
export function vigilarConexion() {
  const intentar = () => void sincronizar();
  window.addEventListener("online", intentar);
  // Volver a la pestaña después de un rato suele coincidir con recuperar señal.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") intentar();
  });
  intentar();
}
