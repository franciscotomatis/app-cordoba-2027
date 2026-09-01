"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Map,
  Users,
  ClipboardList,
  Camera,
  HardHat,
  Settings,
} from "lucide-react";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
};

const ITEMS: Item[] = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/mapa", label: "Mapa", icon: Map },
  { href: "/clientes", label: "Clientes", icon: Users, roles: ["admin", "perito", "lectura"] },
  { href: "/siniestros", label: "Gestión de siniestros", icon: ClipboardList },
  { href: "/fotos", label: "Fotos", icon: Camera },
  { href: "/peritos", label: "Peritos", icon: HardHat, roles: ["admin", "perito", "lectura"] },
  { href: "/admin", label: "Administración", icon: Settings, roles: ["admin"] },
];

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const visibles = ITEMS.filter((i) => !i.roles || i.roles.includes(role));

  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-accent)] text-[13px] font-semibold text-white">
          C
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold">Programa Córdoba</p>
          <p className="mono text-[10px] text-[var(--color-ink-faint)]">25/26</p>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {visibles.map(({ href, label, icon: Icon }) => {
          const activo = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  activo
                    ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
                    : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
