import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  perito: "Perito de campo",
  cliente: "Cliente / Productor",
  lectura: "Solo lectura",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, nombre_completo")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role ?? "sin rol asignado";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">
            Programa Córdoba
          </h1>
          <p className="text-sm text-zinc-500">
            {profile?.nombre_completo ?? user.email} ·{" "}
            {ROLE_LABEL[role] ?? role}
          </p>
        </div>
        <LogoutButton />
      </header>

      <main className="flex flex-1 items-center justify-center bg-zinc-50 text-zinc-500">
        <p>El mapa interactivo se agrega en la siguiente fase.</p>
      </main>
    </div>
  );
}
