/**
 * Marca de la aplicación: "SS" de Sancor Seguros en el magenta institucional.
 *
 * Es tipografía, no una imagen: así se dibuja en el primer pintado y no
 * depende de que cargue ningún archivo.
 */
export function Marca({ tamanio = "normal" }: { tamanio?: "normal" | "grande" }) {
  const grande = tamanio === "grande";

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex shrink-0 items-center justify-center rounded-md font-bold tracking-tight text-white ${
          grande ? "h-8 w-8 text-[14px]" : "h-7 w-7 text-[12.5px]"
        }`}
        style={{ background: "var(--color-marca)" }}
        aria-label="Sancor Seguros"
      >
        SS
      </div>

      <div className="leading-tight">
        <p className={`font-semibold ${grande ? "text-[14px]" : "text-[13px]"}`}>
          Multirriesgo Córdoba
        </p>
        <p className="mono text-[10px] text-[var(--color-ink-faint)]">25/26</p>
      </div>
    </div>
  );
}
