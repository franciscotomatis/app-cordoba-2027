"use client";

import { useEffect, useState } from "react";

/**
 * Filtros y vistas que sobreviven al cambio de pestaña.
 *
 * Va en sessionStorage y no en localStorage a propósito: dura mientras la
 * pestaña del navegador esté abierta, así el que entra mañana arranca limpio
 * en vez de encontrarse con el recorte de ayer sin acordarse de haberlo puesto.
 */
const PREFIJO = "cba:";

export function leerGuardado<T>(clave: string, inicial: T): T {
  if (typeof window === "undefined") return inicial;
  try {
    const crudo = sessionStorage.getItem(PREFIJO + clave);
    return crudo === null ? inicial : (JSON.parse(crudo) as T);
  } catch {
    return inicial;
  }
}

export function guardar<T>(clave: string, valor: T) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    // Sin espacio o con el almacenamiento bloqueado: no vale romper por esto.
  }
}

/**
 * Igual que useState, pero recordando el valor entre pestañas.
 *
 * La lectura va en un efecto y no en el valor inicial porque estos componentes
 * también se pintan en el servidor: si el primer render del cliente devolviera
 * algo distinto, React marcaría el HTML como no coincidente.
 */
export function useEstadoGuardado<T>(clave: string, inicial: T) {
  const [valor, setValor] = useState<T>(inicial);
  const [restaurado, setRestaurado] = useState(false);

  useEffect(() => {
    setValor(leerGuardado(clave, inicial));
    setRestaurado(true);
    // Solo al montar: la clave no cambia en el ciclo de vida del componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurado) return;
    guardar(clave, valor);
  }, [clave, valor, restaurado]);

  return [valor, setValor] as const;
}
