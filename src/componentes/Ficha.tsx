import * as Plot from "@observablehq/plot";
import { useCallback, useMemo } from "react";
import { construirMuestra, FILTRO_COMPLETO } from "../lib/cs";
import { num, trimestre } from "../lib/formato";
import type { Datos } from "../lib/tipos";
import { AZUL, Grafica, TINTA } from "./Grafica";

// Ficha de un municipio: cuándo abrió el banco, si entra en la estimación y cómo se movieron sus
// sucursales privadas alrededor de la apertura.

function apertura(G: number, ya: boolean): string {
  if (ya || G === 1) return "Ya tenía sucursal en 2019 (heredada de Bansefi)";
  if (G === 0) return "Sin sucursal del banco hasta 2025T4";
  return `Primera sucursal en ${trimestre(G)}`;
}

function enMuestra(G: number, ya: boolean, sos: boolean, dentro: boolean): string {
  if (ya || G === 1) return "No: ya estaba tratado al empezar el panel";
  if (sos) return "No: la fecha podría ser de una sucursal de Banjército";
  if (G === 0 || G > 24) return "Sí, como control (sin sucursal en 2019–2024)";
  if (!dentro && G === 2) return "No: abrió sin dos trimestres previos para comparar";
  if (!dentro) return "No: su cohorte de apertura tiene menos de cinco municipios";
  return "Sí, como tratado";
}

const EJE_X = {
  label: null,
  domain: [1, 28],
  ticks: [1, 9, 17, 25],
  tickFormat: (t: number) => String(2019 + (t - 1) / 4),
};

export function Ficha({ datos, idx }: { datos: Datos; idx: number | null }) {
  const T = datos.panel.t.length;
  // Muestra de la estimación principal, con las mismas reglas que el laboratorio y la batería.
  const muestra = useMemo(
    () =>
      new Set(
        construirMuestra(datos.municipios.municipios, FILTRO_COMPLETO, {
          tiempos: datos.panel.t,
          minCohorte: datos.resumen.min_cohorte,
          minPre: 2,
        }).idx,
      ),
    [datos],
  );
  const Ts = datos.sucursales.t.length;

  const privadas = useCallback(
    (ancho: number): Plot.PlotOptions => {
      if (idx === null) return {};
      const m = datos.municipios.municipios[idx];
      const serie = datos.panel.t
        .map((t, k) => ({ t, v: datos.panel.vars.privado[idx * T + k] }))
        .filter((d): d is { t: number; v: number } => d.v !== null);
      return {
        width: ancho,
        height: 170,
        marginLeft: 44,
        x: EJE_X,
        // Rango mínimo: un municipio sin sucursales privadas no debe dar un eje degenerado.
        y: {
          label: "Sucursales privadas por 10 mil adultos",
          labelAnchor: "top",
          grid: true,
          domain: [0, Math.max(0.5, 1.15 * Math.max(...serie.map((d) => d.v)))],
        },
        marks: [
          ...(m.G > 1 && m.G <= 28 ? [Plot.ruleX([m.G - 0.5], { stroke: AZUL, strokeDasharray: "3 3" })] : []),
          Plot.lineY(serie, { x: "t", y: "v", stroke: TINTA, strokeWidth: 1.6 }),
          Plot.dot(serie, { x: "t", y: "v", r: 2, fill: TINTA, tip: true, title: (d) => `${trimestre(d.t)}: ${num(d.v, 2)}` }),
        ],
      };
    },
    [datos, idx, T],
  );

  const banco = useCallback(
    (ancho: number): Plot.PlotOptions => {
      if (idx === null) return {};
      const serie = datos.sucursales.t
        .map((t, k) => ({ t, v: datos.sucursales.n[idx * Ts + k] }))
        .filter((d): d is { t: number; v: number } => d.v !== null);
      return {
        width: ancho,
        height: 110,
        marginLeft: 44,
        x: EJE_X,
        y: {
          label: "Sucursales del banco",
          labelAnchor: "top",
          grid: true,
          nice: true,
          zero: true,
          ticks: 3,
          tickFormat: (v: number) => (Number.isInteger(v) ? String(v) : ""),
        },
        marks: [
          Plot.areaY(serie, { x: "t", y: "v", fill: AZUL, fillOpacity: 0.12, curve: "step-after" }),
          Plot.lineY(serie, { x: "t", y: "v", stroke: AZUL, strokeWidth: 1.6, curve: "step-after", tip: true, title: (d) => `${trimestre(d.t)}: ${d.v}` }),
        ],
      };
    },
    [datos, idx, Ts],
  );

  if (idx === null) {
    return (
      <aside className="ficha">
        <p className="vacio">
          Haz clic en un municipio, o búscalo, para ver cuándo llegó el banco y qué pasó con sus
          sucursales privadas.
        </p>
      </aside>
    );
  }

  const m = datos.municipios.municipios[idx];
  return (
    <aside className="ficha" aria-live="polite">
      <h3>{m.n ?? m.c}</h3>
      <p className="ficha__estado">{datos.municipios.estados[m.e]}</p>
      <dl>
        <dt>Banco del Bienestar</dt>
        <dd>{apertura(m.G, m.ya)}</dd>
        <dt>En la estimación</dt>
        <dd>{enMuestra(m.G, m.ya, m.sos, muestra.has(idx))}</dd>
        <dt>Población 2020</dt>
        <dd>{m.pob === null ? "—" : num(m.pob)}</dd>
        <dt>Marginación 2020</dt>
        <dd>{m.mg ?? "—"}</dd>
        <dt>Banca múltiple 2019</dt>
        <dd>{m.des ? "No tenía" : "Sí tenía"}</dd>
      </dl>
      <Grafica opciones={privadas} descripcion="Sucursales privadas por 10 mil adultos del municipio, 2019–2024" />
      <Grafica opciones={banco} descripcion="Sucursales del Banco del Bienestar en el municipio, 2019–2025" />
      <p className="nota" style={{ marginTop: "0.4rem" }}>
        La línea punteada marca la primera sucursal. Las privadas llegan a 2024T4; el banco, a 2025T4.
      </p>
    </aside>
  );
}
