"use client";

import { useEffect, useState } from "react";

/**
 * Celda editable del rinde estimado (qq/ha). Se guarda al salir del campo o
 * con Enter; con Escape se descarta el cambio.
 */
export function CeldaRinde({
  valor,
  editable,
  onGuardar,
}: {
  valor: number | null;
  editable: boolean;
  onGuardar: (valor: number | null) => void;
}) {
  const inicial = valor === null || valor === undefined ? "" : String(valor);
  const [texto, setTexto] = useState(inicial);
  const [editando, setEditando] = useState(false);

  // Si el valor cambia desde afuera (carga en tanda, refresco), se refleja acá.
  useEffect(() => {
    if (!editando) setTexto(inicial);
  }, [inicial, editando]);

  if (!editable) {
    return (
      <span className="mono">{valor === null || valor === undefined ? "—" : valor}</span>
    );
  }

  function confirmar() {
    setEditando(false);
    const limpio = texto.trim().replace(",", ".");

    if (limpio === "") {
      if (valor !== null && valor !== undefined) onGuardar(null);
      return;
    }

    const numero = Number(limpio);
    if (!Number.isFinite(numero) || numero < 0) {
      setTexto(inicial); // valor inválido: se descarta
      return;
    }
    if (numero !== Number(valor)) onGuardar(numero);
  }

  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onFocus={() => setEditando(true)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setTexto(inicial);
          setEditando(false);
          e.currentTarget.blur();
        }
      }}
      inputMode="decimal"
      placeholder="—"
      title="Rinde estimado en quintales por hectárea"
      className={`mono w-16 rounded border bg-transparent px-1 py-0.5 text-right text-[11.5px] outline-none ${
        valor === null || valor === undefined
          ? "border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-accent)]"
          : "border-[var(--color-border)] text-[var(--color-accent)] focus:border-[var(--color-accent)]"
      }`}
    />
  );
}
