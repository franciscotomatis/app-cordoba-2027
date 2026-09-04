import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import {
  GestionSiniestros,
  type Alcance,
  type CasoSiniestro,
  type PeritoOpcion,
} from "@/components/siniestros/GestionSiniestros";

const ALCANCES: Alcance[] = ["denunciados", "unidad", "todos"];

export default async function SiniestrosPage({
  searchParams,
}: {
  searchParams: Promise<{ alcance?: string }>;
}) {
  const { alcance: pedido } = await searchParams;
  // Tres alcances posibles:
  //   denunciados → solo los lotes con denuncia (lo que se gestiona a diario)
  //   unidad      → suma los lotes sin denuncia del mismo CUIT+cultivo, que
  //                 entran en la misma liquidación
  //   todos       → la base completa, para buscar cualquier lote del programa
  const alcance: Alcance = ALCANCES.includes(pedido as Alcance)
    ? (pedido as Alcance)
    : "denunciados";

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

  // En los dos primeros alcances alcanza con las unidades que tienen algún
  // caso; traer el programa entero solo tiene sentido en "todos".
  const { data: filas, error } = await fetchAll<CasoSiniestro>(
    supabase,
    "gestion_lotes",
    "*",
    undefined,
    alcance === "todos" ? undefined : { unidad_con_denuncia: true }
  );

  // Primero los casos denunciados (más recientes arriba) y después los lotes
  // sin denuncia, para que no tapen lo que hay que gestionar.
  const ordenadas = [...filas].sort((a, b) => {
    if ((a.siniestro_id === null) !== (b.siniestro_id === null)) {
      return a.siniestro_id === null ? 1 : -1;
    }
    if (a.siniestro_id !== null) return (b.fecha ?? "").localeCompare(a.fecha ?? "");
    // Entre los que no tienen denuncia, ordenar por asegurado es más útil que
    // por una fecha que no existe.
    return (a.cliente_nombre ?? "").localeCompare(b.cliente_nombre ?? "");
  });

  const casos =
    alcance === "denunciados"
      ? ordenadas.filter((f) => f.siniestro_id !== null)
      : ordenadas;

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
          alcance={alcance}
        />
      )}
    </div>
  );
}
