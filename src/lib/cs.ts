// Callaway y Sant'Anna (2021) sin covariables, para el laboratorio de la app.
//
// Replica `did::att_gt(xformla = ~1, est_method = "reg", base_period = "varying",
// bstrap = FALSE)` y `did::aggte(type = "group" | "dynamic")` con errores analíticos sobre la
// función de influencia (cluster = municipio). La muestra sigue las reglas de `leer_panel()`
// (analisis/00_utils.R). `cs.test.ts` lo compara contra `app/datos/referencia_cs.csv`.

import { inversa, pChi2 } from "./estadistica";
import type { Municipio } from "./tipos";

export type GrupoControl = "notyettreated" | "nevertreated";

export interface FiltroMuestra {
  /** claves de estado a conservar; null = todos */
  estados: Set<string> | null;
  desierto: "todos" | "si" | "no";
  /** grados de marginación a conservar; null = todos */
  marginacion: Set<string> | null;
  /** población 2020 mínima y máxima; null = sin límite */
  poblacion: [number, number] | null;
}

export const FILTRO_COMPLETO: FiltroMuestra = {
  estados: null,
  desierto: "todos",
  marginacion: null,
  poblacion: null,
};

export interface Muestra {
  /** índices en municipios.json */
  idx: number[];
  /** cohorte de cada unidad de la muestra (0 = sin sucursal en la ventana) */
  G: number[];
  cohortes: { g: number; n: number }[];
  nunca: number;
  /** cohortes que salen por tener menos de `minCohorte` municipios */
  cohortesChicas: { g: number; n: number }[];
}

export interface Opciones {
  /** índices de tiempo de la ventana (2019T1 = 1 … 2024T4 = 24) */
  tiempos: number[];
  minCohorte: number;
  minPre: number;
}

/** Muestra de estimación con las reglas de la batería: sin ya tratados, sin fechas dudosas de
 * Banjército, aperturas posteriores a la ventana como no tratadas, cohortes con al menos `minPre`
 * periodos previos y al menos `minCohorte` municipios (contados después de los filtros). */
export function construirMuestra(
  municipios: Municipio[],
  filtro: FiltroMuestra,
  opciones: Opciones,
): Muestra {
  const ultimo = Math.max(...opciones.tiempos);
  const candidatos: { i: number; G: number }[] = [];
  municipios.forEach((m, i) => {
    if (m.ya || m.sos) return;
    if (filtro.estados && !filtro.estados.has(m.e)) return;
    if (filtro.desierto === "si" && !m.des) return;
    if (filtro.desierto === "no" && m.des) return;
    if (filtro.marginacion && (m.mg === null || !filtro.marginacion.has(m.mg))) return;
    if (filtro.poblacion) {
      if (m.pob === null || m.pob < filtro.poblacion[0] || m.pob > filtro.poblacion[1]) return;
    }
    const G = m.G > ultimo ? 0 : m.G;
    const previos = opciones.tiempos.filter((t) => t < G).length;
    if (G > 0 && previos < opciones.minPre) return;
    candidatos.push({ i, G });
  });
  const tam = new Map<number, number>();
  for (const c of candidatos) if (c.G > 0) tam.set(c.G, (tam.get(c.G) ?? 0) + 1);
  const chicas = [...tam].filter(([, n]) => n < opciones.minCohorte).map(([g, n]) => ({ g, n }));
  const finales = candidatos.filter((c) => c.G === 0 || (tam.get(c.G) ?? 0) >= opciones.minCohorte);
  const cohortes = [...tam]
    .filter(([, n]) => n >= opciones.minCohorte)
    .map(([g, n]) => ({ g, n }))
    .sort((a, b) => a.g - b.g);
  return {
    idx: finales.map((c) => c.i),
    G: finales.map((c) => c.G),
    cohortes,
    nunca: finales.filter((c) => c.G === 0).length,
    cohortesChicas: chicas.sort((a, b) => a.g - b.g),
  };
}

export interface ATTgt {
  g: number;
  t: number;
  att: number;
  se: number;
  nTratadas: number;
  nControles: number;
}

