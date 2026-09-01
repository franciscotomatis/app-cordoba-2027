import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// Crear y borrar usuarios requiere la clave de servicio de Supabase, que solo
// vive del lado del servidor (nunca se expone al navegador).
function clienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;
  return createAdminClient(url, clave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function exigirAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado", status: 401 as const };

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (perfil?.role !== "admin") {
    return { error: "Solo un administrador puede gestionar usuarios.", status: 403 as const };
  }
  return { user };
}

export async function POST(request: Request) {
  const permiso = await exigirAdmin();
  if ("error" in permiso) {
    return NextResponse.json({ error: permiso.error }, { status: permiso.status });
  }

  const admin = clienteAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor para poder crear usuarios.",
      },
      { status: 501 }
    );
  }

  const { email, password, nombre, rol } = await request.json();

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Hace falta un email y una contraseña de al menos 8 caracteres." },
      { status: 400 }
    );
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // sin mail de confirmación: el admin ya lo valida
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // El trigger de auth.users ya creó el perfil; acá se completan rol y nombre.
  const { error: errorPerfil } = await admin
    .from("profiles")
    .update({ role: rol ?? "lectura", nombre_completo: nombre || null, email })
    .eq("id", data.user.id);

  if (errorPerfil) {
    return NextResponse.json({ error: errorPerfil.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.user.id, email });
}

export async function DELETE(request: Request) {
  const permiso = await exigirAdmin();
  if ("error" in permiso) {
    return NextResponse.json({ error: permiso.error }, { status: permiso.status });
  }

  const admin = clienteAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 501 }
    );
  }

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "Falta el usuario." }, { status: 400 });

  if (id === permiso.user.id) {
    return NextResponse.json(
      { error: "No podés eliminar tu propio usuario." },
      { status: 400 }
    );
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

/** Cambio de contraseña de otro usuario. */
export async function PATCH(request: Request) {
  const permiso = await exigirAdmin();
  if ("error" in permiso) {
    return NextResponse.json({ error: permiso.error }, { status: permiso.status });
  }

  const admin = clienteAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 501 }
    );
  }

  const { id, password } = await request.json();
  if (!id || !password || password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña nueva debe tener al menos 8 caracteres." },
      { status: 400 }
    );
  }

  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
