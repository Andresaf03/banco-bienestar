import * as Plot from "@observablehq/plot";
import { useCallback, useMemo, useState } from "react";
import { Segmentado, Selector } from "../componentes/Controles";
import { AZUL, AZUL_BANDA, GRIS, Grafica, TINTA } from "../componentes/Grafica";
import { intervalo, num, p, pct } from "../lib/formato";
import { evento, intervalos } from "../lib/graficas";
import type { Datos, ResultadoTema, Tema } from "../lib/tipos";

const NOMBRES: Record<Tema, string> = {
  emprendimiento: "Emprendimiento",
  empleo: "Empleo e informalidad",
  violencia: "Violencia",
  politica: "Política",
  hogares: "Hogares",
};

const PASO: Record<string, string> = {
  trimestres: "Trimestres desde la primera sucursal",
  censos: "Censos desde la apertura (cada cinco años)",
  levantamientos: "Levantamientos desde la apertura (2015, 2020, 2025)",
  elecciones: "Elecciones desde la apertura",
  años: "Años desde la primera sucursal",
};

const buscar = (filas: ResultadoTema[], nombre: string) => filas.find((f) => f.nombre === nombre);

/** Lectura de cada tema, con las cifras de los datos. */
function lectura(tema: Tema, datos: Datos): string {
  const t = datos.temas;
  switch (tema) {
    case "emprendimiento": {
      const propia = t.denue.find((d) => d.banda === "sucursal propia");
      const lejos = t.denue.find((d) => d.banda === "5–10 km");
      const ue = buscar(t.emprendimiento, "Unidades económicas");
      const negocio = buscar(t.emprendimiento, "Hogares con negocio propio");
      return `El padrón de negocios del DENUE sube ${pct(propia?.pct ?? NaN)} donde abre el banco, pero sube casi igual en las localidades vecinas y desaparece a 5–10 km (${pct(lejos?.pct ?? NaN)}). Los Censos Económicos no ven más unidades económicas (${pct(ue?.pct ?? NaN)}) y la Intercensal no ve más hogares con negocio (${pct(negocio?.pct ?? NaN)}). Más que nuevos negocios, es un cambio en cómo se midió el padrón.`;
    }
    case "empleo": {
      const inf = buscar(t.empleo, "Ocupados en la informalidad");
      const imss = buscar(t.empleo, "Puestos de trabajo formales");
      if (!inf) return "";
      return `¿Sube la informalidad? En la ENOE la proporción de ocupados informales sube ${pct(inf.pct)} ${intervalo(inf.lo, inf.hi)}, en la dirección de la hipótesis de que el banco paga apoyos pero no financia negocios formales. Es un indicio, no una conclusión: la ENOE solo cubre ${num(inf.tratadas)} municipios tratados contra ${num(inf.controles)} controles, la pre-prueba está al límite (p = ${p(inf.wald_p)}) y el resultado no sobrevive a la corrección por pruebas múltiples. Los puestos formales del IMSS tampoco permiten decidir: ${pct(imss?.pct ?? NaN)} con un intervalo muy ancho.`;
    }
    case "violencia": {
      const anchos = t.violencia.map((f) => Math.max(Math.abs(f.lo), Math.abs(f.hi)));
      const negocio = buscar(t.violencia, "Robo a negocio");
      return `Ningún delito cambia de forma clara: antes de abrir, tratados y controles se movían igual, y los efectos están cerca de cero. Pero los intervalos son anchos (cotas de ${num(Math.min(...anchos), 0)}% a ${num(Math.max(...anchos), 0)}%), así que no se descartan efectos moderados. El robo a negocio baja ${pct(negocio?.pct ?? NaN)}, sin significancia.`;
    }
    case "politica":
      return "Antes de abrir, los municipios ya votaban distinto que los controles: la pre-prueba falla y no hay efecto que se pueda atribuir al banco. Solo es descriptivo.";
    case "hogares": {
      const prog = buscar(t.hogares, "Hogares que reciben programas");
      return `La proporción de hogares con programas sube ${pct(prog?.pct ?? NaN)}, pero ya venía subiendo antes de abrir (reprueba la pre-prueba). La luz nocturna casi no se mueve, pero su pre-prueba falla (cambia distinto según el brillo), y los impuestos municipales no permiten decidir.`;
    }
  }
}

