import * as Plot from "@observablehq/plot";
import { useCallback, useState } from "react";
import { Segmentado } from "../componentes/Controles";
import { AZUL, GRIS, Grafica, LINEA } from "../componentes/Grafica";
import { intervalo, num, p, pct } from "../lib/formato";
import { intervalos } from "../lib/graficas";
import type { Datos } from "../lib/tipos";

type Sector = "privado" | "bm" | "eacp";

const SECTOR: Record<Sector, string> = {
  privado: "Sucursales privadas",
  bm: "Banca múltiple",
  eacp: "EACP",
};

const ESTIMADORES: Record<string, string> = {
  "Callaway y Sant'Anna": "Callaway y Sant'Anna (principal)",
  "TWFE estudio de evento (promedio e = 0…8)": "Estudio de evento con efectos fijos",
  "TWFE estático": "Efectos fijos, un solo coeficiente",
  "Sun y Abraham": "Sun y Abraham",
  "Borusyak et al.": "Imputación (Borusyak et al.)",
  "DiD apilado, id^pila + e": "DiD apilado",
  "DiD apilado, id^pila + e^cve_ent^pila": "DiD apilado, efectos fijos de estado",
  "TWFE extendido (Wooldridge) sin covariables": "TWFE extendido sin covariables",
  "TWFE extendido, solo pendientes de trimestre (versión del preregistro)": "TWFE extendido, versión preregistrada",
  "TWFE extendido (Wooldridge)": "TWFE extendido con covariables",
  "TWFE extendido con covariables, solo municipios que abren": "TWFE extendido con covariables, solo los que abren",
};

const CONTROLES: Record<string, string> = {
  "base (aún no tratados, covariables base)": "Principal: aún no tratados, con covariables",
  "H1c solo municipios que alguna vez abren": "Solo municipios que alguna vez abren",
  "H1d nunca tratados emparejados (PS 1:1, región)": "Nunca tratados emparejados",
  "H1e apilado, controles sin vecino con apertura nueva": "Controles sin vecino que abre",
  "H2 ninguna": "Sin covariables",
  "H2 población": "Solo población",
  "H2 + marginación": "Población y marginación",
  "H2 + tendencia previa": "Más tendencia previa",
  "H2 + distancia a la banca": "Más distancia a la banca",
  "H2 + región": "Más región",
};

/** Etiqueta y orden de cada grupo de heterogeneidad. */
const GRUPOS: Record<string, [string, number]> = {
  "Con banca múltiple en 2019": ["Con banca múltiple en 2019", 1],
  "Sin banca múltiple en 2019": ["Sin banca múltiple en 2019", 2],
  "baja marginación": ["Marginación baja", 3],
  "marginación media": ["Marginación media", 4],
  "alta marginación": ["Marginación alta", 5],
  chica: ["Localidad chica", 6],
  mediana: ["Localidad mediana", 7],
  grande: ["Localidad grande", 8],
};

