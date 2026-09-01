"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  LayerGroup,
  GeoJSON,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import {
  Crosshair,
  Lasso,
  ListChecks,
  MousePointerClick,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { COLOR_CAUSA, COLOR_CAUSA_DEFAULT, colorPorCultivo } from "@/lib/colores";
import { cargarLotes, invalidarLotes, lotesEnCache } from "@/lib/datosMapa";
import { createClient } from "@/lib/supabase/client";
import { dentroDePoligono, useSeleccion } from "@/lib/seleccion";
import { CapaFotos } from "./mapa/CapaFotos";
import { ESTADOS, ETIQUETA_ESTADO, PUNTO_ESTADO } from "@/lib/siniestros";
import { FiltroMulti } from "./mapa/FiltroMulti";
import { BuscadorTexto } from "./mapa/BuscadorTexto";
import "leaflet/dist/leaflet.css";

type Siniestro = {
  id: string;
  causa: string;
  fecha: string | null;
  danio_estimado: number | null;
  estado: string | null;
};

export type LoteProps = {
  id: string;
  loteId: string;
  lote: string | null;
  campo: string | null;
  departamento: string | null;
  localidad: string | null;
  cultivo: string | null;
  cultivoAnterior: string | null;
  hectareas: number | null;
  hectareasDeclaradas: number | null;
  porcentajeAsegurado: number | null;
  rendimientoAsegurado: number | null;
  rindeEstimado: number | null;
  rendimientoAnterior: number | null;
  sumaAsegurada: number | null;
  fechaSiembra: string | null;
  estado: string | null;
  cliente: string | null;
  cuit: string | null;
  zona: string | null;
  lat: number | null;
  lon: number | null;
  siniestros: Siniestro[];
  fill: string;
  borde: string;
};

type Filtros = {
  texto: string;
  cuit: string;
  cultivos: string[];
  causas: string[];
  zonas: string[];
  departamentos: string[];
  estados: string[];
  soloSiniestros: boolean;
  soloSeleccion: boolean;
};

const FILTROS_VACIOS: Filtros = {
  texto: "",
  cuit: "",
  cultivos: [],
  causas: [],
  zonas: [],
  departamentos: [],
  estados: [],
  soloSiniestros: false,
  soloSeleccion: false,
};

const OCULTO: L.PathOptions = {
  opacity: 0,
  fillOpacity: 0,
  weight: 0,
  interactive: false,
};

const num = (v: number | null | undefined, dec = 0) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fecha = (v: string | null) => {
  if (!v) return "—";
  const [a, m, d] = v.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : v;
};

const escapar = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const normalizar = (v: string) => v.trim().toLowerCase();
const soloDigitos = (v: string) => v.replace(/[^0-9]/g, "");

/** El rinde asegurado viene como total de quintales del lote: se muestra por hectárea. */
function rindeAseguradoPorHa(p: LoteProps) {
  const ha = Number(p.hectareas ?? 0);
  const total = Number(p.rendimientoAsegurado ?? 0);
  if (!ha || !total) return null;
  return Math.round(total / ha);
}

function colorCausa(causa?: string | null) {
  const clave = causa?.trim().toLowerCase();
  return (clave && COLOR_CAUSA[clave]) || COLOR_CAUSA_DEFAULT;
}

function fila(etiqueta: string, valor: string, resaltar = false) {
  return `<div style="display:flex;justify-content:space-between;gap:12px;padding:2.5px 0">
    <span style="color:var(--color-ink-faint);font-size:11.5px">${etiqueta}</span>
    <span style="font-family:var(--font-jetbrains),monospace;font-size:11.5px;font-variant-numeric:tabular-nums;${
      resaltar ? "color:var(--color-accent);font-weight:600" : ""
    }">${valor}</span>
  </div>`;
}

function contenidoPopup(p: LoteProps) {
  const color = colorPorCultivo(p.cultivo);
  const ubicacion = [p.campo, p.localidad, p.departamento].filter(Boolean).join(" · ");
  const pct = p.porcentajeAsegurado != null ? ` (${num(p.porcentajeAsegurado)}%)` : "";

  const siniestros = p.siniestros?.length
    ? `<div style="border-top:1px solid var(--color-border);padding:8px 12px;background:var(--color-surface-muted)">
        ${p.siniestros
          .map((s) => {
            const c = colorCausa(s.causa);
            return `<div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
              <span style="width:8px;height:8px;border-radius:2px;background:${c.fill};border:1px solid ${c.borde};flex-shrink:0"></span>
              <span style="font-weight:600;font-size:11.5px">${escapar(s.causa)}</span>
              <span style="color:var(--color-ink-faint);font-size:11px;margin-left:auto;font-family:var(--font-jetbrains),monospace">${fecha(s.fecha)}</span>
            </div>
            <div style="padding-left:15px;font-size:11px;color:var(--color-ink-muted)">
              ${s.estado ? `Estado: ${escapar(s.estado.replace(/_/g, " "))}` : ""}
              ${
                s.danio_estimado != null
                  ? ` · Daño: <span style="font-family:var(--font-jetbrains),monospace">${num(s.danio_estimado)}</span>`
                  : ""
              }
            </div>`;
          })
          .join("")}
      </div>`
    : "";

  return `<div style="min-width:260px;max-width:300px">
    <div style="padding:10px 12px 8px;border-bottom:1px solid var(--color-border)">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="width:9px;height:9px;border-radius:2px;background:${color.fill};border:1px solid ${color.borde};flex-shrink:0"></span>
        <span style="font-weight:600;font-size:13px">${escapar(p.lote || `Lote ${p.loteId}`)}</span>
        <span style="margin-left:auto;font-family:var(--font-jetbrains),monospace;font-size:10px;color:var(--color-ink-faint)">#${escapar(p.loteId)}</span>
      </div>
      ${ubicacion ? `<div style="color:var(--color-ink-muted);font-size:11.5px;margin-top:2px">${escapar(ubicacion)}</div>` : ""}
    </div>

    <div style="padding:8px 12px;border-bottom:1px solid var(--color-border)">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-ink-faint);margin-bottom:2px">Asegurado</div>
      <div style="font-size:12.5px;font-weight:500;line-height:1.35">${escapar(p.cliente ?? "Sin asignar")}</div>
      ${p.cuit ? `<div style="font-family:var(--font-jetbrains),monospace;font-size:11px;color:var(--color-ink-muted);margin-top:1px">${escapar(p.cuit)}</div>` : ""}
    </div>

    <div style="padding:8px 12px">
      ${fila("Cultivo", escapar(p.cultivo ?? "—"))}
      ${fila("Hectáreas aseg.", num(p.hectareas, 1), true)}
      ${fila("Hectáreas decl.", num(p.hectareasDeclaradas, 1) + pct)}
      ${fila("Rinde asegurado", rindeAseguradoPorHa(p) === null ? "—" : `${rindeAseguradoPorHa(p)} qq/ha`)}
      ${
        p.rindeEstimado != null
          ? fila("Rinde estimado", `${num(p.rindeEstimado, 1)} qq/ha`, true)
          : ""
      }
      ${fila("Suma asegurada", num(p.sumaAsegurada))}
      ${fila("Siembra", fecha(p.fechaSiembra))}
      ${p.cultivoAnterior ? fila("Cultivo anterior", escapar(p.cultivoAnterior)) : ""}
      ${fila("Zona", escapar(p.zona ?? "—"))}
      ${fila("Estado", escapar(p.estado ?? "—"))}
    </div>
    ${siniestros}
  </div>`;
}

function GpsControl() {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15, { animate: true }),
      () => {},
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [map]);
  return null;
}

