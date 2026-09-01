import { createClient } from "@/lib/supabase/server";
import { FotoUpload } from "@/components/dashboard/FotoUpload";

export default async function FotosPage() {
  const supabase = await createClient();

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map((f) => {
            const url = urlPorPath.get(f.storage_path);
            return (
              <figure
                key={f.id}
                className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={f.nombre_original ?? "Foto de campo"}
                    className="aspect-4/3 w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-4/3 items-center justify-center bg-[var(--color-surface-muted)] text-[11px] text-[var(--color-ink-faint)]">
                    Sin vista previa
                  </div>
                )}
                <figcaption className="px-2.5 py-2">
                  <p className="truncate text-[11px]">{f.nombre_original ?? "—"}</p>
                  <p className="mono text-[10px] text-[var(--color-ink-faint)]">
                    {new Date(f.created_at).toLocaleString("es-AR")}
                  </p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
