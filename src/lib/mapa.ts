// Geometría y colores del mapa municipal.

import type { ExpressionSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { Datos } from "./tipos";

export const SIN_SUCURSAL = "#eef0f4";

/** Categorías de apertura según G (2019T1 = 1). Las tonalidades oscurecen hacia lo más antiguo. */
export const CATEGORIAS = [
  { nombre: "Ya tenía en 2019 (Bansefi)", color: "#0a2a66", desde: 1, hasta: 1 },
  { nombre: "Abre en 2019–2022", color: "#0b5fff", desde: 2, hasta: 16 },
  { nombre: "Abre en 2023", color: "#5f8fff", desde: 17, hasta: 20 },
  { nombre: "Abre en 2024", color: "#a9c4ff", desde: 21, hasta: 24 },
  { nombre: "Abre en 2025", color: "#d4e2ff", desde: 25, hasta: 28 },
];

/** Clases de sucursales privadas por 10 mil adultos en 2019T1. */
export const CLASES_PRIVADAS = [
  { nombre: "Ninguna", color: SIN_SUCURSAL, hasta: 0 },
  { nombre: "Hasta 0.5", color: "#c9d9ff", hasta: 0.5 },
  { nombre: "0.5 a 1", color: "#7fa6ff", hasta: 1 },
  { nombre: "1 a 2", color: "#2f6fff", hasta: 2 },
  { nombre: "Más de 2", color: "#0a2a66", hasta: Infinity },
];

export type ModoMapa = "apertura" | "privadas";

export interface PropiedadesMunicipio {
  CVEGEO: string;
  /** índice en municipios.json; −1 si el polígono no está en el panel */
  idx: number;
  G: number;
  priv19: number;
}

export function geometria(topo: Topology, datos: Datos) {
  const { municipios, poligonos } = datos.municipios;
  const indice = new Map(municipios.map((m, i) => [m.c, i]));
  const T = datos.panel.t.length;
  const priv = datos.panel.vars.privado;
  const muni = feature(topo, topo.objects.municipios) as unknown as FeatureCollection<
    Polygon | MultiPolygon,
    { CVEGEO: string }
  >;
  const estados = feature(topo, topo.objects.estados) as unknown as FeatureCollection;
  const conDatos: FeatureCollection<Polygon | MultiPolygon, PropiedadesMunicipio> = {
    type: "FeatureCollection",
    features: muni.features.map((f) => {
      const clave = poligonos[f.properties.CVEGEO] ?? f.properties.CVEGEO;
      const idx = indice.get(clave) ?? -1;
      return {
        ...f,
        properties: {
          CVEGEO: f.properties.CVEGEO,
          idx,
          G: idx >= 0 ? municipios[idx].G : 0,
          priv19: idx >= 0 ? (priv[idx * T] ?? -1) : -1,
        },
      };
    }),
  };
  return { municipios: conDatos, estados };
}

/** Color de cada municipio en el trimestre `t`: los que aún no abren quedan en gris. */
export function colorApertura(t: number): ExpressionSpecification {
  const G: ExpressionSpecification = ["get", "G"];
  const casos: (ExpressionSpecification | string | boolean)[] = [
    ["==", G, 0],
    SIN_SUCURSAL,
    [">", G, t],
    SIN_SUCURSAL,
  ];
  for (const c of CATEGORIAS) casos.push(["<=", G, c.hasta], c.color);
  return ["case", ...casos, SIN_SUCURSAL] as unknown as ExpressionSpecification;
}

export function colorPrivadas(): ExpressionSpecification {
  const v: ExpressionSpecification = ["get", "priv19"];
  const casos: (ExpressionSpecification | string)[] = [["<", v, 0], "#ffffff"];
  for (const c of CLASES_PRIVADAS) {
    if (Number.isFinite(c.hasta)) casos.push(["<=", v, c.hasta], c.color);
  }
  return ["case", ...casos, CLASES_PRIVADAS[CLASES_PRIVADAS.length - 1].color] as unknown as ExpressionSpecification;
}

/** Caja que contiene un polígono: [oeste, sur, este, norte]. */
export function caja(f: Feature<Geometry>): [number, number, number, number] {
  let o = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const recorrer = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      o = Math.min(o, c[0] as number);
      e = Math.max(e, c[0] as number);
      s = Math.min(s, c[1] as number);
      n = Math.max(n, c[1] as number);
    } else if (Array.isArray(c)) c.forEach(recorrer);
  };
  if ("coordinates" in f.geometry) recorrer(f.geometry.coordinates);
  return [o, s, e, n];
}