/** Selección a mano alzada: se dibuja un contorno y se toman los lotes de adentro. */
function Lazo({
  activo,
  alTerminar,
}: {
  activo: boolean;
  alTerminar: (poligono: [number, number][]) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!activo) return;

    const contenedor = map.getContainer();
    contenedor.style.cursor = "crosshair";
    map.dragging.disable();

    let dibujando = false;
    let puntos: L.LatLng[] = [];
    let trazo: L.Polyline | null = null;

    const puntoDelEvento = (e: MouseEvent) =>
      map.containerPointToLatLng(
        L.point(
          e.clientX - contenedor.getBoundingClientRect().left,
          e.clientY - contenedor.getBoundingClientRect().top
        )
      );

    const alPresionar = (e: MouseEvent) => {
      if (e.button !== 0) return;
      dibujando = true;
      puntos = [puntoDelEvento(e)];
      trazo = L.polyline(puntos, {
        color: "#d97757",
        weight: 2,
        dashArray: "4,4",
      }).addTo(map);
    };

    const alMover = (e: MouseEvent) => {
      if (!dibujando || !trazo) return;
      puntos.push(puntoDelEvento(e));
      trazo.setLatLngs(puntos);
    };

    const alSoltar = () => {
      if (!dibujando) return;
      dibujando = false;
      if (trazo) {
        map.removeLayer(trazo);
        trazo = null;
      }
      if (puntos.length > 2) {
        alTerminar(puntos.map((p) => [p.lng, p.lat] as [number, number]));
      }
      puntos = [];
    };

    contenedor.addEventListener("mousedown", alPresionar);
    window.addEventListener("mousemove", alMover);
    window.addEventListener("mouseup", alSoltar);

    return () => {
      contenedor.style.cursor = "";
      map.dragging.enable();
      contenedor.removeEventListener("mousedown", alPresionar);
      window.removeEventListener("mousemove", alMover);
      window.removeEventListener("mouseup", alSoltar);
      if (trazo) map.removeLayer(trazo);
    };
  }, [activo, map, alTerminar]);

  return null;
}