export function Pruebas({ datos }: { datos: Datos }) {
  const [sector, setSector] = useState<Sector>("privado");
  const { robustez, heterogeneidad, municipios } = datos;
  const umbral = datos.resumen.sesoi;
  const media = datos.efectos.find((e) => e.clave === "privado")!.cabecera.media;

  const opcionesEstimadores = useCallback(
    (ancho: number) =>
      intervalos(
        robustez.estimadores
          .filter((x) => x.r === sector && ESTIMADORES[x.est])
          .map((x) => ({
            etiqueta: ESTIMADORES[x.est],
            pct: x.pct,
            lo: x.lo,
            hi: x.hi,
            principal: x.est === "Callaway y Sant'Anna",
          })),
        { ancho, umbral, dominio: [-12, 18], margenIzq: 290 },
      ),
    [robustez, sector, umbral],
  );

  const opcionesControles = useCallback(
    (ancho: number) =>
      intervalos(
        robustez.controles
          .filter((x) => x.r === sector && CONTROLES[x.v])
          .map((x) => ({
            etiqueta: CONTROLES[x.v],
            pct: x.pct,
            lo: x.lo,
            hi: x.hi,
            principal: x.v.startsWith("base"),
            nota: `${num(x.tratadas)} tratados y ${num(x.controles)} controles`,
          })),
        { ancho, umbral, dominio: [-12, 18], margenIzq: 290 },
      ),
    [robustez, sector, umbral],
  );

  const opcionesHeterogeneidad = useCallback(
    (ancho: number) =>
      intervalos(
        heterogeneidad
          .filter((x) => x.r === sector)
          .sort((a, b) => (GRUPOS[a.grupo]?.[1] ?? 99) - (GRUPOS[b.grupo]?.[1] ?? 99))
          .map((x) => ({
            etiqueta: GRUPOS[x.grupo]?.[0] ?? x.grupo,
            pct: x.pct,
            lo: x.lo,
            hi: x.hi,
            nota: `${num(x.tratadas)} tratados${x.p_dif !== null ? `; diferencia con el grupo de referencia p = ${p(x.p_dif)}` : ""}`,
          })),
        { ancho, umbral, dominio: [-20, 25], margenIzq: 250 },
      ),
    [heterogeneidad, sector, umbral],
  );

  const opcionesPermutacion = useCallback(
    (ancho: number): Plot.PlotOptions => {
      const valores = robustez.permutacion.distribucion.map((v) => (100 * v) / media);
      const observado = (100 * robustez.permutacion.observado) / media;
      return {
        width: ancho,
        height: 230,
        marginLeft: 40,
        x: { label: "Efecto con fechas al azar, % de la media previa", labelAnchor: "center", labelOffset: 32 },
        y: { label: "Asignaciones", labelAnchor: "top", grid: true },
        marks: [
          Plot.rectY(valores, { ...Plot.binX({ y: "count" }, { x: (d: number) => d, thresholds: 24 }), fill: "#c9d3e3", inset: 0.5 }),
          Plot.ruleX([observado], { stroke: AZUL, strokeWidth: 2 }),
          Plot.text([observado], { x: (d: number) => d, frameAnchor: "top", dx: 6, textAnchor: "start", text: () => "Observado", fill: AZUL }),
          Plot.ruleY([0], { stroke: LINEA }),
        ],
      };
    },
    [robustez, media],
  );

  const opcionesEstados = useCallback(
    (ancho: number): Plot.PlotOptions => {
      const filas = [...robustez.sin_estado]
        .sort((a, b) => a.pct - b.pct)
        .map((x) => ({ ...x, nombre: municipios.estados[x.e] ?? x.e }));
      return {
        width: ancho,
        height: 230,
        marginLeft: 40,
        x: { axis: null, domain: filas.map((f) => f.nombre), padding: 0.4 },
        y: { label: "% de la media previa", labelAnchor: "top", grid: true, domain: [-umbral - 1, umbral + 1] },
        marks: [
          Plot.rectY([0], { y1: -umbral, y2: umbral, fill: "#e3ecff" }),
          Plot.ruleY([0], { stroke: GRIS, strokeDasharray: "4 3" }),
          Plot.ruleX(filas, { x: "nombre", y1: "lo", y2: "hi", stroke: "#000", strokeWidth: 1.2 }),
          Plot.dot(filas, {
            x: "nombre",
            y: "pct",
            r: 3,
            fill: "#000",
            tip: true,
            title: (d) => `Sin ${d.nombre}\n${pct(d.pct)} ${intervalo(d.lo, d.hi)}`,
          }),
        ],
      };
    },
    [robustez, municipios, umbral],
  );

  const { placebo, vecinos } = robustez;
  return (
    <section className="seccion" id="pruebas" aria-labelledby="titulo-pruebas">
      <header>
        <h2 id="titulo-pruebas">¿Aguanta?</h2>
        <p>
          Un nulo solo convence si no depende de una elección arbitraria. Aquí está el mismo resultado
          con otros estimadores, otros grupos de control, fechas inventadas y quitando un estado a la
          vez. La franja es el umbral de ±{num(umbral)}%.
        </p>
      </header>

      <div className="controles">
        <Segmentado
          etiqueta="Resultado"
          valor={sector}
          onCambio={setSector}
          opciones={(Object.keys(SECTOR) as Sector[]).map((s) => ({ valor: s, texto: SECTOR[s] }))}
        />
      </div>

      <div className="rejilla">
        <figure>
          <h3>Otros estimadores</h3>
          <p className="nota">
            Casi todos caen dentro del umbral. La excepción es el TWFE extendido con covariables, que
            vuelve al rango cuando se limita a los municipios que alguna vez abren.
          </p>
          <Grafica opciones={opcionesEstimadores} descripcion="Efecto con distintos estimadores" />
        </figure>
        <figure>
          <h3>Otros grupos de control y covariables</h3>
          <p className="nota">Cambiar con quién se compara, o con qué se ajusta, no mueve el resultado.</p>
          <Grafica opciones={opcionesControles} descripcion="Efecto con distintos controles y covariables" />
        </figure>
        <figure>
          <h3>Fechas al azar</h3>
          <p className="nota">
            Se reasignan las fechas de apertura al azar dentro de cada estado {num(robustez.permutacion.n)}{" "}
            veces. El efecto observado es común entre esos placebos: p = {p(robustez.permutacion.p)}.
          </p>
          <Grafica opciones={opcionesPermutacion} descripcion="Distribución del efecto con fechas al azar" />
        </figure>
        <figure>
          <h3>Sin un estado a la vez</h3>
          <p className="nota">
            Quitar cualquier estado deja el efecto en sucursales privadas dentro del umbral. Pasa el
            cursor para ver cuál.
          </p>
          <Grafica opciones={opcionesEstados} descripcion="Efecto quitando un estado a la vez" />
        </figure>
      </div>

      <h3 className="subtitulo">¿Para quién?</h3>
      <p className="nota" style={{ marginBottom: "1rem" }}>
        El efecto por tipo de municipio. Ningún grupo se separa del resto: tampoco en los municipios
        que no tenían banca múltiple, donde más se esperaba que el banco atrajera o desplazara.
      </p>
      <Grafica opciones={opcionesHeterogeneidad} descripcion="Efecto por tipo de municipio" />

      <h3 className="subtitulo">Dos pruebas más</h3>
      <div className="prosa">
        <p>
          <b>Placebo de fecha.</b> Si se finge que cada municipio abrió dos años antes, el “efecto” es{" "}
          {pct(placebo.pct)} {intervalo(placebo.lo, placebo.hi)}: nada, como debe ser.
        </p>
        <p>
          <b>Derrames.</b> Los municipios vecinos de uno que abre cambian {pct(vecinos.pct)}{" "}
          {intervalo(vecinos.lo, vecinos.hi)}. Sin señal, aunque la prueba tiene pocos controles (
          {num(vecinos.controles)}).
        </p>
      </div>
    </section>
  );
}
