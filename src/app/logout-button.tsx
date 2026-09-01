"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { invalidarLotes } from "@/lib/datosMapa";

export function LogoutButton() {
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Recarga completa: así no queda en memoria ningún dato del usuario anterior
    // (los lotes se cachean en el módulo para no descargarlos en cada pantalla).
    invalidarLotes();
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
    >
      <LogOut className="h-3.5 w-3.5" />
      Salir
    </button>
  );
}