export interface Agregado {
  att: number;
  se: number;
}

export interface ResultadoCS {
  attgt: ATTgt[];
  theta: Agregado;
  dinamico: ({ e: number } & Agregado)[];
  /** θ(g): promedio de los ATT(g,t) posteriores de cada cohorte */
  porCohorte: ({ g: number; n: number } & Agregado)[];
  /** Wald conjunta de θ(e) = 0 para todos los e < 0, como `prueba_previa()` de la batería */
  preprueba: { estadistico: number; gl: number; p: number } | null;
  /** media de Y de las tratadas en el trimestre previo a su apertura */
  mediaPrevia: number;
  n: number;
}

/** Estima ATT(g,t) y sus agregados. `y[i * T + k]` es el resultado del municipio i en el
 * trimestre k de `tiempos`; las unidades con algún dato faltante en la ventana salen. */
export function estimarCS(
  y: ArrayLike<number | null>,
  T: number,
  muestra: Muestra,
  tiempos: number[],
  control: GrupoControl,
): ResultadoCS | null {
  // Panel balanceado: fuera las unidades con huecos (lo mismo que hace `did`).
  const filas: { i: number; G: number }[] = [];
  muestra.idx.forEach((i, j) => {
    for (let k = 0; k < tiempos.length; k++) {
      const v = y[i * T + k];
      if (v === null || v === undefined || !Number.isFinite(v)) return;
    }
    filas.push({ i, G: muestra.G[j] });
  });
  const n = filas.length;
  const grupos = [...new Set(filas.map((f) => f.G).filter((g) => g > 0))].sort((a, b) => a - b);
  if (n === 0 || grupos.length === 0) return null;
  const Y = (f: number, k: number) => y[filas[f].i * T + k] as number;
  const pos = new Map(tiempos.map((t, k) => [t, k]));

  const attgt: ATTgt[] = [];
  const infl: Float64Array[] = [];
  for (const g of grupos) {
    const kBaseGrupo = pos.get(g - 1);
    for (let k = 1; k < tiempos.length; k++) {
      const t = tiempos[k];
      const kBase = t >= g ? kBaseGrupo : k - 1;
      if (kBase === undefined) continue;
      let s1 = 0;
      let n1 = 0;
      let s0 = 0;
      let n0 = 0;
      const tipo = new Int8Array(n);
      for (let f = 0; f < n; f++) {
        const G = filas[f].G;
        if (G === g) {
          tipo[f] = 1;
          s1 += Y(f, k) - Y(f, kBase);
          n1++;
        } else if (control === "nevertreated" ? G === 0 : G === 0 || (G > t && G !== g)) {
          tipo[f] = -1;
          s0 += Y(f, k) - Y(f, kBase);
          n0++;
        }
      }
      if (n1 === 0 || n0 === 0) continue;
      const m1 = s1 / n1;
      const m0 = s0 / n0;
      const fi = new Float64Array(n);
      let ss = 0;
      for (let f = 0; f < n; f++) {
        if (tipo[f] === 0) continue;
        const d = Y(f, k) - Y(f, kBase);
        fi[f] = tipo[f] === 1 ? (n / n1) * (d - m1) : -(n / n0) * (d - m0);
        ss += fi[f] * fi[f];
      }
      attgt.push({ g, t, att: m1 - m0, se: Math.sqrt(ss) / n, nTratadas: n1, nControles: n0 });
      infl.push(fi);
    }
  }

  // P(G = g) sobre todas las unidades de la muestra, como `did::aggte`.
  const pg = new Map(grupos.map((g) => [g, filas.filter((f) => f.G === g).length / n]));
  const indicadora = new Map(
    grupos.map((g) => [g, Float64Array.from(filas, (f) => (f.G === g ? 1 : 0))]),
  );

  /** Agrega con pesos ∝ P(G = g) e incluye el efecto de estimar los pesos (`did:::wif`). */
  const agregar = (entradas: { att: number; inf: Float64Array; g: number }[]) => {
    const pesos = entradas.map((x) => pg.get(x.g) as number);
    const suma = pesos.reduce((a, b) => a + b, 0);
    const att = entradas.reduce((a, x, j) => a + (x.att * pesos[j]) / suma, 0);
    const inf = new Float64Array(n);
    for (let f = 0; f < n; f++) {
      let lineal = 0;
      let numerador = 0;
      let totalDesvio = 0;
      for (let j = 0; j < entradas.length; j++) {
        const x = entradas[j];
        lineal += (x.inf[f] * pesos[j]) / suma;
        const desvio = (indicadora.get(x.g) as Float64Array)[f] - pesos[j];
        numerador += (desvio / suma) * x.att;
        totalDesvio += desvio;
      }
      let denominador = 0;
      for (let j = 0; j < entradas.length; j++) {
        denominador += ((totalDesvio * pesos[j]) / (suma * suma)) * entradas[j].att;
      }
      inf[f] = lineal + numerador - denominador;
    }
    let ss = 0;
    for (let f = 0; f < n; f++) ss += inf[f] * inf[f];
    return { att, se: Math.sqrt(ss) / n, inf };
  };

  // θ(g) y θ global (agregación por cohorte, `type = "group"`).
  const porCohorte: ({ g: number; n: number; inf: Float64Array } & Agregado)[] = [];
  for (const g of grupos) {
    const post = attgt.map((a, j) => ({ a, j })).filter(({ a }) => a.g === g && a.t >= g);
    if (post.length === 0) continue;
    const inf = new Float64Array(n);
    let att = 0;
    for (const { a, j } of post) {
      att += a.att / post.length;
      for (let f = 0; f < n; f++) inf[f] += infl[j][f] / post.length;
    }
    let ss = 0;
    for (let f = 0; f < n; f++) ss += inf[f] * inf[f];
    porCohorte.push({ g, n: Math.round((pg.get(g) as number) * n), att, se: Math.sqrt(ss) / n, inf });
  }
  const theta = agregar(porCohorte.map((c) => ({ att: c.att, inf: c.inf, g: c.g })));

  // θ(e), `type = "dynamic"`.
  const eventos = [...new Set(attgt.map((a) => a.t - a.g))].sort((a, b) => a - b);
  const dinamico = eventos.map((e) => {
    const entradas = attgt
      .map((a, j) => ({ a, j }))
      .filter(({ a }) => a.t - a.g === e)
      .map(({ a, j }) => ({ att: a.att, inf: infl[j], g: a.g }));
    return { e, ...agregar(entradas) };
  });

  // Pre-prueba: Wald con la covarianza de las funciones de influencia (cluster = municipio).
  const previos = dinamico.filter((d) => d.e < 0 && Number.isFinite(d.se) && d.se > 0);
  let preprueba: ResultadoCS["preprueba"] = null;
  if (previos.length > 0) {
    const V = previos.map((a) =>
      previos.map((b) => {
        let s = 0;
        for (let f = 0; f < n; f++) s += a.inf[f] * b.inf[f];
        return s / (n * n);
      }),
    );
    const Vi = inversa(V);
    if (Vi) {
      const th = previos.map((d) => d.att);
      let w = 0;
      for (let a = 0; a < th.length; a++) for (let b = 0; b < th.length; b++) w += th[a] * Vi[a][b] * th[b];
      preprueba = { estadistico: w, gl: th.length, p: pChi2(w, th.length) };
    }
  }

  // Media previa de las tratadas: Y en g − 1 de cada unidad tratada.
  let sumaPrevia = 0;
  let nPrevia = 0;
  for (let f = 0; f < n; f++) {
    const k = pos.get(filas[f].G - 1);
    if (filas[f].G > 0 && k !== undefined) {
      sumaPrevia += Y(f, k);
      nPrevia++;
    }
  }

  return {
    attgt,
    theta: { att: theta.att, se: theta.se },
    dinamico: dinamico.map(({ e, att, se }) => ({ e, att, se })),
    porCohorte: porCohorte.map(({ g, n: nc, att, se }) => ({ g, n: nc, att, se })),
    preprueba,
    mediaPrevia: nPrevia > 0 ? sumaPrevia / nPrevia : NaN,
    n,
  };
}
