"use client";

import { useState } from "react";
import { Check, Copy, Mail, X } from "lucide-react";

export type MensajeAlPerito = {
  para: string;
  asunto: string;
  cuerpoCorto: string;
  cuerpoCompleto: string;
  perito: string;
};

/**
 * Aviso al perito por correo, desde el programa que la empresa ya usa.
 *
 * No manda el mail la aplicación: arma el mensaje y abre Outlook con todo
 * escrito para que el administrador solo apriete Enviar. Sale de la casilla
 * institucional real y queda en Elementos enviados, que para una aseguradora
 * es el registro de a quién se le asignó qué y cuándo.
 */
export function AvisoAlPerito({
  mensaje,
  motivo,
  onCerrar,
}: {
  mensaje: MensajeAlPerito;
  motivo?: string | null;
  onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  const enlace =
    `mailto:${encodeURIComponent(mensaje.para)}` +
    `?subject=${encodeURIComponent(mensaje.asunto)}` +
    `&body=${encodeURIComponent(mensaje.cuerpoCorto)}`;

  const recortado = mensaje.cuerpoCorto !== mensaje.cuerpoCompleto;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje.cuerpoCompleto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso de portapapeles queda el texto a la vista para copiar a mano.
    }
  }

  if (!mensaje.para) {
    return (
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-accent-soft)] px-5 py-1.5 text-[12px] text-[var(--color-accent)]">
        Quedó asignado, pero {mensaje.perito || "el perito"} no tiene correo
        cargado. Agregáselo en Administración para poder avisarle.
        <button onClick={onCerrar} className="ml-auto">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[var(--color-ink-muted)]">
          Asignado. Avisale a{" "}
          <span className="font-medium text-[var(--color-ink)]">{mensaje.perito}</span>:
        </span>

        <a
          href={enlace}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          <Mail className="h-3.5 w-3.5" />
          Abrir en Outlook
        </a>

        <button
          onClick={copiar}
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          {copiado ? (
            <Check className="h-3.5 w-3.5 text-[var(--color-positive)]" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copiado ? "Copiado" : "Copiar mensaje completo"}
        </button>

        <button
          onClick={onCerrar}
          className="ml-auto rounded p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {recortado && (
        <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
          El correo que abre Outlook lleva los primeros lotes: un enlace muy largo
          lo cortan tanto el navegador como Outlook. Usá &quot;Copiar mensaje
          completo&quot; y pegalo si querés el detalle entero.
        </p>
      )}
      {motivo && (
        <p className="mt-1 text-[11px] text-[var(--color-warning)]">{motivo}</p>
      )}
    </div>
  );
}
