// Lectura de un efecto con la regla preregistrada: nulo informativo si el IC al 90% cae dentro de
// ±umbral de la media previa; efecto si el IC al 95% excluye el cero; si no, no informativo.

import { intervalo, pct } from "./formato";

export type Lectura = "nulo informativo" | "efecto" | "no informativo";

export interface Estimacion {
  /** efecto en % de la media previa */
  pct: number;
  /** IC al 90% en % de la media previa */
  lo: number;
  hi: number;
  /** p bilateral */
  p: number;
}

export function leer(e: Estimacion, umbral: number): Lectura {
  if (e.lo >= -umbral && e.hi <= umbral) return "nulo informativo";
  if (e.p < 0.05) return "efecto";
  return "no informativo";
}

/** Frase para el usuario; `mayuscula = false` cuando va después de dos puntos. */
export function frase(e: Estimacion, umbral: number, mayuscula = true): string {
  const texto = fraseBase(e, umbral);
  return mayuscula ? texto : texto.charAt(0).toLowerCase() + texto.slice(1);
}

function fraseBase(e: Estimacion, umbral: number): string {
  const ic = intervalo(e.lo, e.hi);
  const cota = Math.max(Math.abs(e.lo), Math.abs(e.hi));
  switch (leer(e, umbral)) {
    case "nulo informativo":
      return `Efecto de ${pct(e.pct)} con intervalo al 90% de ${ic}: cabe dentro de ±${umbral}%, así que se descartan efectos mayores a ${pct(cota).replace("+", "±")}.`;
    case "efecto":
      return `Efecto de ${pct(e.pct)} con intervalo al 90% de ${ic}: distinto de cero.`;
    default:
      return `Efecto de ${pct(e.pct)} con intervalo al 90% de ${ic}: no cabe dentro de ±${umbral}% ni es distinto de cero; los datos no alcanzan para decidir.`;
  }
}
