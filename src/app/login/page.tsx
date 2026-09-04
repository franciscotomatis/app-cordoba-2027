"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Marca } from "@/components/Marca";
import { invalidarLotes } from "@/lib/datosMapa";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }

    // Recarga completa para empezar sin nada cacheado de una sesión anterior.
    invalidarLotes();
    window.location.href = "/";
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-7"
      >
        <div className="mb-6">
          <Marca tamanio="grande" />
        </div>

        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]"
        />

        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
          Contraseña
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]"
        />

        {error && (
          <p className="mb-3.5 text-[12px] text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
