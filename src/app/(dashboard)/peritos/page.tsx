import { createClient } from "@/lib/supabase/server";

export default async function PeritosPage() {
  const supabase = await createClient();

  const { data: peritos } = await supabase
    .from("profiles")
    .select("id, nombre_completo, email, role")
    .eq("role", "perito");

  const { data: fotos } = await supabase.from("fotos").select("subido_por, created_at");

  const stats = new Map<string, { cantidad: number; ultima: string | null }>();
  for (const f of fotos ?? []) {
    if (!f.subido_por) continue;
    const actual = stats.get(f.subido_por) ?? { cantidad: 0, ultima: null };
    actual.cantidad++;
    if (!actual.ultima || f.created_at > actual.ultima) actual.ultima = f.created_at;
    stats.set(f.subido_por, actual);
  }

  return (
    <div className="mx-auto max-w-4xl p-5">
      <h1 className="mb-0.5 text-[17px] font-semibold">Peritos</h1>
      <p className="mb-4 text-[12px] text-[var(--color-ink-muted)]">
        Usuarios de campo y su actividad de carga de fotos.
      </p>

      {!peritos?.length ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-10 text-center">
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Todavía no hay usuarios con rol de perito.
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
            Se asignan desde la sección Administración.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                <th className="px-3 py-2 font-medium">Perito</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 text-right font-medium">Fotos</th>
                <th className="px-3 py-2 font-medium">Última actividad</th>
              </tr>
            </thead>
            <tbody>
              {peritos.map((p) => {
                const s = stats.get(p.id);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]"
                  >
                    <td className="px-3 py-1.5">{p.nombre_completo ?? "—"}</td>
                    <td className="mono px-3 py-1.5 text-[var(--color-ink-muted)]">
                      {p.email ?? "—"}
                    </td>
                    <td className="mono px-3 py-1.5 text-right">{s?.cantidad ?? 0}</td>
                    <td className="mono px-3 py-1.5 text-[var(--color-ink-muted)]">
                      {s?.ultima ? new Date(s.ultima).toLocaleDateString("es-AR") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
