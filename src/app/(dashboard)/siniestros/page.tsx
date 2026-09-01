import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import {
  GestionSiniestros,
  type CasoSiniestro,
  type PeritoOpcion,
} from "@/components/siniestros/GestionSiniestros";

export default async function SiniestrosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const rol = perfil?.role ?? "lectura";
  const puedeEditar = rol === "admin" || rol === "perito";

  const { data: casos, error } = await fetchAll<CasoSiniestro>(
    supabase,
    "siniestros_gestion",
    "*",
    { columna: "fecha", ascendente: false }
  );

  const { data: peritos } = await supabase
    .from("profiles")
    .select("id, nombre_completo, email")
    .eq("role", "perito")
    .order("email");

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[var(--color-border)] px-5 pt-4 pb-3">
        <h1 className="mb-0.5 text-[17px] font-semibold">Gestión de siniestros</h1>
        <p className="text-[12px] text-[var(--color-ink-muted)]">
          Casos denunciados: filtrá, asigná a un perito, cambiá el estado y exportá.
        </p>
      </div>

      {error ? (
        <p className="p-5 text-[12px] text-[var(--color-danger)]">{error}</p>
      ) : (
        <GestionSiniestros
          casos={casos}
          peritos={(peritos ?? []) as PeritoOpcion[]}
          puedeEditar={puedeEditar}
        />
      )}
    </div>
  );
}
