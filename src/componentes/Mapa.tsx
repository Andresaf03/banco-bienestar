import { type GeoJSONSource, Map as MapaGL, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { caja, colorApertura, colorPrivadas, type ModoMapa, type PropiedadesMunicipio } from "../lib/mapa";

interface Props {
  municipios: FeatureCollection<Polygon | MultiPolygon, PropiedadesMunicipio>;
  estados: FeatureCollection;
  modo: ModoMapa;
  t: number;
  seleccionado: number | null;
  onSeleccionar: (idx: number) => void;
  etiqueta: (idx: number) => ReactNode;
}

const MEXICO: [number, number, number, number] = [-118.5, 14.3, -86.5, 33.0];

/** Mapa municipal sin teselas externas: solo los polígonos del Marco Geoestadístico. */
export function Mapa({ municipios, estados, modo, t, seleccionado, onSeleccionar, etiqueta }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const [listo, setListo] = useState(false);
  const [sobre, setSobre] = useState<{ idx: number; x: number; y: number } | null>(null);
  const seleccionar = useRef(onSeleccionar);
  seleccionar.current = onSeleccionar;

  useEffect(() => {
    if (!contenedor.current) return;
    const m = new MapaGL({
      container: contenedor.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#ffffff" } }],
      },
      bounds: MEXICO,
      fitBoundsOptions: { padding: 12 },
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
      attributionControl: false,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rueda para acercar el mapa",
        "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rueda para acercar el mapa",
        "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
        "NavigationControl.ZoomIn": "Acercar",
        "NavigationControl.ZoomOut": "Alejar",
      },
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("municipios", { type: "geojson", data: municipios });
      m.addSource("estados", { type: "geojson", data: estados });
      m.addLayer({ id: "relleno", type: "fill", source: "municipios", paint: { "fill-color": colorApertura(t) } });
      m.addLayer({
        id: "bordes",
        type: "line",
        source: "municipios",
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.15, 8, 0.8] },
      });
      m.addLayer({ id: "estados", type: "line", source: "estados", paint: { "line-color": "#8a93a3", "line-width": 0.6 } });
      m.addLayer({
        id: "sobre",
        type: "line",
        source: "municipios",
        filter: ["==", ["get", "idx"], -2],
        paint: { "line-color": "#000000", "line-width": 1.2 },
      });
      m.addLayer({
        id: "seleccion",
        type: "line",
        source: "municipios",
        filter: ["==", ["get", "idx"], -2],
        paint: { "line-color": "#000000", "line-width": 2.2 },
      });
      m.on("mousemove", "relleno", (ev) => {
        const f = ev.features?.[0];
        const idx = f ? Number(f.properties?.idx) : -1;
        m.getCanvas().style.cursor = idx >= 0 ? "pointer" : "";
        m.setFilter("sobre", ["==", ["get", "idx"], idx >= 0 ? idx : -2]);
        setSobre(idx >= 0 ? { idx, x: ev.point.x, y: ev.point.y } : null);
      });
      m.on("mouseleave", "relleno", () => {
        m.getCanvas().style.cursor = "";
        m.setFilter("sobre", ["==", ["get", "idx"], -2]);
        setSobre(null);
      });
      m.on("click", "relleno", (ev) => {
        const idx = Number(ev.features?.[0]?.properties?.idx);
        if (idx >= 0) seleccionar.current(idx);
      });
      setListo(true);
    });
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
    // El mapa se crea una vez; los cambios de datos y modo se aplican abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    (m.getSource("municipios") as GeoJSONSource).setData(municipios);
  }, [municipios, listo]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    m.setPaintProperty("relleno", "fill-color", modo === "apertura" ? colorApertura(t) : colorPrivadas());
  }, [modo, t, listo]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    m.setFilter("seleccion", ["==", ["get", "idx"], seleccionado ?? -2]);
    if (seleccionado === null) return;
    const f = municipios.features.find((x) => x.properties.idx === seleccionado);
    if (!f) return;
    const [o, s, e, n] = caja(f);
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    m.fitBounds([o, s, e, n], { padding: 80, maxZoom: 8, duration: reducido ? 0 : 900 });
  }, [seleccionado, municipios, listo]);

  return (
    <div className="mapa" aria-label="Mapa de municipios de México" role="region">
      <div ref={contenedor} className="mapa__lienzo" />
      {sobre && (
        <div className="etiqueta-mapa" style={{ left: sobre.x, top: sobre.y }}>
          {etiqueta(sobre.idx)}
        </div>
      )}
    </div>
  );
}
