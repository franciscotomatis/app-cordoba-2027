import { createClient } from "@/lib/supabase/server";
import { TablaClientes, type ClienteFila } from "@/components/dashboard/TablaClientes";

export default async function ClientesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("clientes_resumen").select("*").limit(2000);

  return (
    <div className="mx-auto max-w-5xl p-5">
      <h1 className="mb-0.5 text-[17px] font-semibold">Clientes</h1>
      <p className="mb-4 text-[12px] text-[var(--color-ink-muted)]">
        Productores asegurados y su superficie total.
      </p>
      <TablaClientes filas={(data ?? []) as ClienteFila[]} />
    </div>
  );
}
