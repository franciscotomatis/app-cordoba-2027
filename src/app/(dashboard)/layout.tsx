import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/dashboard/Shell";
import { ETIQUETA_ROL, SECCIONES, puede } from "@/lib/permisos";
import { permisosDelRol } from "@/lib/permisos-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, nombre_completo, email")
    .eq("id", user.id)
    .maybeSingle();

  const rol = profile?.role ?? "lectura";
  const permisos = await permisosDelRol(rol);

  const items = SECCIONES.filter((s) => puede(permisos, `seccion:${s.clave}`)).map((s) => ({
    clave: s.clave,
    etiqueta: s.etiqueta,
    href: s.href,
  }));

  return (
    <Shell
      items={items}
      nombre={profile?.nombre_completo ?? profile?.email ?? user.email ?? ""}
      etiquetaRol={ETIQUETA_ROL[rol] ?? rol}
    >
      {children}
    </Shell>
  );
}
