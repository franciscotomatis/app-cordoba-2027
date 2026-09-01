"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar, type ItemMenu } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { LogoutButton } from "@/app/logout-button";

export function Shell({
  items,
  nombre,
  etiquetaRol,
  children,
}: {
  items: ItemMenu[];
  nombre: string;
  etiquetaRol: string;
  children: React.ReactNode;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const pathname = usePathname();

  // Al navegar en el celular, el cajón se cierra solo.
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  return (
    <div className="flex h-full">
      {/* Menú fijo en escritorio */}
      <div className="hidden md:flex">
        <Sidebar items={items} />
      </div>

      {/* Cajón en celular */}
      {menuAbierto && (
        <div
          className="fixed inset-0 z-[3000] bg-black/50 md:hidden"
          onClick={() => setMenuAbierto(false)}
        >
          <div className="h-full w-52" onClick={(e) => e.stopPropagation()}>
            <Sidebar items={items} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:px-5 sm:py-2.5">
          <button
            onClick={() => setMenuAbierto((v) => !v)}
            className="-ml-1 rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)] md:hidden"
            aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
          >
            {menuAbierto ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[13px] font-medium">{nombre}</span>
            <span className="mono hidden rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[10px] tracking-wide text-[var(--color-ink-muted)] uppercase sm:inline">
              {etiquetaRol}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