export function Temas({ datos }: { datos: Datos }) {
  const [tema, setTema] = useState<Tema>("empleo");
  const filas = datos.temas[tema];
  const [elegido, setElegido] = useState<string>(filas[0].nombre);
  const actual = buscar(filas, elegido) ?? filas[0];
  const cambiarTema = (t: Tema) => {
    setTema(t);
    setElegido(datos.temas[t][0].nombre);
  };
  const texto = useMemo(() => lectura(tema, datos), [tema, datos]);

  const opcionesForest = useCallback(
    (ancho: number) =>
      intervalos(
        filas.map((f) => ({
          etiqueta: `${f.nombre} (${f.fuente})`,
          pct: f.pct,
          lo: f.lo,
          hi: f.hi,
          hueco: f.lectura === "reprueba la pre-prueba",
          principal: f.nombre === actual.nombre,
          nota: `${f.lectura}; ${num(f.tratadas)} tratados y ${num(f.controles)} controles`,
        })),
        { ancho, umbral: datos.resumen.sesoi, dominio: [-60, 60], margenIzq: 300 },
      ),
    [filas, actual, datos.resumen.sesoi],
  );

  const opcionesEvento = useCallback(
    (ancho: number) => {
      const base = evento(actual.evento, {
        ancho,
        etiquetaY: `${actual.nombre} (${actual.unidad})`,
        decimales: 3,
      });
      return { ...base, x: { ...(base.x as object), label: PASO[actual.paso] ?? "Periodos desde la apertura", ticks: actual.evento.length > 8 ? 8 : actual.evento.map((d) => d.e) } };
    },
    [actual],
  );

  const opcionesDenue = useCallback(
    (ancho: number): Plot.PlotOptions => {
      const orden = ["sucursal propia", "0–2 km", "2–5 km", "5–10 km"];
      const etiquetas: Record<string, string> = {
        "sucursal propia": "Con sucursal",
        "0–2 km": "Vecina a 0–2 km",
        "2–5 km": "Vecina a 2–5 km",
        "5–10 km": "Vecina a 5–10 km",
      };
      const d = datos.temas.denue
        .filter((x) => orden.includes(x.banda))
        .map((x) => ({ ...x, nombre: etiquetas[x.banda] }));
      return {
        width: ancho,
        height: 240,
        marginLeft: 44,
        x: { label: null, domain: orden.map((o) => etiquetas[o]), padding: 0.5 },
        y: { label: "Establecimientos, % de la media previa", labelAnchor: "top", grid: true },
        marks: [
          Plot.rectY([0], { y1: -datos.resumen.sesoi, y2: datos.resumen.sesoi, fill: AZUL_BANDA }),
          Plot.ruleY([0], { stroke: GRIS, strokeDasharray: "4 3" }),
          Plot.ruleX(d, { x: "nombre", y1: "lo", y2: "hi", stroke: TINTA, strokeWidth: 1.5 }),
          Plot.dot(d, {
            x: "nombre",
            y: "pct",
            r: 5,
            fill: (x) => (x.wald_p < 0.05 ? "#ffffff" : AZUL),
            stroke: AZUL,
            strokeWidth: 1.5,
            tip: true,
            title: (x) => `${x.nombre}\n${pct(x.pct)} ${intervalo(x.lo, x.hi)}\npre-prueba p = ${p(x.wald_p)}`,
          }),
        ],
      };
    },
    [datos],
  );

  return (
    <section className="seccion" id="temas" aria-labelledby="titulo-temas">
      <header>
        <h2 id="titulo-temas">Más allá de la banca</h2>
        <p>
          Las mismas aperturas contra emprendimiento, empleo, informalidad, delitos, votos y hogares.
          Cada fuente mide en su propio calendario y con su propia muestra; las lecturas toman en
          cuenta la pre-prueba y la precisión, no solo el signo.
        </p>
      </header>

      <div className="controles">
        <Segmentado
          etiqueta="Tema"
          valor={tema}
          onCambio={cambiarTema}
          opciones={(Object.keys(NOMBRES) as Tema[]).map((t) => ({ valor: t, texto: NOMBRES[t] }))}
        />
      </div>

      <p className="veredicto" style={{ fontSize: "1.12rem" }}>{texto}</p>

      <div className="explorar" style={{ marginTop: "1.5rem" }}>
        <figure>
          <Grafica opciones={opcionesForest} descripcion={`Efectos en ${NOMBRES[tema]}`} />
          <figcaption>
            % de la media previa, IC al 90%; franja de ±{num(datos.resumen.sesoi)}%. Huecos: reprueban la
            pre-prueba. En azul, el resultado elegido. Eje recortado a ±60%.
          </figcaption>
        </figure>
        <figure>
          <Selector etiqueta="Ver en el tiempo" valor={actual.nombre} onCambio={setElegido}>
            {filas.map((f) => (
              <option key={f.nombre} value={f.nombre}>
                {f.nombre}
              </option>
            ))}
          </Selector>
          <div className="cifras" style={{ marginTop: "0.8rem" }}>
            <span>
              <b>{pct(actual.pct)}</b> {intervalo(actual.lo, actual.hi)}
            </span>
            <span>
              Pre-prueba <b>p = {p(actual.wald_p)}</b>
            </span>
            <span>{actual.lectura}</span>
          </div>
          {actual.evento.length > 0 ? (
            <Grafica opciones={opcionesEvento} descripcion={`Estudio de evento de ${actual.nombre}`} />
          ) : (
            <p className="vacio">Sin estudio de evento para este resultado.</p>
          )}
          <figcaption>Callaway y Sant'Anna; bandas simultáneas al 95%. Fuente: {actual.fuente}.</figcaption>
        </figure>
      </div>

      {tema === "emprendimiento" && (
        <figure style={{ marginTop: "2.5rem" }}>
          <h3>El padrón sube también en las vecinas</h3>
          <p className="nota" style={{ marginBottom: "0.6rem" }}>
            Efecto en establecimientos del DENUE en la actualización censal de 2024, según la distancia
            a la sucursal. Un efecto del banco debería concentrarse donde está la sucursal. Huecos:
            reprueban la pre-prueba.
          </p>
          <Grafica opciones={opcionesDenue} descripcion="Efecto en el DENUE por distancia a la sucursal" />
        </figure>
      )}
    </section>
  );
}
