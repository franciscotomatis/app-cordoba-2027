import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { TablaLotes, type LoteFila } from "@/components/dashboard/TablaLotes";

export default async function LotesPage() {
  const supabase = await createClient();
  const { data } = await fetchAll<LoteFila>(supabase, "lotes_tabla", "*", {
    columna: "cliente_nombre",
  });

  return (
    <div className="mx-auto max-w-6xl p-5">
      <h1 className="mb-0.5 text-[17px] font-semibold">Lotes</h1>
      <p className="mb-4 text-[12px] text-[var(--color-ink-muted)]">
        Lotes asegurados. Clic en un ID para verlo en el mapa.
      </p>
      <TablaLotes filas={data} />
    </div>
  );
}
