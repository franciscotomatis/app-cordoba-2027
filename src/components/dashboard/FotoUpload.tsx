"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Estado = "idle" | "subiendo" | "ok" | "error";

export function FotoUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>("idle");
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function obtenerPosicion(): Promise<GeolocationCoordinates | null> {
    if (!navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setEstado("subiendo");
    setMensaje(null);

    const supabase = createClient();
    const coords = await obtenerPosicion();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setEstado("error");
      setMensaje("Sesión expirada, volvé a iniciar sesión.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${Date.now()}.${extension}`;

    const { error: errorUpload } = await supabase.storage
      .from("fotos")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (errorUpload) {
      setEstado("error");
      setMensaje(`No se pudo subir la imagen: ${errorUpload.message}`);
      return;
    }

    const { error: errorInsert } = await supabase.from("fotos").insert({
      storage_path: path,
      nombre_original: file.name,
      subido_por: user.id,
      geom: coords
        ? `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`
        : null,
    });

    if (errorInsert) {
      setEstado("error");
      setMensaje(`Imagen subida pero no se registró: ${errorInsert.message}`);
      return;
    }

    setEstado("ok");
    setMensaje(
      coords
        ? "Foto subida con ubicación GPS."
        : "Foto subida (sin GPS: permiso denegado o no disponible)."
    );
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleArchivo}
        className="hidden"
        id="foto-input"
      />
      <label
        htmlFor="foto-input"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
      >
        {estado === "subiendo" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Camera className="h-3.5 w-3.5" />
        )}
        {estado === "subiendo" ? "Subiendo..." : "Subir foto"}
      </label>
      {mensaje && (
        <span
          className={`text-[11px] ${
            estado === "error"
              ? "text-[var(--color-danger)]"
              : "text-[var(--color-positive)]"
          }`}
        >
          {mensaje}
        </span>
      )}
    </div>
  );
}
