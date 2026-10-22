import * as Plot from "@observablehq/plot";
import { useCallback, useMemo, useState } from "react";
import { Deslizador, Segmentado, Selector } from "../componentes/Controles";
import { AZUL_BANDA, GRIS, Grafica, TINTA } from "../componentes/Grafica";
import { num, p, pct, trimestre } from "../lib/formato";
import { evento, intervalos } from "../lib/graficas";
import type { Datos, Estimador } from "../lib/tipos";
import { frase } from "../lib/veredicto";

const NOMBRE_ESTIMADOR: Record<Estimador, string> = {
  cs: "Callaway y Sant'Anna",
  apilado: "DiD apilado",
  twfe: "Efectos fijos (TWFE)",
};

const NOTA_ESTIMADOR: Record<Estimador, string> = {
  cs: "Callaway y Sant'Anna doblemente robusto, controles aún no tratados; bandas simultáneas al 95%.",
  apilado: "DiD apilado con pesos de Wing, Freedman y Hollingsworth (2024), controles limpios; IC al 95%.",
  twfe: "Estudio de evento con efectos fijos de municipio y trimestre; IC al 95%. Con efectos heterogéneos puede sesgarse.",
};

/** Ventana del estudio de evento: tres años antes y tres después, como en el trabajo final. */
const VENTANA_E: [number, number] = [-12, 11];

