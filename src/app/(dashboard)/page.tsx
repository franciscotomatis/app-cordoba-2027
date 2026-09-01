import { createClient } from "@/lib/supabase/server";
import { KpiCard, Panel } from "@/components/dashboard/KpiCard";
import { COLOR_CULTIVO } from "@/lib/colores";

function fmt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

export default async function ResumenPage() {
  const supabase = await createClient();

  const hace7dias = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [cultivos, zonas, causas, fotosRecientes, totalLotes] = await Promise.all([
    supabase.from("kpi_cultivos").select("*").order("hectareas", { ascending: false }),
    supabase.from("kpi_zonas").select("*").order("nombre"),
    supabase.from("kpi_causas").select("*").order("cantidad", { ascending: false }),
    supabase.from("fotos").select("id", { count: "exact", head: true }).gte("created_at", hace7dias),
    supabase.from("lotes").select("id", { count: "exact", head: true }),
  ]);

  const filasCultivo = cultivos.data ?? [];
  const filasZona = zonas.data ?? [];
  const filasCausa = causas.data ?? [];

  const hectareasTotales = filasCultivo.reduce((s, c) => s + Number(c.hectareas), 0);
  const siniestrosTotales = filasCausa.reduce((s, c) => s + Number(c.cantidad), 0);
  const maxCultivo = Math.max(...filasCultivo.map((c) => Number(c.hectareas)), 1);

  return (
    <div className="mx-auto max-w-6xl p-5">
      <h1 className="mb-0.5 text-[17px] font-semibold">Resumen</h1>
      <p className="mb-5 text-[12px] text-[var(--color-ink-muted)]">
        Campaña 25/26 · datos de lotes asegurados y siniestros
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Hectáreas aseguradas" value={fmt(hectareasTotales)} unit="ha" />
        <KpiCard label="Lotes" value={fmt(totalLotes.count ?? 0)} />
        <KpiCard
          label="Siniestros"
          value={fmt(siniestrosTotales)}
          hint={filasCausa[0] ? `Principal: ${filasCausa[0].causa}` : undefined}
        />
        <KpiCard
          label="Fotos últimos 7 días"
          value={fmt(fotosRecientes.count ?? 0)}
          hint="Subidas desde el campo"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Hectáreas por cultivo">
          <ul className="space-y-2.5">
            {filasCultivo.map((c) => {
              const ha = Number(c.hectareas);
              const color = COLOR_CULTIVO[c.cultivo.toLowerCase()]?.fill ?? "#9C27B0";
              return (
                <li key={c.cultivo}>
                  <div className="mb-1 flex items-baseline justify-between text-[12px]">
                    <span>{c.cultivo}</span>
                    <span className="mono text-[var(--color-ink-muted)]">
                      {fmt(ha)} ha · {c.lotes} lotes
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(ha / maxCultivo) * 100}%`, background: color }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Avance por zona (real vs. meta)">
          <ul className="space-y-3">
            {filasZona.map((z) => {
              const real = Number(z.real);
              const meta = Number(z.meta);
              const pct = meta > 0 ? (real / meta) * 100 : 0;
              return (
                <li key={z.id}>
                  <div className="mb-1 flex items-baseline justify-between text-[12px]">
                    <span>{z.nombre}</span>
                    <span className="mono text-[var(--color-ink-muted)]">
                      {fmt(real)} / {fmt(meta)} ha
                      <span className="ml-2 text-[var(--color-ink)]">{pct.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-accent)]"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Siniestros por causa">
          {filasCausa.length === 0 ? (
            <p className="text-[12px] text-[var(--color-ink-muted)]">Sin siniestros registrados.</p>
          ) : (
            <ul className="space-y-1.5">
              {filasCausa.map((c) => (
                <li
                  key={c.causa}
                  className="flex items-center justify-between border-b border-[var(--color-border)] pb-1.5 text-[12px] last:border-0"
                >
                  <span>{c.causa}</span>
                  <span className="mono text-[var(--color-ink-muted)]">{c.cantidad}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
