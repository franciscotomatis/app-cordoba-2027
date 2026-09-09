import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todo pasa por el control de sesión menos los archivos que el navegador
     * pide antes de que haya sesión: el service worker y el manifiesto (sin
     * ellos la app no se instala ni funciona sin señal), los íconos, y
     * robots.txt. Si el middleware los intercepta, el navegador recibe el HTML
     * de la pantalla de acceso en lugar del archivo y falla en silencio.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\.js|manifest\.json|robots\.txt|apple-touch-icon\.png|icono-.*\.png|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
