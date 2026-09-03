import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hayCredenciales, imagenNdvi } from "@/lib/copernicus";
import type { Geometry } from "geojson";

/** Imagen NDVI del lote en una fecha. Se cachea en Storage para no repetir el pedido. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ loteId: string }> }
) {
  const { loteId } = await params;
  const fecha = new URL(request.url).searchParams.get("fecha");

  if (!fecha) {
    return NextResponse.json({ error: "Falta la fecha." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: lote } = await supabase
    .from("lotes_mapa")
    .select("geometry")
    .eq("id", loteId)
    .maybeSingle();

  if (!lote?.geometry) {
    return NextResponse.json({ error: "Lote sin geometría" }, { status: 404 });
  }

  const ruta = `${loteId}/${fecha}.png`;

  // Si ya se pidió esa imagen antes, se sirve la guardada.
  const { data: guardada } = await supabase.storage.from("ndvi").download(ruta);
  if (guardada) {
    return new NextResponse(await guardada.arrayBuffer(), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
    });
  }

  if (!hayCredenciales()) {
    return NextResponse.json(
      { error: "Falta configurar las credenciales de Copernicus." },
      { status: 501 }
    );
  }

  try {
    const png = await imagenNdvi(lote.geometry as Geometry, fecha);

    const { error: errorGuardado } = await supabase.storage
      .from("ndvi")
      .upload(ruta, png, { contentType: "image/png", upsert: true });

    // Si no se pudo cachear igual se devuelve la imagen: lo único que se
    // pierde es tener que volver a pedirla la próxima vez.
    if (errorGuardado) {
      console.warn("No se pudo cachear la imagen NDVI:", errorGuardado.message);
    }

    return new NextResponse(png, {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