/** Encuadra el mapa usando los centroides (mucho más barato que recorrer geometrías). */
function Encuadre({ puntos }: { puntos: [number, number][] }) {
  const map = useMap();
  const firma = puntos.length + ":" + (puntos[0]?.join(",") ?? "");
  useEffect(() => {
    if (puntos.length === 0) return;
    const bounds = L.latLngBounds(puntos.map(([lat, lon]) => L.latLng(lat, lon)));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
    }
    // La firma evita recalcular cuando el arreglo cambia de identidad pero no de contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, map]);
  return null;
}

export default function MapaLotes({ rol }: { rol: string }) {
  const puedeCargarRinde = rol === "admin" || rol === "perito";
  const [datos, setDatos] = useState<FeatureCollection | null>(lotesEnCache());
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(!lotesEnCache());
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [gpsActivo, setGpsActivo] = useState(false);
  const [colorPor, setColorPor] = useState<"cultivo" | "siniestro">("cultivo");
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [modoLazo, setModoLazo] = useState(false);
  const [rindeTanda, setRindeTanda] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [guardandoRinde, setGuardandoRinde] = useState(false);
  const [avisoRinde, setAvisoRinde] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useSeleccion();

  const capaRef = useRef<L.GeoJSON | null>(null);
  const seleccionRef = useRef<string[]>(seleccion);
  const modoSeleccionRef = useRef(modoSeleccion);
  const alternarRef = useRef<(id: string) => void>(() => {});

  // Los textos se difieren: escribir no bloquea el repintado del mapa.
  const textoDif = useDeferredValue(filtros.texto);
  const cuitDif = useDeferredValue(filtros.cuit);

  useEffect(() => {
    seleccionRef.current = seleccion;
  }, [seleccion]);
  useEffect(() => {
    modoSeleccionRef.current = modoSeleccion;
  }, [modoSeleccion]);

  useEffect(() => {
    if (datos) return;
    cargarLotes()
      .then(setDatos)
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false));
  }, [datos]);

  const props = useMemo(
    () => (datos?.features ?? []).map((f) => f.properties as LoteProps),
    [datos]
  );

  // Índices precalculados una sola vez: evitan recorrer strings en cada tecla.
  const indice = useMemo(
    () =>
      props.map((p) => ({
        id: p.id,
        texto: normalizar(
          [p.cliente, p.campo, p.lote, p.localidad, p.departamento, p.loteId]
            .filter(Boolean)
            .join(" ")
        ),
        cuit: soloDigitos(p.cuit ?? ""),
        cultivo: p.cultivo?.trim() ?? "",
        zona: p.zona?.trim() ?? "",
        departamento: p.departamento?.trim() ?? "",
        causas: (p.siniestros ?? []).map((s) => s.causa?.trim() ?? ""),
        causaPrincipal: p.siniestros?.[0]?.causa?.trim() ?? null,
        estadosCaso: (p.siniestros ?? []).map((s) => s.estado ?? "DENUNCIADO"),
        lat: p.lat,
        lon: p.lon,
        hectareas: p.hectareas ?? 0,
      })),
    [props]
  );

  const opciones = useMemo(() => {
    const contar = (fn: (p: LoteProps) => string | null | undefined) => {
      const mapa = new Map<string, number>();
      for (const p of props) {
        const v = fn(p)?.trim();
        if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1);
      }
      return [...mapa.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([valor, cantidad]) => ({ valor, etiqueta: valor, cantidad }));
    };

    const causas = new Map<string, number>();
    for (const p of props) {
      for (const s of p.siniestros ?? []) {
        const c = s.causa?.trim();
        if (c) causas.set(c, (causas.get(c) ?? 0) + 1);
      }
    }

    return {
      cultivos: contar((p) => p.cultivo).map((o) => ({
        ...o,
        color: colorPorCultivo(o.valor).fill,
      })),
      zonas: contar((p) => p.zona).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta)),
      departamentos: contar((p) => p.departamento).sort((a, b) =>
        a.etiqueta.localeCompare(b.etiqueta)
      ),
      causas: [...causas.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([valor, cantidad]) => ({
          valor,
          etiqueta: valor,
          cantidad,
          color: colorCausa(valor).fill,
        })),
      estados: ESTADOS.map((e) => ({
        valor: e,
        etiqueta: ETIQUETA_ESTADO[e],
        color: PUNTO_ESTADO[e],
        cantidad: props.filter((p) =>
          (p.siniestros ?? []).some((s) => (s.estado ?? "DENUNCIADO") === e)
        ).length,
      })),
      clientes: [...new Set(props.map((p) => p.cliente).filter(Boolean))].sort() as string[],
    };
  }, [props]);

  const hayFiltros =
    textoDif.trim() !== "" ||
    cuitDif.trim() !== "" ||
    filtros.cultivos.length > 0 ||
    filtros.causas.length > 0 ||
    filtros.zonas.length > 0 ||
    filtros.departamentos.length > 0 ||
    filtros.estados.length > 0 ||
    filtros.soloSiniestros ||
    filtros.soloSeleccion;

  // Conjunto de ids visibles + métricas del recorte, en una sola pasada.
  const recorte = useMemo(() => {
    const texto = normalizar(textoDif);
    const cuit = soloDigitos(cuitDif);
    const cultivos = new Set(filtros.cultivos);
    const causas = new Set(filtros.causas);
    const zonas = new Set(filtros.zonas);
    const deptos = new Set(filtros.departamentos);
    const estadosFiltro = new Set(filtros.estados);

    const elegidos = new Set(seleccion);
    const visibles = new Set<string>();
    const puntos: [number, number][] = [];
    const porCultivo = new Map<string, number>();
    const porCausa = new Map<string, number>();
    let hectareas = 0;
    let conSiniestro = 0;

    for (let i = 0; i < indice.length; i++) {
      const it = indice[i];
      if (texto && !it.texto.includes(texto)) continue;
      if (cuit && !it.cuit.includes(cuit)) continue;
      if (cultivos.size && !cultivos.has(it.cultivo)) continue;
      if (zonas.size && !zonas.has(it.zona)) continue;
      if (deptos.size && !deptos.has(it.departamento)) continue;
      if (causas.size && !it.causas.some((c) => causas.has(c))) continue;
      if (estadosFiltro.size && !it.estadosCaso.some((e) => estadosFiltro.has(e))) continue;
      if (filtros.soloSiniestros && it.causas.length === 0) continue;
      if (filtros.soloSeleccion && !elegidos.has(it.id)) continue;

      visibles.add(it.id);
      hectareas += it.hectareas;
      if (it.causas.length) conSiniestro++;
      if (it.lat != null && it.lon != null) puntos.push([it.lat, it.lon]);
      const c = it.cultivo || "Sin especificar";
      porCultivo.set(c, (porCultivo.get(c) ?? 0) + it.hectareas);
      if (it.causaPrincipal) {
        porCausa.set(it.causaPrincipal, (porCausa.get(it.causaPrincipal) ?? 0) + it.hectareas);
      }
    }

    return {
      visibles,
      puntos,
      hectareas,
      conSiniestro,
      porCultivo,
      porCausa,
      lotes: visibles.size,
    };
  }, [
    indice,
    textoDif,
    cuitDif,
    filtros.cultivos,
    filtros.causas,
    filtros.zonas,
    filtros.departamentos,
    filtros.estados,
    filtros.soloSiniestros,
    filtros.soloSeleccion,
    seleccion,
  ]);

  const alternarSeleccion = useCallback(
    (id: string) => {
      const actual = seleccionRef.current;
      setSeleccion(actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]);
    },
    [setSeleccion]
  );

  useEffect(() => {
    alternarRef.current = alternarSeleccion;
  }, [alternarSeleccion]);

  // Estilo: se aplica sobre la capa ya montada, sin volver a crear los polígonos.
  const aplicarEstilos = useCallback(() => {
    const capa = capaRef.current;
    if (!capa) return;
    const visibles = recorte.visibles;
    const elegidos = new Set(seleccion);

    capa.setStyle((feature) => {
      const p = feature?.properties as LoteProps | undefined;
      if (!p || !visibles.has(p.id)) return OCULTO;
      if (elegidos.has(p.id)) {
        return {
          color: "#d97757",
          fillColor: p.fill,
          weight: 3,
          fillOpacity: 0.85,
          opacity: 1,
          interactive: true,
        };
      }
      if (colorPor === "siniestro") {
        const causa = p.siniestros?.[0]?.causa;
        if (!causa) {
          // Sin siniestro: gris tenue, para que resalten los casos.
          return {
            color: "#8d857b",
            fillColor: "#b8b0a6",
            weight: 1,
            fillOpacity: 0.25,
            opacity: 0.6,
            interactive: true,
          };
        }
        const c = colorCausa(causa);
        return {
          color: c.borde,
          fillColor: c.fill,
          weight: 2,
          fillOpacity: 0.7,
          opacity: 1,
          interactive: true,
        };
      }

      return {
        color: p.borde,
        fillColor: p.fill,
        weight: 1.5,
        fillOpacity: 0.55,
        opacity: 1,
        interactive: true,
      };
    });
  }, [recorte.visibles, seleccion, colorPor]);

  useEffect(() => {
    aplicarEstilos();
  }, [aplicarEstilos]);

  const alCrearCapa = useCallback((feature: Feature, layer: L.Layer) => {
    const p = feature.properties as LoteProps;
    layer.on("click", (e: L.LeafletMouseEvent) => {
      if (modoSeleccionRef.current) {
        L.DomEvent.stopPropagation(e);
        alternarRef.current(p.id);
        return;
      }
      layer.bindPopup(contenidoPopup(p), { maxWidth: 320 }).openPopup(e.latlng);
    });
  }, []);

  /** Carga el mismo rinde estimado (qq/ha) en todos los lotes seleccionados. */
  async function cargarRindeEnSeleccion() {
    const valor = Number(rindeTanda.replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) {
      setAvisoRinde("Ingresá un rinde válido en qq/ha.");
      return;
    }

    setGuardandoRinde(true);
    setAvisoRinde(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("lotes")
      .update({ rinde_estimado: valor, rinde_estimado_en: new Date().toISOString() })
      .in("id", seleccion);

    setGuardandoRinde(false);

    if (error) {
      setAvisoRinde(`No se pudo guardar: ${error.message}`);
      return;
    }

    // Se actualiza lo que ya está en pantalla y se descarta la caché.
    for (const f of datos?.features ?? []) {
      const p = f.properties as LoteProps;
      if (seleccion.includes(p.id)) p.rindeEstimado = valor;
    }
    invalidarLotes();
    setRindeTanda("");
    setAvisoRinde(
      `Rinde de ${valor} qq/ha cargado en ${seleccion.length} lote${seleccion.length > 1 ? "s" : ""}.`
    );
  }

  const seleccionarConLazo = useCallback(
    (poligono: [number, number][]) => {
      const nuevos = new Set(seleccionRef.current);
      for (const it of indice) {
        if (!recorte.visibles.has(it.id)) continue;
        if (it.lat == null || it.lon == null) continue;
        if (dentroDePoligono([it.lon, it.lat], poligono)) nuevos.add(it.id);
      }
      setSeleccion([...nuevos]);
      setModoLazo(false);
    },
    [indice, recorte.visibles, setSeleccion]
  );

  // Al llegar desde la tabla con ?lote=ID, filtra y encuadra ese lote.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lote = params.get("lote");
    if (lote) setFiltros((f) => ({ ...f, texto: lote }));
    if (params.get("desde") === "siniestros") {
      setFiltros((f) => ({ ...f, soloSeleccion: true }));
    }
  }, []);

  // Sin filtros y sin ningún lote visible: el usuario no tiene alcance asignado,
  // no es que la búsqueda no encontró nada.
  const sinAlcance = !cargando && !error && (datos?.features.length ?? 0) === 0;

  const seleccionados = seleccion.length;
  const seleccionConSiniestro = useMemo(() => {
    const elegidos = new Set(seleccion);
    return indice.filter((it) => elegidos.has(it.id) && it.causas.length > 0).length;
  }, [indice, seleccion]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative z-[1300] shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <BuscadorTexto
            valor={filtros.texto}
            onChange={(v) => setFiltros((f) => ({ ...f, texto: v }))}
            sugerencias={opciones.clientes}
            placeholder="Asegurado, campo, lote o localidad..."
            ancho="w-full sm:w-72"
          />

          <button
            onClick={() => setFiltrosAbiertos((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] sm:hidden ${
              hayFiltros
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-ink-muted)]"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtros
          </button>

          <div
            className={`${filtrosAbiertos ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`}
          >
          <input
            value={filtros.cuit}
            onChange={(e) => setFiltros((f) => ({ ...f, cuit: e.target.value }))}
            placeholder="CUIT"
            className="mono w-32 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] outline-none placeholder:font-sans placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]"
          />

          <FiltroMulti
            titulo="Cultivo"
            opciones={opciones.cultivos}
            seleccion={filtros.cultivos}
            onChange={(v) => setFiltros((f) => ({ ...f, cultivos: v }))}
            ancho="w-40"
          />
          <FiltroMulti
            titulo="Siniestro"
            opciones={opciones.causas}
            seleccion={filtros.causas}
            onChange={(v) => setFiltros((f) => ({ ...f, causas: v }))}
            ancho="w-40"
          />
          <FiltroMulti
            titulo="Estado"
            opciones={opciones.estados}
            seleccion={filtros.estados}
            onChange={(v) => setFiltros((f) => ({ ...f, estados: v }))}
            ancho="w-44"
          />
          <FiltroMulti
            titulo="Zona"
            opciones={opciones.zonas}
            seleccion={filtros.zonas}
            onChange={(v) => setFiltros((f) => ({ ...f, zonas: v }))}
            ancho="w-32"
          />
          <FiltroMulti
            titulo="Depto."
            opciones={opciones.departamentos}
            seleccion={filtros.departamentos}
            onChange={(v) => setFiltros((f) => ({ ...f, departamentos: v }))}
            ancho="w-36"
          />

          <div className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] p-0.5">
            {(["cultivo", "siniestro"] as const).map((modo) => (
              <button
                key={modo}
                onClick={() => setColorPor(modo)}
                className={`rounded px-2 py-1 text-[11.5px] capitalize transition-colors ${
                  colorPor === modo
                    ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
                    : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                }`}
                title={
                  modo === "cultivo"
                    ? "Pintar los lotes según el cultivo"
                    : "Pintar los lotes según la causa del siniestro"
                }
              >
                {modo === "cultivo" ? "Color: cultivo" : "Color: siniestro"}
              </button>
            ))}
          </div>

          <button
            onClick={() => setFiltros((f) => ({ ...f, soloSiniestros: !f.soloSiniestros }))}
            className={`rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
              filtros.soloSiniestros
                ? "border-[var(--color-danger)] text-[var(--color-danger)]"
                : "border-[var(--color-border)] text-[var(--color-ink-muted)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            Solo siniestros
          </button>

          {seleccion.length > 0 && (
            <button
              onClick={() => setFiltros((f) => ({ ...f, soloSeleccion: !f.soloSeleccion }))}
              className={`rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
                filtros.soloSeleccion
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-ink-muted)] hover:border-[var(--color-border-strong)]"
              }`}
            >
              Solo selección
            </button>
          )}

          {hayFiltros && (
            <button
              onClick={() => setFiltros(FILTROS_VACIOS)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
            >
              <X className="h-3.5 w-3.5" />
              Limpiar
            </button>
          )}
          </div>

          <div className="ml-auto flex items-baseline gap-1.5 text-[12px]">
            <span className="mono text-[13px] font-semibold">
              {recorte.lotes.toLocaleString("es-AR")}
            </span>
            <span className="text-[var(--color-ink-faint)]">lotes</span>
            <span className="mono ml-2 text-[13px] font-semibold">
              {Math.round(recorte.hectareas).toLocaleString("es-AR")}
            </span>
            <span className="text-[var(--color-ink-faint)]">ha</span>
            {recorte.conSiniestro > 0 && (
              <>
                <span className="mono ml-2 text-[13px] font-semibold text-[var(--color-danger)]">
                  {recorte.conSiniestro.toLocaleString("es-AR")}
                </span>
                <span className="text-[var(--color-ink-faint)]">c/siniestro</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Barra de selección */}
      <div className="relative z-[1200] flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1.5 sm:px-4">
        <button
          onClick={() => {
            setModoSeleccion((v) => !v);
            setModoLazo(false);
          }}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
            modoSeleccion
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          <MousePointerClick className="h-3.5 w-3.5" />
          Seleccionar con clic
        </button>

        <button
          onClick={() => {
            setModoLazo((v) => !v);
            setModoSeleccion(false);
          }}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
            modoLazo
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          <Lasso className="h-3.5 w-3.5" />
          Selección a mano alzada
        </button>

        {modoLazo && (
          <span className="text-[11.5px] text-[var(--color-ink-muted)]">
            Mantené el botón izquierdo y rodeá los lotes que quieras.
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-[var(--color-ink-muted)]">
            <span className="mono font-semibold text-[var(--color-ink)]">{seleccionados}</span>{" "}
            seleccionados
            {seleccionados > 0 && (
              <>
                {" · "}
                <span
                  className={`mono font-semibold ${
                    seleccionConSiniestro > 0
                      ? "text-[var(--color-danger)]"
                      : "text-[var(--color-ink-faint)]"
                  }`}
                >
                  {seleccionConSiniestro}
                </span>{" "}
                con siniestro
              </>
            )}
          </span>
          {seleccionados > 0 && puedeCargarRinde && (
            <div className="flex items-center gap-1">
              <input
                value={rindeTanda}
                onChange={(e) => setRindeTanda(e.target.value)}
                inputMode="decimal"
                placeholder="Rinde qq/ha"
                disabled={guardandoRinde}
                className="mono w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none placeholder:font-sans focus:border-[var(--color-accent)] disabled:opacity-40"
              />
              <button
                onClick={cargarRindeEnSeleccion}
                disabled={guardandoRinde || !rindeTanda}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-40"
              >
                {guardandoRinde ? "Guardando..." : "Cargar rinde"}
              </button>
            </div>
          )}

          {seleccionados > 0 && (
            <>
              <button
                onClick={() => setSeleccion([])}
                className="rounded-md px-2 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                Limpiar
              </button>
              <Link
                href="/siniestros?seleccion=1"
                className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[var(--color-accent-hover)]"
              >
                <ListChecks className="h-3.5 w-3.5" />
                Gestionar selección
              </Link>
            </>
          )}
        </div>
      </div>

      {avisoRinde && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-accent-soft)] px-4 py-1.5 text-[12px] text-[var(--color-accent)]">
          {avisoRinde}
          <button onClick={() => setAvisoRinde(null)} className="ml-auto">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {sinAlcance && (
          <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-[var(--color-canvas)]/85 p-6 backdrop-blur-sm">
            <div className="max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
              <p className="mb-1 text-[13px] font-semibold">
                {rol === "perito"
                  ? "Todavía no tenés casos asignados"
                  : "No hay lotes para mostrar"}
              </p>
              <p className="text-[12px] text-[var(--color-ink-muted)]">
                {rol === "perito"
                  ? "Cuando un administrador te asigne un siniestro, vas a ver acá ese lote y todos los del mismo asegurado."
                  : rol === "cliente"
                    ? "Tu usuario todavía no está vinculado a un asegurado. Pedile a un administrador que lo asocie."
                    : "No hay lotes cargados en el sistema."}
              </p>
            </div>
          </div>
        )}

        {!sinAlcance && (error || cargando || (!cargando && recorte.lotes === 0)) && (
          <div
            className={`absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-md border bg-[var(--color-surface)] px-3 py-1.5 text-[12px] ${
              error
                ? "border-[var(--color-danger)] text-[var(--color-danger)]"
                : "border-[var(--color-border)] text-[var(--color-ink-muted)]"
            }`}
          >
            {error ?? (cargando ? "Cargando lotes..." : "Ningún lote coincide con los filtros")}
          </div>
        )}

        <div className="absolute right-3 bottom-8 z-[1000] max-h-64 w-52 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-2.5 shadow-sm backdrop-blur">
          <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
            {colorPor === "cultivo" ? "Hectáreas por cultivo" : "Hectáreas por causa"}
          </p>
          <ul className="space-y-0.5">
            {[...(colorPor === "cultivo" ? recorte.porCultivo : recorte.porCausa).entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([clave, ha]) => (
                <li key={clave} className="flex items-center gap-1.5 text-[11.5px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{
                      background:
                        colorPor === "cultivo"
                          ? colorPorCultivo(clave).fill
                          : colorCausa(clave).fill,
                    }}
                  />
                  <span className="truncate">{clave}</span>
                  <span className="mono ml-auto text-[var(--color-ink-muted)]">
                    {Math.round(ha).toLocaleString("es-AR")}
                  </span>
                </li>
              ))}
            {colorPor === "siniestro" && recorte.porCausa.size === 0 && (
              <li className="text-[11px] text-[var(--color-ink-faint)]">
                No hay siniestros en este recorte.
              </li>
            )}
          </ul>
        </div>

        <button
          onClick={() => setGpsActivo((v) => !v)}
          title="Seguir mi ubicación"
          className={`absolute bottom-8 left-3 z-[1000] flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] shadow-sm transition-colors ${
            gpsActivo
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          <Crosshair className="h-3.5 w-3.5" />
          GPS
        </button>

        <MapContainer center={[-32.2, -63.5]} zoom={8} className="h-full w-full" preferCanvas>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Satélite">
              <TileLayer
                attribution="Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Híbrido">
              <TileLayer
                attribution="Google"
                url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Gris">
              <TileLayer
                attribution="Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Calles">
              <TileLayer
                attribution="Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
            <LayersControl.Overlay name="📷 Fotos de campo">
              <LayerGroup>
                <CapaFotos />
              </LayerGroup>
            </LayersControl.Overlay>
          </LayersControl>

          {datos && (
            <GeoJSON
              data={datos}
              ref={(capa) => {
                capaRef.current = capa;
                if (capa) aplicarEstilos();
              }}
              onEachFeature={alCrearCapa}
            />
          )}

          {hayFiltros && <Encuadre puntos={recorte.puntos} />}
          <Lazo activo={modoLazo} alTerminar={seleccionarConLazo} />
          {gpsActivo && <GpsControl />}
        </MapContainer>
      </div>
    </div>
  );
}
