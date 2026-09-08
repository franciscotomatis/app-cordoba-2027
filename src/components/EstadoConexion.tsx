"use client";

import { useEffect, useState } from "react";
import { CloudOff, CloudUpload, Loader2, WifiOff } from "lucide-react";
import { alCambiarLaCola, sincronizar, vigilarConexion } from "@/lib/cola";
import { pedirAlmacenamientoPersistente } from "@/lib/almacen";

/**
 * Estado de la conexión y de lo que falta subir.
 *
 * Está siempre a la vista cuando hay algo pendiente: el perito no se tiene que
 * ir del campo creyendo que ya subió lo que cargó.
 */
export function EstadoConexion() {
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    const cambio = () => setEnLinea(navigator.onLine);
    window.addEventListener("online", cambio);
    window.addEventListener("offline", cambio);

    const dejarDeEscuchar = alCambiarLaCola(setPendientes);
    vigilarConexion();
    void pedirAlmacenamientoPersistente();

    return () => {
      window.removeEventListener("online", cambio);
      window.removeEventListener("offline", cambio);
      dejarDeEscuchar();
    };
  }, []);

  async function subirAhora() {
    setSubiendo(true);
    await sincronizar();
    setSubiendo(false);
  }

  // Todo en orden y sin nada pendiente: no hace falta ocupar lugar.
  if (enLinea && pendientes === 0) return null;

  if (!enLinea) {
    return (
      <span
        className="flex items-center gap-1.5 rounded-md border border-[var(--color-warning)] px-2 py-1 text-[11.5px] text-[var(--color-warning)]"
        title="Lo que cargues queda guardado en el teléfono y se sube cuando vuelva la señal"
      >
        <WifiOff className="h-3.5 w-3.5" />
        Sin señal
        {pendientes > 0 && (
          <span className="mono font-semibold">· {pendientes} sin subir</span>
        )}
      </span>
    );
  }

  return (
    <button
      onClick={subirAhora}
      disabled={subiendo}
      title="Subir ahora lo que quedó pendiente"
      className="flex items-center gap-1.5 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 text-[11.5px] font-medium text-[var(--color-accent)] disabled:opacity-60"
    >
      {subiendo ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CloudUpload className="h-3.5 w-3.5" />
      )}
      <span className="mono font-semibold">{pendientes}</span>
      {subiendo ? "subiendo..." : "sin subir"}
    </button>
  );
}

/** Cartel para el detalle del lote, cuando algo quedó guardado sin subir. */
export function AvisoPendiente({ cantidad }: { cantidad: number }) {
  if (cantidad === 0) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-warning)]">
      <CloudOff className="h-3.5 w-3.5" />
      Guardado en el teléfono. Se sube solo cuando haya señal.
    </p>
  );
}
