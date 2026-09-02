import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

type Cuerpo = {
  /** Lotes a asignar: pueden tener denuncia o no. */
  loteIds: string[];
  peritoId: string | null;
};

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role, nombre_completo, email")
    .eq("id", user.id)
    .maybeSingle();

  if (perfil?.role !== "admin" && perfil?.role !== "perito") {
    return NextResponse.json(
      { error: "Solo un administrador o perito puede asignar casos." },
      { status: 403 }
    );
  }

  const { loteIds, peritoId } = (await request.json()) as Cuerpo;
  if (!Array.isArray(loteIds) || loteIds.length === 0) {
    return NextResponse.json({ error: "No hay lotes seleccionados." }, { status: 400 });
  }

  const quitando = peritoId === null;
  const ahora = new Date().toISOString();

  // 1. El lote guarda a quién le toca recorrerlo, tenga denuncia o no.
  const { error: errorLotes } = await supabase
    .from("lotes")
    .update({
      perito_id: peritoId,
      asignado_en: quitando ? null : ahora,
      asignado_por: quitando ? null : user.id,
    })
    .in("id", loteIds);

  if (errorLotes) {
    return NextResponse.json({ error: errorLotes.message }, { status: 500 });
  }

  // 2. Los que además tienen denuncia cambian de estado.
  const { data: casos } = await supabase
    .from("siniestros")
    .select("id")
    .in("lote_id", loteIds);

  const idsCasos = (casos ?? []).map((c) => c.id);
  if (idsCasos.length > 0) {
    await supabase
      .from("siniestros")
      .update({
        perito_id: peritoId,
        asignado_en: quitando ? null : ahora,
        actualizado_por: user.id,
        estado: quitando ? "DENUNCIADO" : "PENDIENTE_INSPECCION",
      })
      .in("id", idsCasos);
  }

  if (quitando) {
    return NextResponse.json({
      lotes: loteIds.length,
      casos: idsCasos.length,
      quitado: true,
    });
  }

  // 3. Aviso por correo con el detalle completo (denunciados y no denunciados).
  const { data: perito } = await supabase
    .from("profiles")
    .select("nombre_completo, email")
    .eq("id", peritoId)
    .maybeSingle();

  const { data: detalle } = await supabase
    .from("gestion_lotes")
    .select(
      "id_lote_externo, lote_nombre, cliente_nombre, cliente_cuit, cultivo, causa, fecha, localidad, departamento, hectareas_aseguradas, siniestro_id, lat, lon"
    )
    .in("lote_id", loteIds);

  const filas = (detalle ?? [])
    .sort((a, b) => (a.siniestro_id ? 0 : 1) - (b.siniestro_id ? 0 : 1))
    .map(
      (c) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7;font-family:monospace">#${c.id_lote_externo}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7">${c.cliente_nombre ?? "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7">${c.cultivo ?? "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7">${
          c.siniestro_id
            ? `${c.causa ?? "Siniestro"}${c.fecha ? ` (${c.fecha})` : ""}`
            : '<span style="color:#6b645c">Sin denuncia</span>'
        }</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7">${[c.localidad, c.departamento].filter(Boolean).join(", ")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7;text-align:right">${c.hectareas_aseguradas ?? "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7">
          ${c.lat && c.lon ? `<a href="https://www.google.com/maps?q=${c.lat},${c.lon}">Ver</a>` : "—"}
        </td>
      </tr>`
    )
    .join("");

  const conDenuncia = idsCasos.length;
  const sinDenuncia = loteIds.length - conDenuncia;

  const html = `<div style="font-family:system-ui,sans-serif;color:#2a2724;max-width:820px">
    <h2 style="font-size:16px;margin:0 0 4px">Tenés ${loteIds.length} lote${loteIds.length > 1 ? "s" : ""} para inspeccionar</h2>
    <p style="font-size:13px;color:#6b645c;margin:0 0 16px">
      ${conDenuncia} con denuncia y ${sinDenuncia} sin denuncia del mismo CUIT y cultivo ·
      Asignados por ${perfil?.nombre_completo ?? perfil?.email ?? "el equipo"} · Programa Córdoba 25/26
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:12.5px">
      <thead>
        <tr style="background:#d97757;color:#fff;text-align:left">
          <th style="padding:6px 8px">Lote</th>
          <th style="padding:6px 8px">Asegurado</th>
          <th style="padding:6px 8px">Cultivo</th>
          <th style="padding:6px 8px">Situación</th>
          <th style="padding:6px 8px">Ubicación</th>
          <th style="padding:6px 8px;text-align:right">Ha</th>
          <th style="padding:6px 8px">Mapa</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
    <p style="font-size:12px;color:#6b645c;margin-top:16px">
      Entrá a la aplicación para cargar el rinde estimado de cada lote y las fotos de la inspección.
    </p>
  </div>`;

  const clave = process.env.RESEND_API_KEY;
  const remitente = process.env.RESEND_FROM;

  if (!clave || !remitente) {
    return NextResponse.json({
      lotes: loteIds.length,
      casos: conDenuncia,
      emailEnviado: false,
      motivoEmail:
        "El envío de correo todavía no está configurado (falta RESEND_API_KEY / RESEND_FROM).",
    });
  }

  if (!perito?.email) {
    return NextResponse.json({
      lotes: loteIds.length,
      casos: conDenuncia,
      emailEnviado: false,
      motivoEmail: "El perito no tiene email cargado.",
    });
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(clave);
    const { error } = await resend.emails.send({
      from: remitente,
      to: perito.email,
      subject: `${loteIds.length} lote${loteIds.length > 1 ? "s" : ""} asignado${loteIds.length > 1 ? "s" : ""} para inspección`,
      html,
    });
    if (error) {
      return NextResponse.json({
        lotes: loteIds.length,
        casos: conDenuncia,
        emailEnviado: false,
        motivoEmail: `Quedó asignado, pero el correo falló: ${error.message}`,
      });
    }
  } catch (e) {
    return NextResponse.json({
      lotes: loteIds.length,
      casos: conDenuncia,
      emailEnviado: false,
      motivoEmail: `Quedó asignado, pero el correo falló: ${(e as Error).message}`,
    });
  }

  return NextResponse.json({
    lotes: loteIds.length,
    casos: conDenuncia,
    emailEnviado: true,
  });
}
