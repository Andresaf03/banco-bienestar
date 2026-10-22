// Estructura de los JSON de `public/datos/` (los escribe `app/datos/exportar.py`).

export interface Municipio {
  /** clave INEGI de 5 dígitos */
  c: string;
  n: string | null;
  /** clave del estado */
  e: string;
  /** trimestre de la primera sucursal (2019T1 = 1; 0 = nunca hasta 2025T4) */
  G: number;
  pob: number | null;
  /** grado de marginación 2020 (CONAPO) */
  mg: string | null;
  im: number | null;
  /** sin banca múltiple en 2019 */
  des: boolean;
  /** ya tenía sucursal en 2019T1 (sale de la estimación) */
  ya: boolean;
  /** fecha que podría ser de Banjército (sale de la estimación) */
  sos: boolean;
}

export interface MunicipiosArchivo {
  estados: Record<string, string>;
  /** polígono del Marco Geoestadístico → clave del panel (municipios nuevos) */
  poligonos: Record<string, string>;
  municipios: Municipio[];
}

export type VarPanel = "privado" | "bm" | "eacp" | "total";

export interface PanelArchivo {
  t: number[];
  periodos: string[];
  /** vars[v][i * T + k]: municipio i (orden de municipios.json), trimestre k */
  vars: Record<VarPanel, (number | null)[]>;
}

export interface SucursalesArchivo {
  t: number[];
  periodos: string[];
  n: (number | null)[];
}

export interface PuntoEvento {
  e: number;
  att: number;
  ee: number;
  lo: number;
  hi: number;
}

export interface Cabecera {
  att: number;
  ee: number;
  ic90: [number, number];
  media: number;
  pct: number;
  cota: number;
  mde80: number;
  p: number;
  p_rw: number | null;
  wald_p: number;
  nulo: boolean;
  tratadas: number;
  controles: number;
}

export type Estimador = "cs" | "apilado" | "twfe";

export interface Efecto {
  clave: string;
  nombre: string;
  grupo: string;
  detalle: string;
  unidad: string;
  cabecera: Cabecera;
  apilado: { pct: number; cota: number; wald_p: number } | null;
  evento: Partial<Record<Estimador, PuntoEvento[]>>;
  cohortes: { g: number; att: number; ee: number; lo: number; hi: number }[];
  honest: { m: number; lo: number; hi: number }[] | null;
}

export interface Intervalo {
  pct: number;
  lo: number;
  hi: number;
}

export interface Robustez {
  estimadores: ({ r: string; est: string } & Intervalo)[];
  permutacion: { observado: number; p: number; n: number; distribucion: number[] };
  sin_estado: ({ e: string } & Intervalo)[];
  placebo: Intervalo & { wald_p: number };
  vecinos: Intervalo & { tratadas: number; controles: number };
  controles: ({ r: string; v: string; tratadas: number; controles: number } & Intervalo)[];
  honest_sd: { m: number; lo: number; hi: number }[];
}

export interface Heterogeneidad extends Intervalo {
  r: string;
  dim: "desierto_bancario" | "grado_marginacion_2020" | "tamano_localidad";
  grupo: string;
  tratadas: number;
  unidades: number;
  p_dif: number | null;
}

export interface Extension extends Intervalo {
  nombre: string;
  fuente: string;
  lectura: "nulo informativo" | "no informativo" | "reprueba la pre-prueba" | "efecto";
  nota: string | null;
}

export interface Resumen {
  sucursales_2019: number;
  sucursales_2024: number;
  municipios: number;
  sin_bm_2019: number;
  tarjetas_bb: number;
  tarjetas_bb_ee: number;
  /** transacciones por tarjeta y trimestre en los cajeros del banco (mediana, e = 1…11) */
  transacciones_por_tarjeta: number;
  sesoi: number;
  min_cohorte: number;
}

export interface Datos {
  municipios: MunicipiosArchivo;
  panel: PanelArchivo;
  sucursales: SucursalesArchivo;
  efectos: Efecto[];
  robustez: Robustez;
  heterogeneidad: Heterogeneidad[];
  extensiones: Extension[];
  resumen: Resumen;
}
