"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Trash2, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ETIQUETA_ROL, ROLES } from "@/lib/permisos";

export type Usuario = {
  id: string;
  email: string | null;
  nombre_completo: string | null;
  role: string;
};

export function PanelUsuarios({
  usuarios,
  miId,
}: {
  usuarios: Usuario[];
  miId: string;
}) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [cambiandoClave, setCambiandoClave] = useState<Usuario | null>(null);

  const [form, setForm] = useState({
    email: "",
    password: "",
    nombre: "",
    rol: "lectura" as string,
  });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setTrabajando(true);
    setAviso(null);

    const r = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const datos = await r.json();
    setTrabajando(false);

    if (!r.ok) {
      setAviso({ tipo: "error", texto: datos.error ?? "No se pudo crear el usuario." });
      return;
    }

    setAviso({ tipo: "ok", texto: `Usuario ${datos.email} creado.` });
    setForm({ email: "", password: "", nombre: "", rol: "lectura" });
    setCreando(false);
    router.refresh();
  }

  async function cambiarRol(id: string, rol: string) {
    setTrabajando(true);
    setAviso(null);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ role: rol }).eq("id", id);
    setTrabajando(false);
    if (error) {
      setAviso({ tipo: "error", texto: error.message });
      return;
    }
    router.refresh();
  }

  async function eliminar(u: Usuario) {
    if (!confirm(`¿Eliminar definitivamente a ${u.email}?`)) return;
    setTrabajando(true);
    setAviso(null);
    const r = await fetch("/api/admin/usuarios", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id }),
    });
    const datos = await r.json();
    setTrabajando(false);
    if (!r.ok) {
      setAviso({ tipo: "error", texto: datos.error ?? "No se pudo eliminar." });
      return;
    }
    setAviso({ tipo: "ok", texto: `Usuario ${u.email} eliminado.` });
    router.refresh();
  }

  async function guardarClave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cambiandoClave) return;
    const password = new FormData(e.currentTarget).get("password") as string;

    setTrabajando(true);
    const r = await fetch("/api/admin/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cambiandoClave.id, password }),
    });
    const datos = await r.json();
    setTrabajando(false);

    if (!r.ok) {
      setAviso({ tipo: "error", texto: datos.error ?? "No se pudo cambiar la contraseña." });
      return;
    }
    setAviso({ tipo: "ok", texto: `Contraseña actualizada para ${cambiandoClave.email}.` });
    setCambiandoClave(null);
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <div>
          <h2 className="text-[13px] font-semibold">Usuarios</h2>
          <p className="text-[11.5px] text-[var(--color-ink-muted)]">
            Altas, roles y contraseñas del equipo.
          </p>
        </div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Nuevo usuario
        </button>
      </div>

      {aviso && (
        <div
          className={`flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2 text-[12px] ${
            aviso.tipo === "ok"
              ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "text-[var(--color-danger)]"
          }`}
        >
          {aviso.texto}
          <button onClick={() => setAviso(null)} className="ml-auto">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {creando && (
        <form
          onSubmit={crear}
          className="flex flex-wrap items-end gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-ink-muted)]">Email</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-ink-muted)]">Nombre</span>
            <input
              type="text"
              placeholder="Nombre y apellido"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-ink-muted)]">
              Contraseña (mín. 8)
            </span>
            <input
              type="text"
              required
              minLength={8}
              placeholder="Contraseña"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mono w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-ink-muted)]">Rol</span>
            <select
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value })}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={trabajando}
            className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {trabajando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Crear
          </button>
          <button
            type="button"
            onClick={() => setCreando(false)}
            className="px-2 py-1.5 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            Cancelar
          </button>
        </form>
      )}

      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] tracking-wide text-[var(--color-ink-faint)] uppercase">
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-2 py-2 font-medium">Nombre</th>
            <th className="px-2 py-2 font-medium">Rol</th>
            <th className="px-2 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => {
            const esYo = u.id === miId;
            return (
              <tr key={u.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="mono px-4 py-2 text-[var(--color-ink-muted)]">
                  {u.email ?? "—"}
                </td>
                <td className="px-2 py-2">{u.nombre_completo ?? "—"}</td>
                <td className="px-2 py-2">
                  {esYo ? (
                    <span className="flex items-center gap-2">
                      <span className="mono rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[11px]">
                        {u.role}
                      </span>
                      <span className="text-[11px] text-[var(--color-ink-faint)]">
                        tu usuario
                      </span>
                    </span>
                  ) : (
                    <select
                      value={u.role}
                      disabled={trabajando}
                      onChange={(e) => cambiarRol(u.id, e.target.value)}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ETIQUETA_ROL[r]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setCambiandoClave(u)}
                      title="Cambiar contraseña"
                      className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </button>
                    {!esYo && (
                      <button
                        onClick={() => eliminar(u)}
                        title="Eliminar usuario"
                        className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {cambiandoClave && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-6"
          onClick={() => setCambiandoClave(null)}
        >
          <form
            onSubmit={guardarClave}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <h3 className="mb-1 text-[13px] font-semibold">Cambiar contraseña</h3>
            <p className="mono mb-4 text-[11.5px] text-[var(--color-ink-muted)]">
              {cambiandoClave.email}
            </p>
            <input
              name="password"
              type="text"
              required
              minLength={8}
              placeholder="Nueva contraseña (mín. 8)"
              className="mono mb-4 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas)] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCambiandoClave(null)}
                className="px-2.5 py-1.5 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={trabajando}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
