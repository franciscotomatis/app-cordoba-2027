"use client";

import dynamic from "next/dynamic";

const MapaLotes = dynamic(() => import("./MapaLotes"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-zinc-400">
      Cargando mapa...
    </div>
  ),
});

export default function MapaLotesClient() {
  return <MapaLotes />;
}
