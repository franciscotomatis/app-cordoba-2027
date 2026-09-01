import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { LogoutButton } from "../logout-button";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  perito: "Perito de campo",
  cliente: "Cliente",
  lectura: "Solo lectura",
};

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

  const role = profile?.role ?? "lectura";

  return (
    <div className="flex h-full">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-medium">
              {profile?.nombre_completo ?? profile?.email ?? user.email}
            </span>
            <span className="mono rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">
              {ROLE_LABEL[role] ?? role}
            </span>
          </div>
          <LogoutButton />
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