export function Efecto({ datos }: { datos: Datos }) {
  const [clave, setClave] = useState("privado");
  const [estimador, setEstimador] = useState<Estimador>("cs");
  const [umbral, setUmbral] = useState(datos.resumen.sesoi);

  const efecto = datos.efectos.find((e) => e.clave === clave)!;
  const c = efecto.cabecera;
  const disponible = (est: Estimador) => Boolean(efecto.evento[est]?.length);
  const usado: Estimador = disponible(estimador) ? estimador : "cs";
  const primeraEtapa = efecto.grupo === "Primera etapa";
  const estimacion = {
    pct: c.pct,
    lo: (100 * c.ic90[0]) / c.media,
    hi: (100 * c.ic90[1]) / c.media,
    p: c.p,
  };
  const decimales = c.media > 10 ? 0 : 3;

  const grupos = useMemo(() => [...new Set(datos.efectos.map((e) => e.grupo))], [datos]);

  const opcionesEvento = useCallback(
    (ancho: number) =>
      evento((efecto.evento[usado] ?? []).filter((x) => x.e >= VENTANA_E[0] && x.e <= VENTANA_E[1]), {
        ancho,
        banda: primeraEtapa ? undefined : (umbral / 100) * c.media,
        etiquetaY: efecto.unidad,
        decimales,
      }),
    [efecto, usado, primeraEtapa, umbral, c.media, decimales],
  );

  const opcionesCohortes = useCallback(
    (ancho: number) =>
      intervalos(
        efecto.cohortes.map((x) => ({
          etiqueta: `Abren en ${trimestre(x.g)}`,
          pct: (100 * x.att) / c.media,
          lo: (100 * (x.att - 1.645 * x.ee)) / c.media,
          hi: (100 * (x.att + 1.645 * x.ee)) / c.media,
        })),
        { ancho, umbral: primeraEtapa ? undefined : umbral, margenIzq: 140 },
      ),
    [efecto, c.media, umbral, primeraEtapa],
  );

  const opcionesHonest = useCallback(
    (ancho: number): Plot.PlotOptions => {
      const filas = (efecto.honest ?? []).map((h) => ({
        m: h.m,
        lo: (100 * h.lo) / c.media,
        hi: (100 * h.hi) / c.media,
      }));
      return {
        width: ancho,
        height: 230,
        marginLeft: 56,
        x: { label: "M̄: tamaño de la violación permitida, relativa a la mayor de antes", labelAnchor: "center", labelOffset: 32, ticks: filas.map((f) => f.m) },
        y: { label: "% de la media previa", labelAnchor: "top", grid: true, nice: true },
        marks: [
          Plot.rectY([0], { y1: -umbral, y2: umbral, fill: AZUL_BANDA }),
          Plot.ruleY([0], { stroke: GRIS, strokeDasharray: "4 3" }),
          Plot.ruleX(filas, { x: "m", y1: "lo", y2: "hi", stroke: TINTA, strokeWidth: 1.6 }),
          Plot.tickY(filas, { x: "m", y: "lo", stroke: TINTA }),
          Plot.tickY(filas, { x: "m", y: "hi", stroke: TINTA, tip: true, title: (d) => `M̄ = ${d.m}\n[${pct(d.lo)}, ${pct(d.hi)}]` }),
        ],
      };
    },
    [efecto, c.media, umbral],
  );

  const opcionesExtensiones = useCallback(
    (ancho: number) =>
      intervalos(
        datos.extensiones.map((x) => ({
          etiqueta: `${x.nombre} (${x.fuente})`,
          pct: x.pct,
          lo: x.lo,
          hi: x.hi,
          hueco: x.lectura === "reprueba la pre-prueba",
          nota: x.nota ? `${x.lectura}. ${x.nota}` : x.lectura,
        })),
        { ancho, umbral, dominio: [-50, 50], margenIzq: 330 },
      ),
    [datos, umbral],
  );

  return (
    <section className="seccion" id="efecto" aria-labelledby="titulo-efecto">
      <header>
        <h2 id="titulo-efecto">El efecto, trimestre por trimestre</h2>
        <p>
          Cada punto compara a los municipios que ya abrieron con los que todavía no abren. Antes de la
          apertura los puntos deben rondar el cero; después, su distancia al cero es el efecto. La
          franja azul es el umbral: si el intervalo cabe dentro, el efecto es demasiado chico para
          importar.
        </p>
      </header>

      <div className="controles">
        <Selector etiqueta="Resultado" valor={clave} onCambio={setClave}>
          {grupos.map((g) => (
            <optgroup key={g} label={g}>
              {datos.efectos
                .filter((e) => e.grupo === g)
                .map((e) => (
                  <option key={e.clave} value={e.clave}>
                    {e.nombre}
                  </option>
                ))}
            </optgroup>
          ))}
        </Selector>
        <Segmentado
          etiqueta="Estimador"
          valor={usado}
          onCambio={setEstimador}
          opciones={(["cs", "apilado", "twfe"] as Estimador[]).map((e) => ({
            valor: e,
            texto: NOMBRE_ESTIMADOR[e],
            deshabilitada: !disponible(e),
          }))}
        />
        {!primeraEtapa && (
          <Deslizador
            etiqueta="Umbral de equivalencia"
            valor={umbral}
            min={1}
            max={10}
            paso={0.5}
            texto={`±${num(umbral, 1)}%`}
            onCambio={setUmbral}
          />
        )}
      </div>

      <p className="veredicto">
        {efecto.nombre}: {frase(estimacion, primeraEtapa ? 0 : umbral, false)}
      </p>
      <div className="cifras">
        <span>
          En niveles <b>{num(c.att, decimales)}</b> {efecto.unidad} (ee {num(c.ee, decimales)})
        </span>
        <span>
          Media previa <b>{num(c.media, decimales === 0 ? 0 : 2)}</b>
        </span>
        <span>
          Pre-prueba conjunta <b>p = {p(c.wald_p)}</b>
        </span>
        {c.p_rw !== null && (
          <span>
            Romano–Wolf <b>p = {p(c.p_rw)}</b>
          </span>
        )}
        <span>
          <b>{num(c.tratadas)}</b> tratados y <b>{num(c.controles)}</b> controles
        </span>
      </div>
      {efecto.apilado && efecto.apilado.wald_p < 0.05 && (
        <p className="aviso" style={{ marginBottom: "1rem" }}>
          En el DiD apilado este resultado reprueba la pre-prueba (p {p(efecto.apilado.wald_p)}): los
          previos ya venían subiendo. Se reporta como descriptivo, no como efecto.
        </p>
      )}

      <figure>
        <Grafica opciones={opcionesEvento} descripcion={`Estudio de evento de ${efecto.nombre}`} />
        <figcaption>
          {NOTA_ESTIMADOR[usado]} {efecto.detalle}.
        </figcaption>
      </figure>

      <div className="rejilla" style={{ marginTop: "3rem" }}>
        <figure>
          <h3>¿Depende de cuándo abrió?</h3>
          <p className="nota">Efecto promedio de cada cohorte de apertura, IC al 90%.</p>
          <Grafica opciones={opcionesCohortes} descripcion="Efecto por cohorte de apertura" />
        </figure>
        {efecto.honest && (
          <figure>
            <h3>¿Cuánto tendría que fallar el supuesto?</h3>
            <p className="nota">
              Intervalos de Rambachan y Roth (2023): el efecto después de abrir si las tendencias
              paralelas fallaran hasta M̄ veces la mayor desviación de antes.
            </p>
            <Grafica opciones={opcionesHonest} descripcion="Sensibilidad de HonestDiD" />
          </figure>
        )}
      </div>

      <h3 className="subtitulo">Fuera del sistema financiero</h3>
      <p className="nota" style={{ marginBottom: "1rem" }}>
        Las mismas aperturas contra empleo, negocios, luz nocturna, delitos y votos. Los puntos huecos
        reprueban la pre-prueba y solo son descriptivos. El aumento de establecimientos del DENUE no se
        lee como efecto de la sucursal: aparece igual en las localidades vecinas, no crece con el tiempo
        de exposición y no aparece en los Censos Económicos.
      </p>
      <figure>
        <Grafica opciones={opcionesExtensiones} descripcion="Efectos en otras fuentes de datos" />
        <figcaption>Eje recortado a ±50%; pasa el cursor sobre un punto para ver su intervalo completo y su lectura.</figcaption>
      </figure>
    </section>
  );
}
