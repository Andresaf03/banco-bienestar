import { urlDatos } from "../lib/datos";
import { num, p, pct } from "../lib/formato";
import type { Datos } from "../lib/tipos";
import { Covariables } from "./Covariables";

const FUENTES = [
  {
    nombre: "Bases de Datos de Inclusión Financiera (CNBV)",
    uso: "Sucursales por sector y municipio, 2016T1–2025T4: el resultado y la fecha de apertura.",
    url: "https://www.gob.mx/cnbv/acciones-y-programas/bases-de-datos-de-inclusion-financiera",
  },
  {
    nombre: "Portafolio de Información (CNBV)",
    uso: "Separa al Banco del Bienestar de Banjército, que la base municipal reporta juntos.",
    url: "https://portafolioinfo.cnbv.gob.mx/PortafolioInformacion/Forms/AllItems.aspx",
  },
  {
    nombre: "Directorio de sucursales del Banco del Bienestar",
    uso: "Ubicación de cada sucursal; coincide con la CNBV en 99.9% de los municipios.",
    url: "https://datos.gob.mx/dataset/sucursales",
  },
  {
    nombre: "Marco Geoestadístico 2024 (INEGI)",
    uso: "Límites municipales del mapa y de los vecinos.",
    url: "https://www.inegi.org.mx/app/biblioteca/ficha.html?upc=794551132173",
  },
  {
    nombre: "Índice de marginación 2020 (CONAPO)",
    uso: "Covariable y grupos de heterogeneidad.",
    url: "https://www.gob.mx/conapo/documentos/indices-de-marginacion-2020-284372",
  },
];

const ARCHIVOS = ["municipios", "panel", "sucursales", "efectos", "robustez", "heterogeneidad", "extensiones"];

