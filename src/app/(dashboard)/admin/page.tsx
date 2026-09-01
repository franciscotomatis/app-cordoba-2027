import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PanelUsuarios, type Usuario } from "@/components/dashboard/PanelUsuarios";
import { PanelPermisos, type FilaPermiso } from "@/components/dashboard/PanelPermisos";

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
    .select("id, nombre_completo, email, role")
    .order("email");

  const { data: permisos } = await supabase
    .from("permisos_rol")
    .select("rol, clave, permitido");

  const hayClaveServicio = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5">
      <div>
        <h1 className="mb-0.5 text-[17px] font-semibold">Administración</h1>
        <p className="text-[12px] text-[var(--color-ink-muted)]">
          Usuarios del sistema y permisos de cada rol.
        </p>
      </div>

      {!hayClaveServicio && (
        <p className="rounded-md border border-[var(--color-warning)] px-3 py-2 text-[12px] text-[var(--color-warning)]">
          Para crear o eliminar usuarios desde acá falta cargar la variable{" "}
          <span className="mono">SUPABASE_SERVICE_ROLE_KEY</span> en el servidor. Mientras
          tanto, los usuarios se crean desde Supabase (Authentication → Users) y aparecen
          en esta lista para asignarles el rol.
        </p>
      )}

      <PanelUsuarios usuarios={(usuarios ?? []) as Usuario[]} miId={user.id} />
      <PanelPermisos permisos={(permisos ?? []) as FilaPermiso[]} />
    </div>
  );
}
