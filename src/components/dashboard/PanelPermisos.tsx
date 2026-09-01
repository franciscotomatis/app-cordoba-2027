"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ACCIONES, ETIQUETA_ROL, ROLES, SECCIONES } from "@/lib/permisos";

export type FilaPermiso = { rol: string; clave: string; permitido: boolean };

export function PanelPermisos({ permisos }: { permisos: FilaPermiso[] }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Record<string, boolean>>(
    Object.fromEntries(permisos.map((p) => [`${p.rol}|${p.clave}`, p.permitido]))
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function alternar(rol: string, clave: string) {
    const id = `${rol}|${clave}`;
    const nuevo = !estado[id];

    setEstado((e) => ({ ...e, [id]: nuevo }));
    setGuardando(id);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("permisos_rol")
      .upsert({ rol, clave, permitido: nuevo }, { onConflict: "rol,clave" });

    setGuardando(null);

    if (error) {
      setEstado((e) => ({ ...e, [id]: !nuevo })); // revierte si falló
      setError(error.message);
      return;
    }
    router.refresh();
  }

  const filas = [
    { titulo: "Secciones del menú", items: SECCIONES.map((s) => ({ clave: `seccion:${s.clave}`, etiqueta: s.etiqueta })) },
    { titulo: "Acciones", items: ACCIONES.map((a) => ({ clave: `accion:${a.clave}`, etiqueta: a.etiqueta })) },
  ];

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">Permisos por rol</h2>
        <p className="text-[11.5px] text-[var(--color-ink-muted)]">
          Qué ve y qué puede hacer cada rol. Los cambios se aplican al instante.
        </p>
      </div>

      {error && (
        <p className="border-b border-[var(--color-border)] px-4 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[10.5px] tracking-wide text-[var(--color-ink-faint)] uppercase">
              <th className="px-4 py-2 text-left font-medium">Permiso</th>
              {ROLES.map((r) => (
                <th key={r} className="px-3 py-2 text-center font-medium">
                  {ETIQUETA_ROL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((grupo) => (
              <Fragment key={grupo.titulo}>
                <tr className="bg-[var(--color-surface-muted)]">
                  <td
                    colSpan={ROLES.length + 1}
                    className="px-4 py-1.5 text-[10.5px] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase"
                  >
                    {grupo.titulo}
                  </td>
                </tr>
                {grupo.items.map((item) => (
                  <tr
                    key={item.clave}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="px-4 py-1.5">{item.etiqueta}</td>
                    {ROLES.map((rol) => {
                      const id = `${rol}|${item.clave}`;
                      const activo = estado[id] === true;
                      const bloqueado = rol === "admin" && item.clave === "seccion:admin";
                      return (
                        <td key={rol} className="px-3 py-1.5 text-center">
                          <button
                            onClick={() => !bloqueado && alternar(rol, item.clave)}
                            disabled={bloqueado || guardando === id}
                            title={
                              bloqueado
                                ? "El administrador siempre conserva el acceso a esta sección"
                                : undefined
                            }
                            className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                              activo
                                ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
                                : "border-[var(--color-border-strong)] hover:border-[var(--color-ink-faint)]"
                            } ${bloqueado ? "opacity-50" : ""}`}
                          >
                            {guardando === id ? (
                              <Loader2 className="h-3 w-3 animate-spin text-[var(--color-ink-faint)]" />
                            ) : (
                              activo && <Check className="h-3 w-3 text-white" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
