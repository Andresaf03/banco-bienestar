// Especificaciones de Observable Plot que se repiten: estudio de evento e intervalos horizontales.

import * as Plot from "@observablehq/plot";
import { AZUL, AZUL_BANDA, GRIS, LINEA, TINTA } from "../componentes/Grafica";
import { num, pct } from "./formato";

export interface PuntoE {
  e: number;
  att: number;
  lo: number;
  hi: number;
}

/** Estudio de evento: puntos y banda; la banda no se une a través de la apertura. */
export function evento(
  puntos: PuntoE[],
  { ancho, banda, etiquetaY, decimales = 3 }: { ancho: number; banda?: number; etiquetaY: string; decimales?: number },
): Plot.PlotOptions {
  const previos = puntos.filter((p) => p.e < 0);
  const posteriores = puntos.filter((p) => p.e >= 0);
  return {
    width: ancho,
    height: Math.max(260, Math.min(380, ancho * 0.5)),
    marginLeft: 56,
    x: { label: "Trimestres desde la primera sucursal", labelAnchor: "center", labelOffset: 34, ticks: 8 },
    y: { label: etiquetaY, labelAnchor: "top", grid: true, nice: true },
    marks: [
      ...(banda ? [Plot.rectY([0], { y1: -banda, y2: banda, fill: AZUL_BANDA })] : []),
      Plot.ruleY([0], { stroke: GRIS, strokeDasharray: "4 3" }),
      Plot.ruleX([-0.5], { stroke: GRIS, strokeDasharray: "1 3" }),
      Plot.areaY(previos, { x: "e", y1: "lo", y2: "hi", fill: AZUL, fillOpacity: 0.14 }),
      Plot.areaY(posteriores, { x: "e", y1: "lo", y2: "hi", fill: AZUL, fillOpacity: 0.14 }),
      Plot.dot(puntos, {
        x: "e",
        y: "att",
        r: 3.5,
        fill: AZUL,
        tip: true,
        title: (d: PuntoE) => `e = ${d.e}\nEfecto: ${num(d.att, decimales)}\nIntervalo: [${num(d.lo, decimales)}, ${num(d.hi, decimales)}]`,
      }),
    ],
  };
}

export interface FilaIntervalo {
  etiqueta: string;
  pct: number;
  lo: number;
  hi: number;
  /** marca hueca: reprueba la pre-prueba o es descriptivo */
  hueco?: boolean;
  /** resalta la fila (la especificación principal) */
  principal?: boolean;
  nota?: string;
}

/** Intervalos horizontales en % de la media previa, con la banda de equivalencia. */
export function intervalos(
  filas: FilaIntervalo[],
  { ancho, umbral, dominio, margenIzq = 230 }: { ancho: number; umbral?: number; dominio?: [number, number]; margenIzq?: number },
): Plot.PlotOptions {
  const orden = filas.map((f) => f.etiqueta);
  const izquierda = Math.min(margenIzq, ancho * 0.45);
  return {
    width: ancho,
    height: 40 + 34 * filas.length,
    marginLeft: izquierda,
    marginRight: 16,
    x: { label: "Efecto, % de la media previa (IC al 90%)", labelAnchor: "center", labelOffset: 32, domain: dominio, clamp: true, grid: true },
    y: { label: null, domain: orden, tickSize: 0 },
    marks: [
      ...(umbral ? [Plot.rectX([0], { x1: -umbral, x2: umbral, fill: AZUL_BANDA })] : []),
      Plot.ruleX([0], { stroke: GRIS, strokeDasharray: "4 3" }),
      Plot.ruleY(filas, { y: "etiqueta", x1: "lo", x2: "hi", stroke: TINTA, strokeWidth: 1.5 }),
      ...[
        { filas: filas.filter((f) => !f.principal && !f.hueco), fill: TINTA, stroke: TINTA, r: 4.5 },
        { filas: filas.filter((f) => !f.principal && f.hueco), fill: "#ffffff", stroke: TINTA, r: 4.5 },
        { filas: filas.filter((f) => f.principal), fill: AZUL, stroke: AZUL, r: 5.5 },
      ].map((grupo) =>
        Plot.dot(grupo.filas, {
          y: "etiqueta",
          x: "pct",
          r: grupo.r,
          fill: grupo.fill,
          stroke: grupo.stroke,
          strokeWidth: 1.5,
          tip: true,
          title: (d: FilaIntervalo) =>
            `${d.etiqueta}\n${pct(d.pct)} [${pct(d.lo)}, ${pct(d.hi)}]${d.nota ? `\n${d.nota}` : ""}`,
        }),
      ),
      // lineWidth va en ems (13 px): las etiquetas largas se parten en dos líneas en vez de cortarse.
      Plot.axisY({ tickSize: 0, lineWidth: (izquierda - 14) / 13, fill: TINTA, fontSize: 13, lineHeight: 1.05 }),
      Plot.frame({ stroke: LINEA, anchor: "bottom" }),
    ],
  };
}
