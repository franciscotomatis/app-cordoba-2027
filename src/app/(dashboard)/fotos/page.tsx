import { createClient } from "@/lib/supabase/server";
import { FotoUpload } from "@/components/dashboard/FotoUpload";
import { GaleriaFotos } from "@/components/fotos/GaleriaFotos";

export default async function FotosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

  const esAdmin = perfil?.role === "admin";
  const esPerito = perfil?.role === "perito";

  const { data: fotos } = await supabase
    .from("fotos")
    .select("id, storage_path, nombre_original, created_at, subido_por")
    .order("created_at", { ascending: false })
    .limit(120);

  // URLs firmadas: el bucket es privado, no se pueden usar URLs públicas.
  const paths = (fotos ?? []).map((f) => f.storage_path);
  const { data: firmadas } = paths.length
    ? await supabase.storage.from("fotos").createSignedUrls(paths, 3600)
    : { data: [] };

  const urlPorPath = new Map(
    (firmadas ?? []).map((f) => [f.path, f.signedUrl])
  );

  return (
    <div className="mx-auto max-w-6xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-0.5 text-[17px] font-semibold">Fotos de campo</h1>
          <p className="text-[12px] text-[var(--color-ink-muted)]">
            Imágenes subidas por los peritos, con ubicación GPS cuando está disponible.
          </p>
        </div>
        <FotoUpload />
      </div>

      {!fotos?.length ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-10 text-center">
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Todavía no hay fotos cargadas.
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
            Usá &quot;Subir foto&quot; para cargar la primera desde el celular o la computadora.
          </p>
        </div>
      ) : (
        <GaleriaFotos
          fotos={fotos.map((f) => ({
            id: f.id,
            url: urlPorPath.get(f.storage_path) ?? null,
            nombre_original: f.nombre_original,
            created_at: f.created_at,
            // El admin borra cualquiera; el perito, solo las que subió él.
            puede_borrar: esAdmin || (esPerito && f.subido_por === user?.id),
          }))}
        />
      )}
    </div>
  );
}
