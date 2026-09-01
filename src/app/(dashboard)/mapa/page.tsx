import { createClient } from "@/lib/supabase/server";
import MapaLotesClient from "@/components/MapaLotesClient";

export default async function MapaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <div className="h-full w-full">
      <MapaLotesClient rol={perfil?.role ?? "lectura"} />
    </div>
  );
}