export function Metodo({ datos }: { datos: Datos }) {
  const efecto = (clave: string) => datos.efectos.find((e) => e.clave === clave)!;
  const privado = efecto("privado");
  const bm = efecto("bm");
  const { placebo, vecinos, controles, estimadores } = datos.robustez;
  const sinVecino = controles.find((c) => c.r === "privado" && c.v.startsWith("H1e"));
  const etwfe = estimadores.find((e) => e.r === "privado" && e.est === "TWFE extendido (Wooldridge)");
  const honest = privado.honest?.find((h) => h.m === 0.25);
  const cotaHonest = honest
    ? (100 * Math.max(Math.abs(honest.lo), Math.abs(honest.hi))) / privado.cabecera.media
    : null;

  return (
    <section className="seccion" id="metodo" aria-labelledby="titulo-metodo">
      <header>
        <h2 id="titulo-metodo">Cómo se hizo</h2>
        <p>
          Un panel de {num(datos.resumen.municipios)} municipios por trimestre, 2019T1–2024T4, con
          límites constantes. El tratamiento es el primer trimestre con una sucursal del banco en
          operación. Como el banco abrió en momentos distintos, se usa el estimador de Callaway y
          Sant'Anna (2021): compara cada cohorte solo con municipios que todavía no abren y evita el
          sesgo de la regresión clásica con efectos fijos cuando los efectos varían entre cohortes.
          Todo quedó preregistrado antes de estimar.
        </p>
      </header>

      <Covariables datos={datos} />

      <h3 style={{ margin: "3rem 0 0.8rem" }}>Supuestos</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Supuesto</th>
            <th scope="col">Qué se revisó</th>
            <th scope="col">Veredicto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Tendencias paralelas</td>
            <td>
              Antes de abrir, tratados y controles se mueven igual: pre-prueba p = {p(privado.cabecera.wald_p)} en
              sucursales privadas y {p(bm.cabecera.wald_p)} en banca múltiple, al límite. Placebo de
              fecha: {pct(placebo.pct)}.
              {cotaHonest !== null &&
                ` Si la tendencia fallara hasta un cuarto de la mayor desviación previa, el intervalo seguiría dentro de ±${num(cotaHonest, 1)}%.`}
            </td>
            <td>Apoyado, no demostrado</td>
          </tr>
          <tr>
            <td>Sin anticipación</td>
            <td>Con un trimestre de anticipación el resultado no cambia.</td>
            <td>Se cumple</td>
          </tr>
          <tr>
            <td>Sin derrames</td>
            <td>
              Los vecinos de un municipio que abre cambian {pct(vecinos.pct)}.
              {sinVecino && ` La prueba con controles sin vecinos que abren solo tiene ${num(sinVecino.controles)} controles.`}
            </td>
            <td>Probable; la prueba es débil</td>
          </tr>
          <tr>
            <td>Soporte común</td>
            <td>
              Tras reponderar, las cohortes de 2023T4 y 2024T1 siguen desbalanceadas; sin ellas, el
              resultado es el mismo.
            </td>
            <td>Se cumple con matices</td>
          </tr>
        </tbody>
      </table>

      <div className="rejilla" style={{ marginTop: "3rem" }}>
        <div>
          <h3 style={{ marginBottom: "0.8rem" }}>De los datos a la respuesta</h3>
          <ol className="pasos">
            <li>Descarga de cada fuente con su huella (hash) registrada; repetirla no cambia nada.</li>
            <li>
              Limpieza: un lector para cada uno de los cuatro formatos de la base de la CNBV, Banjército
              separado y claves municipales de cinco dígitos, nunca por nombre.
            </li>
            <li>Panel municipal con la población adulta fija en 2022T4, para que un cambio de fuente no se confunda con un efecto.</li>
            <li>Estimación en R con el paquete did, pruebas de robustez y corrección por pruebas múltiples.</li>
            <li>
              Esta app: un script exporta los resultados a archivos pequeños, y el laboratorio rehace
              la estimación en el navegador, validada contra R con pruebas automáticas.
            </li>
          </ol>
        </div>
        <div>
          <h3 style={{ marginBottom: "0.8rem" }}>Lo que este trabajo no responde</h3>
          <ul className="pasos">
            <li>
              Mide contratos, no montos: los datos públicos no traen saldos, cuentas activas ni crédito
              por sucursal, y la captación y el crédito por sector solo existen desde 2022T4. El uso
              (sección Uso) es exploratorio y solo cubre las aperturas de 2023 en adelante.
            </li>
            <li>La ubicación no fue al azar: el resultado descansa en las tendencias paralelas.</li>
            <li>
              “No desplazó” es más firme que “no atrajo”: una especificación, el TWFE extendido con
              covariables, da {etwfe ? pct(etwfe.pct) : "un efecto positivo"}.
            </li>
            <li>Las aperturas van de 2022 a 2024: hay entre uno y tres años de seguimiento.</li>
          </ul>
          <h3 style={{ margin: "1.6rem 0 0.8rem" }}>Siguiente paso</h3>
          <p className="prosa">
            Con datos públicos ya se midió el crédito y las cuentas que trae el banco (sección Uso). Lo
            que falta solo lo tiene el banco: cuentas activas, saldos y crédito por sucursal, que se
            pueden pedir por transparencia. Además, repetir el análisis con los trimestres de 2026,
            cuando las aperturas de 2024 tengan más años de seguimiento.
          </p>
        </div>
      </div>

      <h3 className="subtitulo">Reproducir</h3>
      <p className="prosa" style={{ marginBottom: "0.8rem" }}>
        Desde el repositorio del proyecto, con uv, R y Node instalados:
      </p>
      <pre className="codigo">
        <code>{`make bateria          # estimación completa (~55 min)
make app-datos        # exporta los resultados a app/public/datos
cd app && npm install && npm run dev`}</code>
      </pre>

      <div className="rejilla" style={{ marginTop: "3rem" }}>
        <div>
          <h3 style={{ marginBottom: "0.8rem" }}>Fuentes</h3>
          <ul className="pasos">
            {FUENTES.map((f) => (
              <li key={f.nombre}>
                <a href={f.url} target="_blank" rel="noreferrer">
                  {f.nombre}
                </a>
                . {f.uso}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 style={{ marginBottom: "0.8rem" }}>Datos de esta app</h3>
          <p className="nota" style={{ marginBottom: "0.6rem" }}>
            Los mismos archivos que usa la página, en JSON.
          </p>
          <ul className="pasos">
            {ARCHIVOS.map((a) => (
              <li key={a}>
                <a href={urlDatos(`${a}.json`)} download>
                  {a}.json
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
