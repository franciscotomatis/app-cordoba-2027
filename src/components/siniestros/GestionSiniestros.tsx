"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  MapPin,
  Send,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { COLOR_CAUSA, COLOR_CAUSA_DEFAULT } from "@/lib/colores";
import { exportarCsv, exportarExcel, exportarPdf, type Columna } from "@/lib/exportar";
import { guardarSeleccion, leerSeleccion } from "@/lib/seleccion";
import { FiltroMulti } from "@/components/mapa/FiltroMulti";
import { BuscadorTexto } from "@/components/mapa/BuscadorTexto";
import { GaleriaLote } from "./GaleriaLote";

export type CasoSiniestro = {
  id: string;
  causa: string | null;
  fecha: string | null;
  danio_estimado: number | null;
  estado: string;
  perito_id: string | null;
  perito_email: string | null;
  perito_nombre: string | null;
  asignado_en: string | null;
  lote_id: string;
  id_lote_externo: string;
  lote_nombre: string | null;
  campo: string | null;
  departamento: string | null;
  localidad: string | null;
  cultivo: string | null;
  hectareas_aseguradas: number | null;
  hectareas_declaradas: number | null;
  suma_asegurada: number | null;
  rendimiento_asegurado: number | null;
  fecha_siembra: string | null;
  cliente_nombre: string | null;
  cliente_cuit: string | null;
  zona_nombre: string | null;
  lat: number | null;
  lon: number | null;
  fotos: number;
};

export type PeritoOpcion = {
  id: string;
  nombre_completo: string | null;
  email: string | null;
};

export const ESTADOS = [
  "DENUNCIADO",
  "PENDIENTE_INSPECCION",
  "CERRADO",
  "PAGADO",
] as const;

const ETIQUETA_ESTADO: Record<string, string> = {
  DENUNCIADO: "Denunciado",
  PENDIENTE_INSPECCION: "Pendiente de inspección",
  CERRADO: "Cerrado",
  PAGADO: "Pagado",
};

const COLOR_ESTADO: Record<string, string> = {
  DENUNCIADO: "var(--color-ink-muted)",
  PENDIENTE_INSPECCION: "var(--color-warning)",
  CERRADO: "var(--color-positive)",
  PAGADO: "var(--color-accent)",
};

const num = (v: number | null | undefined, dec = 0) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fechaCorta = (v: string | null) => {
  if (!v) return "—";
  const [a, m, d] = v.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : v;
};

const soloDigitos = (v: string) => v.replace(/[^0-9]/g, "");

function colorCausa(causa?: string | null) {
  const clave = causa?.trim().toLowerCase();
  return (clave && COLOR_CAUSA[clave]) || COLOR_CAUSA_DEFAULT;
}

const COLUMNAS_EXPORT: Columna<CasoSiniestro>[] = [
  { clave: "id_lote_externo", titulo: "ID lote", ancho: 10 },
  { clave: "lote_nombre", titulo: "Lote", ancho: 18 },
  { clave: "cliente_nombre", titulo: "Asegurado", ancho: 34 },
  { clave: "cliente_cuit", titulo: "CUIT", ancho: 16 },
  { clave: "campo", titulo: "Campo", ancho: 20 },
  { clave: "localidad", titulo: "Localidad", ancho: 18 },
  { clave: "departamento", titulo: "Departamento", ancho: 20 },
  { clave: "zona_nombre", titulo: "Zona", ancho: 10 },
  { clave: "cultivo", titulo: "Cultivo", ancho: 12 },
  { clave: "hectareas_aseguradas", titulo: "Ha aseguradas", ancho: 14 },
  { clave: "hectareas_declaradas", titulo: "Ha declaradas", ancho: 14 },
  { clave: "rendimiento_asegurado", titulo: "Rinde asegurado", ancho: 15 },
  { clave: "suma_asegurada", titulo: "Suma asegurada", ancho: 15 },
  {
    clave: "fecha_siembra",
    titulo: "Fecha siembra",
    ancho: 13,
    valor: (f) => fechaCorta(f.fecha_siembra),
  },
  { clave: "causa", titulo: "Causa siniestro", ancho: 16 },
  {
    clave: "fecha",
    titulo: "Fecha siniestro",
    ancho: 13,
    valor: (f) => fechaCorta(f.fecha),
  },
  { clave: "danio_estimado", titulo: "Daño estimado", ancho: 14 },
  {
    clave: "estado",
    titulo: "Estado del caso",
    ancho: 20,
    valor: (f) => ETIQUETA_ESTADO[f.estado] ?? f.estado,
  },
  {
    clave: "perito_email",
    titulo: "Perito asignado",
    ancho: 26,
    valor: (f) => f.perito_nombre || f.perito_email || "",
  },
  { clave: "fotos", titulo: "Fotos", ancho: 8 },
  { clave: "lat", titulo: "Latitud", ancho: 12 },
  { clave: "lon", titulo: "Longitud", ancho: 12 },
];

