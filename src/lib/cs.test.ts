// Valida el estimador del laboratorio contra `did` (app/datos/referencia_cs.csv, generado por
// app/datos/referencia_cs.R con la misma muestra que la batería y sin covariables).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { construirMuestra, estimarCS, FILTRO_COMPLETO, type GrupoControl } from "./cs";
import type { MunicipiosArchivo, PanelArchivo, VarPanel } from "./tipos";

const raiz = resolve(__dirname, "../..");
const leer = <T>(ruta: string): T => JSON.parse(readFileSync(resolve(raiz, ruta), "utf8")) as T;
const municipios = leer<MunicipiosArchivo>("public/datos/municipios.json").municipios;
const panel = leer<PanelArchivo>("public/datos/panel.json");

interface FilaRef {
  resultado: string;
  control: string;
  tipo: string;
  g: number;
  t: number;
  e: number;
  id: string;
  att: number;
  se: number;
}

const referencia: FilaRef[] = (() => {
  const [cabecera, ...lineas] = readFileSync(resolve(raiz, "datos/referencia_cs.csv"), "utf8")
    .trim()
    .split("\n");
  const columnas = cabecera.split(",");
  return lineas.map((linea) => {
    const v = linea.split(",");
    const fila = Object.fromEntries(columnas.map((c, j) => [c, v[j]]));
    return {
      resultado: fila.resultado,
      control: fila.control,
      tipo: fila.tipo,
      g: Number(fila.g),
      t: Number(fila.t),
      e: Number(fila.e),
      id: fila.id,
      att: Number(fila.att),
      se: Number(fila.se),
    };
  });
})();

const VARIABLE: Record<string, VarPanel> = {
  sucursales_privado_pc: "privado",
  sucursales_total_pc: "total",
};
const opciones = { tiempos: panel.t, minCohorte: 5, minPre: 2 };
const muestra = construirMuestra(municipios, FILTRO_COMPLETO, opciones);

// El panel se exporta con 6 decimales: las diferencias con R son de redondeo.
const cerca = (a: number, b: number, abs: number, rel: number) =>
  Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));

describe("muestra", () => {
  it("es la misma que leer_panel() en R", () => {
    const ids = referencia
      .filter((f) => f.tipo === "id" && f.resultado === "sucursales_privado_pc" && f.control === "notyettreated")
      .map((f) => f.id)
      .sort();
    const nuestros = muestra.idx.map((i) => municipios[i].c).sort();
    expect(nuestros).toEqual(ids);
  });
});

for (const resultado of Object.keys(VARIABLE)) {
  for (const control of ["notyettreated", "nevertreated"] as GrupoControl[]) {
    describe(`${resultado}, ${control}`, () => {
      const ref = referencia.filter((f) => f.resultado === resultado && f.control === control);
      const r = estimarCS(panel.vars[VARIABLE[resultado]], panel.t.length, muestra, panel.t, control);

      it("reproduce cada ATT(g,t) y su error estándar", () => {
        expect(r).not.toBeNull();
        const attgt = ref.filter((f) => f.tipo === "attgt");
        expect(r!.attgt).toHaveLength(attgt.length);
        for (const f of attgt) {
          const nuestro = r!.attgt.find((a) => a.g === f.g && a.t === f.t);
          expect(nuestro, `ATT(${f.g},${f.t})`).toBeDefined();
          expect(cerca(nuestro!.att, f.att, 2e-5, 1e-4), `ATT(${f.g},${f.t})`).toBe(true);
          expect(cerca(nuestro!.se, f.se, 2e-5, 1e-3), `ee(${f.g},${f.t})`).toBe(true);
        }
      });

      it("reproduce θ global y θ(e)", () => {
        const theta = ref.find((f) => f.tipo === "theta")!;
        expect(cerca(r!.theta.att, theta.att, 1e-5, 1e-4)).toBe(true);
        expect(cerca(r!.theta.se, theta.se, 1e-5, 1e-3)).toBe(true);
        for (const f of ref.filter((x) => x.tipo === "dinamico")) {
          const nuestro = r!.dinamico.find((d) => d.e === f.e);
          expect(nuestro, `θ(${f.e})`).toBeDefined();
          expect(cerca(nuestro!.att, f.att, 2e-5, 1e-4), `θ(${f.e})`).toBe(true);
          expect(cerca(nuestro!.se, f.se, 2e-5, 1e-3), `ee θ(${f.e})`).toBe(true);
        }
      });

      it("reproduce la pre-prueba de la batería", () => {
        const wald = ref.find((f) => f.tipo === "wald_p")!;
        expect(r!.preprueba).not.toBeNull();
        expect(r!.preprueba!.gl).toBe(wald.e);
        expect(cerca(r!.preprueba!.p, wald.att, 1e-3, 1e-2)).toBe(true);
      });
    });
  }
}
