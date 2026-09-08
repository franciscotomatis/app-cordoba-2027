"use client";

/**
 * Almacén local del navegador (IndexedDB), sin librerías.
 *
 * Se usa IndexedDB y no localStorage porque acá hay que guardar fotos: son
 * archivos binarios de cientos de kilobytes y localStorage solo admite texto,
 * con un tope de unos pocos megas.
 */

const BASE = "cba-offline";
const VERSION = 1;

export const DEPOSITOS = {
  /** Acciones hechas sin señal, esperando subir. */
  cola: "cola",
  /** Lotes asignados al perito, para poder trabajar sin datos. */
  lotes: "lotes",
} as const;

let conexion: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (conexion) return conexion;

  conexion = new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BASE, VERSION);

    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(DEPOSITOS.cola)) {
        db.createObjectStore(DEPOSITOS.cola, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(DEPOSITOS.lotes)) {
        db.createObjectStore(DEPOSITOS.lotes, { keyPath: "clave" });
      }
    };

    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error ?? new Error("No se pudo abrir el almacén"));
  });

  return conexion;
}

async function transaccion<T>(
  deposito: string,
  modo: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(deposito, modo);
    const pedido = fn(tx.objectStore(deposito));
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error ?? new Error("Falló la operación local"));
  });
}

export const guardarLocal = <T>(deposito: string, valor: T) =>
  transaccion<IDBValidKey>(deposito, "readwrite", (s) => s.put(valor as never));

export const leerLocal = <T>(deposito: string, clave: IDBValidKey) =>
  transaccion<T | undefined>(deposito, "readonly", (s) => s.get(clave));

export const leerTodoLocal = <T>(deposito: string) =>
  transaccion<T[]>(deposito, "readonly", (s) => s.getAll());

export const borrarLocal = (deposito: string, clave: IDBValidKey) =>
  transaccion<undefined>(deposito, "readwrite", (s) => s.delete(clave));

export const contarLocal = (deposito: string) =>
  transaccion<number>(deposito, "readonly", (s) => s.count());

/**
 * Le pide al navegador que no borre estos datos si el teléfono se queda sin
 * espacio. No siempre lo concede —en iPhone depende de si la app está en la
 * pantalla de inicio— pero pedirlo es gratis y cambia mucho la probabilidad de
 * que una foto sacada a campo siga ahí a la noche.
 */
export async function pedirAlmacenamientoPersistente() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
