"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

/**
 * Borra una foto pidiendo confirmación en el mismo botón: borrar es
 * irreversible y no conviene que salga de un solo clic.
 */
export function BotonBorrarFoto({
  fotoId,
  onBorrada,
  className = "",
}: {
  fotoId: string;
  onBorrada: (aviso: string | null) => void;
  className?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  async function borrar() {
    setBorrando(true);
    try {
      const r = await fetch("/api/fotos/borrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: fotoId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        onBorrada(d.error ?? "No se pudo borrar la foto.");
        setBorrando(false);
        setConfirmando(false);
        return;
      }
      onBorrada(d.aviso ?? null);
    } catch {
      onBorrada("No se pudo borrar la foto.");
      setBorrando(false);
      setConfirmando(false);
    }
  }

  if (confirmando) {
    return (
      <span className={`flex items-center gap-1 ${className}`}>
        <button
          onClick={borrar}
          disabled={borrando}
          className="flex items-center gap-1 rounded bg-[var(--color-danger)] px-1.5 py-0.5 text-[10.5px] font-medium text-white disabled:opacity-60"
        >
          {borrando && <Loader2 className="h-3 w-3 animate-spin" />}
          Borrar
        </button>
        <button
          onClick={() => setConfirmando(false)}
          disabled={borrando}
          className="rounded px-1.5 py-0.5 text-[10.5px] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className={`rounded p-1 text-[var(--color-ink-faint)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-danger)] ${className}`}
      title="Borrar foto"
      aria-label="Borrar foto"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
