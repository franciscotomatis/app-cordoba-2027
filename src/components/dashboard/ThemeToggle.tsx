"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Tema = "light" | "dark" | "system";

const OPCIONES: { valor: Tema; icono: typeof Sun; titulo: string }[] = [
  { valor: "light", icono: Sun, titulo: "Modo claro" },
  { valor: "dark", icono: Moon, titulo: "Modo oscuro" },
  { valor: "system", icono: Monitor, titulo: "Según el sistema" },
];

function aplicar(tema: Tema) {
  const root = document.documentElement;
  if (tema === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", tema);
  try {
    localStorage.setItem("tema", tema);
  } catch {
    // Modo incógnito o storage bloqueado: el tema simplemente no se recuerda.
  }
}

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>("system");

  useEffect(() => {
    try {
      const guardado = localStorage.getItem("tema") as Tema | null;
      if (guardado === "light" || guardado === "dark" || guardado === "system") {
        setTema(guardado);
      }
    } catch {
      // sin storage disponible
    }
  }, []);

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] p-0.5">
      {OPCIONES.map(({ valor, icono: Icono, titulo }) => (
        <button
          key={valor}
          title={titulo}
          aria-label={titulo}
          aria-pressed={tema === valor}
          onClick={() => {
            setTema(valor);
            aplicar(valor);
          }}
          className={`rounded p-1 transition-colors ${
            tema === valor
              ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          <Icono className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
