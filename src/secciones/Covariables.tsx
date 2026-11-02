import * as Plot from "@observablehq/plot";
import { useCallback } from "react";
import { AZUL, GRIS, Grafica, LINEA } from "../componentes/Grafica";
import { intervalo, num, p, pct, trimestre } from "../lib/formato";
import type { Datos } from "../lib/tipos";

// Qué se ajusta, si los grupos se parecen después de ajustar, y qué pasa con otro diseño de
// comparación (emparejamiento). Va dentro de "Cómo se hizo".

const COVARIABLES = [
  ["Población de 2020 (logaritmo)", "El banco llegó antes a los municipios más poblados."],
  ["Índice de marginación de 2020 (CONAPO)", "Los tratados son menos marginados que los que nunca abren."],
  ["Banca múltiple en 2019", "Donde ya había bancos la banca privada sigue otra trayectoria."],
];

const NOMBRE_COVARIABLE: Record<string, string> = {
  log_poblacion_2020: "población",
  indice_marginacion_2020: "marginación",
  banca_mun_2019: "banca en 2019",
};

export function Covariables({ datos }: { datos: Datos }) {
  const { descriptivas, grupos, cohortes, emparejados } = datos.covariables;
  const yaTratados = grupos.find((g) => g.grupo === "ya tratado al inicio")?.unidades;
  const efecto = (clave: string) => datos.efectos.find((e) => e.clave === clave)!.cabecera;

  const opcionesBalance = useCallback(
    (ancho: number): Plot.PlotOptions => {
      const filas = cohortes.map((c) => ({ ...c, nombre: trimestre(c.g) }));
      const largas = filas.flatMap((c) => [
        { nombre: c.nombre, v: c.bruta, cual: "Antes de reponderar" },
        { nombre: c.nombre, v: c.ponderada, cual: "Después de reponderar" },
      ]);
      return {
        width: ancho,
        height: 260,
        marginLeft: 70,
        y: { label: null, domain: filas.map((f) => f.nombre) },
        x: { label: "Mayor diferencia estandarizada entre tratadas y controles", labelAnchor: "center", labelOffset: 32, grid: true, domain: [0, 1.6] },
        marks: [
          Plot.ruleX([0.1], { stroke: GRIS, strokeDasharray: "4 3" }),
          Plot.ruleX([0.25], { stroke: GRIS, strokeDasharray: "1 3" }),
          Plot.ruleY(filas, { y: "nombre", x1: "ponderada", x2: "bruta", stroke: LINEA, strokeWidth: 3 }),
          Plot.dot(largas, {
            y: "nombre",
            x: "v",
            r: 4.5,
            fill: (d) => (d.cual === "Antes de reponderar" ? "#ffffff" : AZUL),
            stroke: AZUL,
            strokeWidth: 1.5,
          }),
          Plot.tip(
            filas,
            Plot.pointerY({
              y: "nombre",
              x: "bruta",
              title: (d) =>
                `Abren en ${d.nombre}: ${num(d.tratadas)} tratadas\nAntes ${num(d.bruta, 2)}, después ${num(d.ponderada, 2)}\nPeor covariable: ${NOMBRE_COVARIABLE[d.peor] ?? d.peor}\nAUC del puntaje: ${num(d.auc, 2)}`,
            }),
          ),
        ],
      };
    },
    [cohortes],
  );

  const desbalanceadas = cohortes.filter((c) => c.ponderada > 0.2).map((c) => trimestre(c.g));

  return (
    <div>
      <h3 style={{ marginBottom: "0.8rem" }}>Qué se ajusta y por qué</h3>
      <div className="rejilla">
        <div>
          <ul className="pasos">
            {COVARIABLES.map(([nombre, por]) => (
              <li key={nombre}>
                <b>{nombre}.</b> {por}
              </li>
            ))}
          </ul>
          <p className="prosa" style={{ marginTop: "1rem" }}>
            El estimador doblemente robusto combina un puntaje de propensión con estas tres variables y
            una regresión del cambio en el resultado. Basta con que uno de los dos modelos sea correcto.
          </p>
        </div>
        <figure>
          <Grafica opciones={opcionesBalance} descripcion="Balance de covariables por cohorte antes y después de reponderar" />
          <figcaption>
            Hueco: antes de reponderar; azul: después. Líneas en 0.1 y 0.25, los umbrales usuales.
            {desbalanceadas.length > 0 &&
              ` Las cohortes de ${desbalanceadas.join(" y ")} siguen desbalanceadas; sin ellas el resultado no cambia.`}
          </figcaption>
        </figure>
      </div>

      <h3 style={{ margin: "2.5rem 0 0.8rem" }}>Quiénes abren y quiénes no, antes de abrir</h3>
      <div className="tabla tabla--cifras">
        <table>
          <thead>
            <tr>
              <th scope="col">En 2019T1</th>
              <th scope="col" className="num">
                Abren en 2019–2024
              </th>
              <th scope="col" className="num">
                Sin sucursal a 2024
              </th>
              <th scope="col" className="num">
                Diferencia estandarizada
              </th>
            </tr>
          </thead>
          <tbody>
            {descriptivas.filas.map((f) => (
              <tr key={f.nombre}>
                <td>{f.nombre}</td>
                <td className="num">
                  {num(f.t, f.d)} <span className="de">({num(f.t_de, f.d)})</span>
                </td>
                <td className="num">
                  {num(f.c, f.d)} <span className="de">({num(f.c_de, f.d)})</span>
                </td>
                <td className="num">{num(f.dif, 2)}</td>
              </tr>
            ))}
            <tr>
              <td>Municipios</td>
              <td className="num">{num(descriptivas.tratadas)}</td>
              <td className="num">{num(descriptivas.controles)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="nota" style={{ marginTop: "0.5rem" }}>
        Media (desviación estándar) de la muestra de la estimación. Los que abren son más grandes y ya
        tenían más banca: por eso se ajusta.
        {yaTratados !== undefined && ` Fuera quedan los ${num(yaTratados)} municipios que ya tenían sucursal en 2019.`}
      </p>

      <div className="prosa" style={{ marginTop: "1.5rem" }}>
        <p>
          <b>Tendencias previas.</b> Antes de abrir, la pre-prueba conjunta da p = {p(efecto("privado").wald_p)} en
          sucursales privadas, {p(efecto("bm").wald_p)} en banca múltiple y {p(efecto("eacp").wald_p)} en EACP.
        </p>
        <p>
          <b>Emparejamiento.</b> Comparar cada tratado con un municipio que nunca abrió, emparejado por
          puntaje de propensión dentro de su región ({num(emparejados.tratadas)} contra{" "}
          {num(emparejados.controles)}), da {pct(emparejados.pct)} {intervalo(emparejados.lo, emparejados.hi)}:
          la misma conclusión con otra forma de construir el contrafactual.
        </p>
      </div>
    </div>
  );
}
