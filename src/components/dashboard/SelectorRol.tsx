"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ROLES = ["admin", "perito", "cliente", "lectura"] as const;

export function SelectorRol({
  userId,
  rolActual,
}: {
  userId: string;
  rolActual: string;
}) {
  const router = useRouter();
  const [rol, setRol] = useState(rolActual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(nuevo: string) {
    setGuardando(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ role: nuevo })
      .eq("id", userId);
    setGuardando(false);

    if (error) {
      setError(error.message);
      return;
    }
    setRol(nuevo);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={rol}
        disabled={guardando}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && <span className="text-[11px] text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}
