import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Cuerpo = { ids: string[]; peritoId: string };

const ETIQUETA_CAUSA = (v: string | null) => v ?? "Sin causa";

export async function POST(request: Request) {
  const supabase = await createClient();
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

  const { ids, peritoId } = (await request.json()) as Cuerpo;
  if (!Array.isArray(ids) || ids.length === 0 || !peritoId) {
    return NextResponse.json({ error: "Faltan casos o perito." }, { status: 400 });
  }

  const { error: errorUpdate } = await supabase
    .from("siniestros")
    .update({
      perito_id: peritoId,
      asignado_en: new Date().toISOString(),
      actualizado_por: user.id,
      estado: "PENDIENTE_INSPECCION",
    })
    .in("id", ids);

  if (errorUpdate) {
    return NextResponse.json({ error: errorUpdate.message }, { status: 500 });
  }

  // Datos para el correo.
  const { data: perito } = await supabase
    .from("profiles")
    .select("nombre_completo, email")
    .eq("id", peritoId)
    .maybeSingle();

  const { data: casos } = await supabase
    .from("siniestros_gestion")
    .select(
      "id_lote_externo, lote_nombre, cliente_nombre, cliente_cuit, causa, fecha, localidad, departamento, hectareas_aseguradas, lat, lon"
    )
    .in("id", ids);

  const clave = process.env.RESEND_API_KEY;
  const remitente = process.env.RESEND_FROM;

  if (!clave || !remitente) {
    return NextResponse.json({
      asignados: ids.length,
      emailEnviado: false,
      motivoEmail:
        "El envío de correo todavía no está configurado (falta RESEND_API_KEY / RESEND_FROM).",
    });
  }

  if (!perito?.email) {
    return NextResponse.json({
      asignados: ids.length,
      emailEnviado: false,
      motivoEmail: "El perito no tiene email cargado.",
    });
  }

  const filas = (casos ?? [])
    .map(
      (c) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7;font-family:monospace">#${c.id_lote_externo}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7">${c.cliente_nombre ?? "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7">${ETIQUETA_CAUSA(c.causa)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7">${[c.localidad, c.departamento].filter(Boolean).join(", ")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7;text-align:right">${c.hectareas_aseguradas ?? "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e4dfd7">
          ${c.lat && c.lon ? `<a href="https://www.google.com/maps?q=${c.lat},${c.lon}">Ver ubicación</a>` : "—"}
        </td>
      </tr>`
    )
    .join("");

  const html = `<div style="font-family:system-ui,sans-serif;color:#2a2724;max-width:720px">
    <h2 style="font-size:16px;margin:0 0 4px">Tenés ${ids.length} caso${ids.length > 1 ? "s" : ""} para inspeccionar</h2>
    <p style="font-size:13px;color:#6b645c;margin:0 0 16px">
      Asignados por ${perfil?.nombre_completo ?? perfil?.email ?? "el equipo"} · Programa Córdoba 25/26
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:12.5px">
      <thead>
        <tr style="background:#d97757;color:#fff;text-align:left">
          <th style="padding:6px 8px">Lote</th>
          <th style="padding:6px 8px">Asegurado</th>
          <th style="padding:6px 8px">Causa</th>
          <th style="padding:6px 8px">Ubicación</th>
          <th style="padding:6px 8px;text-align:right">Ha</th>
          <th style="padding:6px 8px">Mapa</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
    <p style="font-size:12px;color:#6b645c;margin-top:16px">
      Entrá a la aplicación para ver el detalle y cargar las fotos de la inspección.
    </p>
  </div>`;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(clave);
    const { error } = await resend.emails.send({
      from: remitente,
      to: perito.email,
      subject: `${ids.length} caso${ids.length > 1 ? "s" : ""} asignado${ids.length > 1 ? "s" : ""} para inspección`,
      html,
    });
    if (error) {
      return NextResponse.json({
        asignados: ids.length,
        emailEnviado: false,
        motivoEmail: `Los casos quedaron asignados, pero el correo falló: ${error.message}`,
      });
    }
  } catch (e) {
    return NextResponse.json({
      asignados: ids.length,
      emailEnviado: false,
      motivoEmail: `Los casos quedaron asignados, pero el correo falló: ${(e as Error).message}`,
    });
  }

  return NextResponse.json({ asignados: ids.length, emailEnviado: true });
}
