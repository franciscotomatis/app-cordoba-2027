export const SECCIONES = [
  { clave: "resumen", etiqueta: "Resumen", href: "/" },
  { clave: "mapa", etiqueta: "Mapa", href: "/mapa" },
  { clave: "clientes", etiqueta: "Clientes", href: "/clientes" },
  { clave: "siniestros", etiqueta: "Gestión de siniestros", href: "/siniestros" },
  { clave: "fotos", etiqueta: "Fotos", href: "/fotos" },
  { clave: "peritos", etiqueta: "Peritos", href: "/peritos" },
  { clave: "admin", etiqueta: "Administración", href: "/admin" },
] as const;

export const ACCIONES = [
  { clave: "subir_fotos", etiqueta: "Subir fotos de campo" },
  { clave: "cambiar_estado", etiqueta: "Cambiar estado de siniestros" },
  { clave: "asignar_perito", etiqueta: "Asignar casos a un perito" },
  { clave: "exportar", etiqueta: "Exportar listados" },
] as const;

export const ROLES = ["admin", "perito", "cliente", "lectura"] as const;
export type Rol = (typeof ROLES)[number];

export const ETIQUETA_ROL: Record<string, string> = {
  admin: "Administrador",
  perito: "Perito de campo",
  cliente: "Cliente / productor",
  lectura: "Solo lectura",
};

export type Permisos = Record<string, boolean>;

export function puede(permisos: Permisos, clave: string) {
  return permisos[clave] === true;
}
