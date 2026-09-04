"use client";

import { useState } from "react";

/**
 * Marca de la aplicación.
 *
 * Si existe el archivo public/logo-sancor.svg (o .png) se usa ese, que es lo
 * correcto: el isotipo oficial es una marca registrada y debe venir del
 * archivo original, no dibujado a mano. Mientras no esté, se muestra la
 * inicial en el magenta institucional para no dejar el lugar vacío.
 */
export function Marca({ tamanio = "normal" }: { tamanio?: "normal" | "grande" }) {
  const [sinLogo, setSinLogo] = useState(false);

  const lado = tamanio === "grande" ? "h-8 w-8" : "h-7 w-7";
  const texto = tamanio === "grande" ? "text-[14px]" : "text-[13px]";

  return (
    <div className="flex items-center gap-2">
      {sinLogo ? (
        <div
          className={`flex ${lado} shrink-0 items-center justify-center rounded-md text-[15px] font-bold text-white`}
          style={{ background: "var(--color-marca)" }}
          aria-hidden
        >
          S
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logo-sancor.svg"
          alt="Sancor Seguros"
          className={`${lado} shrink-0 rounded-md object-contain`}
          onError={() => setSinLogo(true)}
        />
      )}

      <div className="leading-tight">
        <p className={`${texto} font-semibold`}>Multirriesgo Córdoba</p>
        <p className="mono text-[10px] text-[var(--color-ink-faint)]">25/26</p>
      </div>
    </div>
  );
}
