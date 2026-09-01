"use client";

import dynamic from "next/dynamic";

const MapaLotes = dynamic(() => import("./MapaLotes"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-[13px] text-[var(--color-ink-faint)]">
      Cargando mapa...
    </div>
  ),
});

export default function MapaLotesClient({ rol }: { rol: string }) {
  return <MapaLotes rol={rol} />;
}
