import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import {
  GestionSiniestros,
  type CasoSiniestro,
  type PeritoOpcion,
} from "@/components/siniestros/GestionSiniestros";

export default async function SiniestrosPage({
  searchParams,
}: {
  searchParams: Promise<{ todos?: string }>;
}) {
  const { todos } = await searchParams;
  // Por defecto solo los casos denunciados; con ?todos=1 se suman los lotes sin
  // denuncia, que también necesitan rinde estimado para el cálculo del CUIT.
  const incluirSinDenuncia = todos === "1";

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

  const { data: filas, error } = await fetchAll<CasoSiniestro>(
    supabase,
    "gestion_lotes",
    "*"
  );

  // Primero los casos denunciados (más recientes arriba) y después los lotes
  // sin denuncia, para que no tapen lo que hay que gestionar.
  const ordenadas = [...filas].sort((a, b) => {
    if ((a.siniestro_id === null) !== (b.siniestro_id === null)) {
      return a.siniestro_id === null ? 1 : -1;
    }
    return (b.fecha ?? "").localeCompare(a.fecha ?? "");
  });

  const casos = incluirSinDenuncia
    ? ordenadas
    : ordenadas.filter((f) => f.siniestro_id !== null);

  const { data: peritos } = await supabase
    .from("profiles")
    .select("id, nombre_completo, email")
    .eq("role", "perito")
    .order("email");

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 pt-4 pb-3 sm:px-5">
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
          rol={rol}
          incluirSinDenuncia={incluirSinDenuncia}
          totalSinDenuncia={filas.filter((f) => f.siniestro_id === null).length}
        />
      )}
    </div>
  );
}
