import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SelectorRol } from "@/components/dashboard/SelectorRol";
import { Panel } from "@/components/dashboard/KpiCard";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: yo } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (yo?.role !== "admin") {
    return (
      <div className="p-5">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          No tenés permisos para ver esta sección.
        </p>
      </div>
    );
  }

  const { data: usuarios } = await supabase
    .from("profiles")
    .select("id, nombre_completo, email, role, cliente_id")
    .order("email");

  return (
    <div className="mx-auto max-w-4xl p-5">
      <h1 className="mb-0.5 text-[17px] font-semibold">Administración</h1>
      <p className="mb-4 text-[12px] text-[var(--color-ink-muted)]">
        Usuarios del sistema y sus permisos.
      </p>

      <Panel title="Usuarios">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-faint)]">
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Nombre</th>
              <th className="pb-2 font-medium">Rol</th>
            </tr>
          </thead>
          <tbody>
            {(usuarios ?? []).map((u) => (
              <tr key={u.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="mono py-2 text-[var(--color-ink-muted)]">{u.email ?? "—"}</td>
                <td className="py-2">{u.nombre_completo ?? "—"}</td>
                <td className="py-2">
                  <SelectorRol
                    userId={u.id}
                    rolActual={u.role}
                    esUnoMismo={u.id === user.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">
        Los usuarios nuevos se crean desde Supabase (Authentication → Users) y aparecen acá
        automáticamente con rol &quot;lectura&quot; para que les asignes el que corresponda. Nadie
        puede cambiarse el rol a sí mismo, para que no queden cuentas sin administrador.
      </p>
    </div>
  );
}
