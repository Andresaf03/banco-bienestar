// Formato de números y periodos en español de México, con signo menos tipográfico.

const MENOS = "−";

export function num(v: number, decimales = 0): string {
  if (!Number.isFinite(v)) return "—";
  return v
    .toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    .replace("-", MENOS);
}

/** Porcentaje con signo: +0.7%, −0.2%. */
export function pct(v: number, decimales = 1): string {
  if (!Number.isFinite(v)) return "—";
  const s = num(Math.abs(v), decimales);
  if (Number(s.replace(/,/g, "")) === 0) return `${s}%`;
  return `${v < 0 ? MENOS : "+"}${s}%`;
}

/** Intervalo en porcentaje: [−1.0%, +2.4%]. */
export function intervalo(lo: number, hi: number, decimales = 1): string {
  return `[${pct(lo, decimales)}, ${pct(hi, decimales)}]`;
}

export function p(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v < 0.001 ? "< 0.001" : num(v, v < 0.1 ? 3 : 2);
}

/** Índice de trimestre (2019T1 = 1) → "2023T2". */
export function trimestre(t: number): string {
  const k = t - 1;
  const anio = 2019 + Math.floor(k / 4);
  return `${anio}T${(((k % 4) + 4) % 4) + 1}`;
}