export function GestionSiniestros({
  casos,
  peritos,
  puedeEditar,
}: {
  casos: CasoSiniestro[];
  peritos: PeritoOpcion[];
  puedeEditar: boolean;
}) {
  const router = useRouter();

  const [texto, setTexto] = useState("");
  const [cuit, setCuit] = useState("");
  const [causas, setCausas] = useState<string[]>([]);
  const [estados, setEstados] = useState<string[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);
  const [peritosFiltro, setPeritosFiltro] = useState<string[]>([]);
  const [soloSeleccionMapa, setSoloSeleccionMapa] = useState(false);
  const [seleccionMapa, setSeleccionMapa] = useState<string[]>([]);

  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [peritoDestino, setPeritoDestino] = useState("");
  const [loteFotos, setLoteFotos] = useState<CasoSiniestro | null>(null);

  const textoDif = useDeferredValue(texto);
  const cuitDif = useDeferredValue(cuit);

  // Al llegar desde el mapa con ?seleccion=1, arranca filtrado por esa selección.
  useEffect(() => {
    const ids = leerSeleccion();
    setSeleccionMapa(ids);
    const params = new URLSearchParams(window.location.search);
    if (params.get("seleccion") === "1" && ids.length > 0) setSoloSeleccionMapa(true);
  }, []);

  const opciones = useMemo(() => {
    const contar = (fn: (c: CasoSiniestro) => string | null | undefined) => {
      const mapa = new Map<string, number>();
      for (const c of casos) {
        const v = fn(c)?.trim();
        if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1);
      }
      return [...mapa.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([valor, cantidad]) => ({ valor, etiqueta: valor, cantidad }));
    };

    return {
      causas: contar((c) => c.causa).map((o) => ({ ...o, color: colorCausa(o.valor).fill })),
      zonas: contar((c) => c.zona_nombre).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta)),
      estados: ESTADOS.map((e) => ({
        valor: e,
        etiqueta: ETIQUETA_ESTADO[e],
        cantidad: casos.filter((c) => c.estado === e).length,
      })),
      peritos: [
        { valor: "sin", etiqueta: "Sin asignar", cantidad: casos.filter((c) => !c.perito_id).length },
        ...peritos.map((p) => ({
          valor: p.id,
          etiqueta: p.nombre_completo || p.email || p.id,
          cantidad: casos.filter((c) => c.perito_id === p.id).length,
        })),
      ],
      asegurados: [...new Set(casos.map((c) => c.cliente_nombre).filter(Boolean))].sort() as string[],
    };
  }, [casos, peritos]);

  const filtrados = useMemo(() => {
    const q = textoDif.trim().toLowerCase();
    const cu = soloDigitos(cuitDif);
    const setCausas = new Set(causas);
    const setEstados = new Set(estados);
    const setZonas = new Set(zonas);
    const setPeritos = new Set(peritosFiltro);
    const setMapa = new Set(seleccionMapa);

    return casos.filter((c) => {
      if (soloSeleccionMapa && !setMapa.has(c.lote_id)) return false;
      if (q) {
        const busca = [
          c.cliente_nombre,
          c.campo,
          c.lote_nombre,
          c.localidad,
          c.departamento,
          c.id_lote_externo,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!busca.includes(q)) return false;
      }
      if (cu && !soloDigitos(c.cliente_cuit ?? "").includes(cu)) return false;
      if (setCausas.size && !setCausas.has(c.causa?.trim() ?? "")) return false;
      if (setEstados.size && !setEstados.has(c.estado)) return false;
      if (setZonas.size && !setZonas.has(c.zona_nombre?.trim() ?? "")) return false;
      if (setPeritos.size) {
        const clave = c.perito_id ?? "sin";
        if (!setPeritos.has(clave)) return false;
      }
      return true;
    });
  }, [
    casos,
    textoDif,
    cuitDif,
    causas,
    estados,
    zonas,
    peritosFiltro,
    soloSeleccionMapa,
    seleccionMapa,
  ]);

  const totales = useMemo(
    () => ({
      hectareas: filtrados.reduce((a, c) => a + (c.hectareas_aseguradas ?? 0), 0),
      suma: filtrados.reduce((a, c) => a + (c.suma_asegurada ?? 0), 0),
      conFotos: filtrados.filter((c) => c.fotos > 0).length,
    }),
    [filtrados]
  );

  const elegidosCasos = useMemo(
    () => filtrados.filter((c) => elegidos.has(c.id)),
    [filtrados, elegidos]
  );

  const todosElegidos = filtrados.length > 0 && filtrados.every((c) => elegidos.has(c.id));

  function alternarTodos() {
    setElegidos((prev) => {
      const nuevo = new Set(prev);
      if (todosElegidos) filtrados.forEach((c) => nuevo.delete(c.id));
      else filtrados.forEach((c) => nuevo.add(c.id));
      return nuevo;
    });
  }

  function alternarUno(id: string) {
    setElegidos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  async function cambiarEstado(ids: string[], estado: string) {
    if (ids.length === 0) return;
    setGuardando(true);
    setAviso(null);
    const supabase = createClient();
    const { error } = await supabase.from("siniestros").update({ estado }).in("id", ids);
    setGuardando(false);
    if (error) {
      setAviso(`No se pudo actualizar: ${error.message}`);
      return;
    }
    setAviso(
      `${ids.length} caso${ids.length > 1 ? "s" : ""} pasaron a "${ETIQUETA_ESTADO[estado]}".`
    );
    router.refresh();
  }

  async function asignar() {
    if (!peritoDestino || elegidosCasos.length === 0) return;
    setGuardando(true);
    setAviso(null);

    const respuesta = await fetch("/api/siniestros/asignar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: elegidosCasos.map((c) => c.id),
        peritoId: peritoDestino,
      }),
    });

    const datos = await respuesta.json();
    setGuardando(false);

    if (!respuesta.ok) {
      setAviso(datos.error ?? "No se pudo asignar.");
      return;
    }

    setAviso(
      datos.emailEnviado
        ? `${datos.asignados} casos asignados y notificados por correo.`
        : `${datos.asignados} casos asignados. ${datos.motivoEmail ?? ""}`
    );
    router.refresh();
  }

  function verEnMapa(soloElegidos: boolean) {
    const ids = soloElegidos
      ? elegidosCasos.map((c) => c.lote_id)
      : filtrados.map((c) => c.lote_id);
    guardarSeleccion(ids);
    router.push("/mapa?desde=siniestros");
  }

  const nombreArchivo = `siniestros-${new Date().toISOString().slice(0, 10)}`;
  const aExportar = elegidosCasos.length > 0 ? elegidosCasos : filtrados;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-5 py-2.5">
        <BuscadorTexto
          valor={texto}
          onChange={setTexto}
          sugerencias={opciones.asegurados}
          placeholder="Asegurado, campo, lote o localidad..."
          ancho="w-64"
        />
        <input
          value={cuit}
          onChange={(e) => setCuit(e.target.value)}
          placeholder="CUIT"
          className="mono w-32 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] outline-none placeholder:font-sans placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]"
        />
        <FiltroMulti
          titulo="Causa"
          opciones={opciones.causas}
          seleccion={causas}
          onChange={setCausas}
          ancho="w-36"
        />
        <FiltroMulti
          titulo="Estado"
          opciones={opciones.estados}
          seleccion={estados}
          onChange={setEstados}
          ancho="w-44"
        />
        <FiltroMulti
          titulo="Perito"
          opciones={opciones.peritos}
          seleccion={peritosFiltro}
          onChange={setPeritosFiltro}
          ancho="w-40"
        />
        <FiltroMulti
          titulo="Zona"
          opciones={opciones.zonas}
          seleccion={zonas}
          onChange={setZonas}
          ancho="w-32"
        />

        {seleccionMapa.length > 0 && (
          <button
            onClick={() => setSoloSeleccionMapa((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
              soloSeleccionMapa
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-ink-muted)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            Selección del mapa ({seleccionMapa.length})
          </button>
        )}

        <div className="mono ml-auto flex items-baseline gap-1.5 text-[12px]">
          <span className="text-[13px] font-semibold">{filtrados.length}</span>
          <span className="font-sans text-[var(--color-ink-faint)]">casos</span>
          <span className="ml-2 text-[13px] font-semibold">
            {Math.round(totales.hectareas).toLocaleString("es-AR")}
          </span>
          <span className="font-sans text-[var(--color-ink-faint)]">ha</span>
          <span className="ml-2 text-[13px] font-semibold">{totales.conFotos}</span>
          <span className="font-sans text-[var(--color-ink-faint)]">c/fotos</span>
        </div>
      </div>

      {/* Acciones sobre la selección */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-2">
        <span className="text-[12px] text-[var(--color-ink-muted)]">
          <span className="mono font-semibold text-[var(--color-ink)]">
            {elegidosCasos.length}
          </span>{" "}
          seleccionados
        </span>

        {elegidosCasos.length > 0 && (
          <button
            onClick={() => setElegidos(new Set())}
            className="text-[11.5px] text-[var(--color-ink-faint)] underline hover:text-[var(--color-ink)]"
          >
            limpiar
          </button>
        )}

        {puedeEditar && (
          <>
            <select
              defaultValue=""
              disabled={guardando || elegidosCasos.length === 0}
              onChange={(e) => {
                if (e.target.value) {
                  cambiarEstado(
                    elegidosCasos.map((c) => c.id),
                    e.target.value
                  );
                  e.target.value = "";
                }
              }}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none disabled:opacity-40"
            >
              <option value="">Cambiar estado…</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <select
                value={peritoDestino}
                disabled={guardando || elegidosCasos.length === 0}
                onChange={(e) => setPeritoDestino(e.target.value)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none disabled:opacity-40"
              >
                <option value="">Asignar a perito…</option>
                {peritos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre_completo || p.email}
                  </option>
                ))}
              </select>
              <button
                onClick={asignar}
                disabled={guardando || !peritoDestino || elegidosCasos.length === 0}
                className="flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
              >
                {guardando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Asignar
              </button>
            </div>
          </>
        )}

        <button
          onClick={() => verEnMapa(elegidosCasos.length > 0)}
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          <MapPin className="h-3.5 w-3.5" />
          Ver en mapa
        </button>

        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 text-[11px] text-[var(--color-ink-faint)]">
            Exportar {aExportar.length}:
          </span>
          <button
            onClick={() => exportarCsv(aExportar, COLUMNAS_EXPORT, nombreArchivo)}
            className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <FileText className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            onClick={() => exportarExcel(aExportar, COLUMNAS_EXPORT, nombreArchivo)}
            className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </button>
          <button
            onClick={() => exportarPdf(aExportar, COLUMNAS_EXPORT, nombreArchivo)}
            className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </div>

      {aviso && (
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-accent-soft)] px-5 py-1.5 text-[12px] text-[var(--color-accent)]">
          {aviso}
          <button onClick={() => setAviso(null)} className="ml-auto">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
            <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] tracking-wide text-[var(--color-ink-faint)] uppercase">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={todosElegidos}
                  onChange={alternarTodos}
                  className="accent-[var(--color-accent)]"
                  aria-label="Seleccionar todos"
                />
              </th>
              <th className="px-2 py-2 font-medium">Lote</th>
              <th className="px-2 py-2 font-medium">Asegurado</th>
              <th className="px-2 py-2 font-medium">Causa</th>
              <th className="px-2 py-2 font-medium">Fecha</th>
              <th className="px-2 py-2 text-right font-medium">Ha</th>
              <th className="px-2 py-2 text-right font-medium">Daño</th>
              <th className="px-2 py-2 font-medium">Estado</th>
              <th className="px-2 py-2 font-medium">Perito</th>
              <th className="px-2 py-2 font-medium">Fotos</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => {
              const elegido = elegidos.has(c.id);
              return (
                <tr
                  key={c.id}
                  className={`border-b border-[var(--color-border)] last:border-0 ${
                    elegido
                      ? "bg-[var(--color-accent-soft)]"
                      : "hover:bg-[var(--color-surface-muted)]"
                  }`}
                >
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={elegido}
                      onChange={() => alternarUno(c.id)}
                      className="accent-[var(--color-accent)]"
                      aria-label={`Seleccionar lote ${c.id_lote_externo}`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Link
                      href={`/mapa?lote=${encodeURIComponent(c.id_lote_externo)}`}
                      className="mono text-[var(--color-accent)] hover:underline"
                    >
                      #{c.id_lote_externo}
                    </Link>
                    <span className="ml-1.5 text-[var(--color-ink-muted)]">
                      {c.lote_nombre ?? ""}
                    </span>
                    <div className="text-[10.5px] text-[var(--color-ink-faint)]">
                      {[c.campo, c.localidad].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="max-w-52 px-2 py-1.5">
                    <div className="truncate">{c.cliente_nombre ?? "—"}</div>
                    <div className="mono text-[10.5px] text-[var(--color-ink-faint)]">
                      {c.cliente_cuit ?? ""}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: colorCausa(c.causa).fill }}
                      />
                      {c.causa ?? "—"}
                    </span>
                  </td>
                  <td className="mono px-2 py-1.5 text-[var(--color-ink-muted)]">
                    {fechaCorta(c.fecha)}
                  </td>
                  <td className="mono px-2 py-1.5 text-right">
                    {num(c.hectareas_aseguradas, 1)}
                  </td>
                  <td className="mono px-2 py-1.5 text-right">{num(c.danio_estimado)}</td>
                  <td className="px-2 py-1.5">
                    {puedeEditar ? (
                      <select
                        value={c.estado}
                        onChange={(e) => cambiarEstado([c.id], e.target.value)}
                        className="rounded border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-accent)]"
                        style={{ color: COLOR_ESTADO[c.estado] }}
                      >
                        {ESTADOS.map((e) => (
                          <option key={e} value={e} className="text-[var(--color-ink)]">
                            {ETIQUETA_ESTADO[e]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ color: COLOR_ESTADO[c.estado] }}>
                        {ETIQUETA_ESTADO[c.estado] ?? c.estado}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-[11.5px] text-[var(--color-ink-muted)]">
                    {c.perito_nombre || c.perito_email || (
                      <span className="text-[var(--color-ink-faint)]">sin asignar</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => setLoteFotos(c)}
                      disabled={c.fotos === 0}
                      className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] ${
                        c.fotos > 0
                          ? "text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                          : "cursor-default text-[var(--color-ink-faint)]"
                      }`}
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {c.fotos}
                    </button>
                  </td>
                  <td className="px-2 py-1.5" />
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtrados.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-[12px] text-[var(--color-ink-muted)]">
              {soloSeleccionMapa
                ? `Los ${seleccionMapa.length} lotes que seleccionaste en el mapa no tienen siniestros denunciados.`
                : "No hay casos que coincidan con los filtros."}
            </p>
            {soloSeleccionMapa && (
              <button
                onClick={() => setSoloSeleccionMapa(false)}
                className="mt-2 text-[11.5px] text-[var(--color-accent)] underline"
              >
                Ver todos los casos
              </button>
            )}
          </div>
        )}
      </div>

      {loteFotos && (
        <GaleriaLote
          loteId={loteFotos.lote_id}
          titulo={`#${loteFotos.id_lote_externo} · ${loteFotos.cliente_nombre ?? ""}`}
          onCerrar={() => setLoteFotos(null)}
        />
      )}
    </div>
  );
}
