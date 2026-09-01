import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { TablaClientes, type ClienteCultivo } from "@/components/dashboard/TablaClientes";

export default async function ClientesPage() {
  const supabase = await createClient();
  const { data, error } = await fetchAll<ClienteCultivo>(
    supabase,
    "clientes_cultivo",
    "*"
  );

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 pt-4 pb-3 sm:px-5">
        <h1 className="mb-0.5 text-[17px] font-semibold">Clientes por cultivo</h1>
        <p className="text-[12px] text-[var(--color-ink-muted)]">
          El multirriesgo se liquida por CUIT y cultivo. La indemnización son los
          quintales asegurados menos los estimados por el perito.
        </p>
      </div>

      {error ? (
        <p className="p-5 text-[12px] text-[var(--color-danger)]">{error}</p>
      ) : (
        <TablaClientes filas={data} />
      )}
    </div>
  );
}
