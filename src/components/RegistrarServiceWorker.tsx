"use client";

import { useEffect } from "react";

/**
 * Registra el service worker que hace que la app abra sin señal.
 *
 * Va acá adentro y no en el layout del servidor porque necesita ejecutarse en
 * el navegador. En desarrollo no se registra: cachear archivos mientras se
 * está editando el código genera confusión al pedo.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin service worker la app funciona igual, solo que necesita señal.
    });
  }, []);

  return null;
}
