import * as Plot from "@observablehq/plot";
import { useCallback, useState } from "react";
import { Segmentado } from "../componentes/Controles";
import { AZUL, GRIS, Grafica, LINEA, TINTA } from "../componentes/Grafica";
import { num, p } from "../lib/formato";
import { evento } from "../lib/graficas";
import type { Datos } from "../lib/tipos";

type Serie = "capt_total_bd_pc" | "cred_total_bd_pc" | "tarjetas_debito_bd_pc";

const SERIES: Record<Serie, string> = {
  capt_total_bd_pc: "Cuentas",
  tarjetas_debito_bd_pc: "Tarjetas de débito",
  cred_total_bd_pc: "Créditos",
};

/** "2025Q4" → índice de trimestre (2019T1 = 1). */
function indice(periodo: string): number {
  return (Number(periodo.slice(0, 4)) - 2019) * 4 + Number(periodo.slice(-1));
}

export function Uso({ datos }: { datos: Datos }) {
  const [serie, setSerie] = useState<Serie>("cred_total_bd_pc");
  const { estimaciones, banca_desarrollo, portafolio, tarjetas_credito_bm } = datos.uso;
  const capt = estimaciones.capt_total_bd_pc;
  const cred = estimaciones.cred_total_bd_pc;
  const tarj = estimaciones.tarjetas_debito_bd_pc;
  const ultimo = banca_desarrollo[banca_desarrollo.length - 1];
  const porCien = (100 * ultimo.cred) / ultimo.capt;
  const porCienBm = ultimo.cred_bm && ultimo.capt_bm ? (100 * ultimo.cred_bm) / ultimo.capt_bm : NaN;
  const ultimoMes = portafolio.mensual[portafolio.mensual.length - 1];
  const promedioMes =
    portafolio.mensual.slice(-12).reduce((a, m) => a + m.por_tarjeta, 0) / Math.min(12, portafolio.mensual.length);
  const elegida = estimaciones[serie];

  const opcionesEvento = useCallback(
    (ancho: number) =>
      evento(
        elegida.evento.filter((x) => x.e >= -6 && x.e <= 8),
        { ancho, etiquetaY: `${SERIES[serie]} por 10 mil adultos`, decimales: serie === "cred_total_bd_pc" ? 1 : 0 },
      ),
    [elegida, serie],
  );

  const opcionesProporcion = useCallback(
    (ancho: number): Plot.PlotOptions => {
      const filas = banca_desarrollo.flatMap((f) => [
        { t: indice(f.periodo), quien: "Banco del Bienestar", v: (100 * f.cred) / f.capt },
        ...(f.cred_bm && f.capt_bm ? [{ t: indice(f.periodo), quien: "Banca múltiple", v: (100 * f.cred_bm) / f.capt_bm }] : []),
      ]);
      return {
        width: ancho,
        height: 250,
        marginLeft: 44,
        marginRight: 120,
        x: { label: null, ticks: [16, 20, 24, 28], tickFormat: (t: number) => `${2019 + Math.floor((t - 1) / 4)}T${((t - 1) % 4) + 1}` },
        y: { label: "Créditos por cada 100 cuentas", labelAnchor: "top", grid: true, domain: [0, 70] },
        marks: [
          Plot.ruleY([0], { stroke: LINEA }),
          Plot.lineY(filas, { x: "t", y: "v", z: "quien", stroke: (d) => (d.quien === "Banca múltiple" ? GRIS : AZUL), strokeWidth: 2 }),
          Plot.text(filas, Plot.selectLast({ x: "t", y: "v", z: "quien", text: (d) => `${d.quien}: ${num(d.v, 1)}`, dx: 6, textAnchor: "start", fill: TINTA })),
          Plot.dot(filas, { x: "t", y: "v", r: 2.5, fill: (d) => (d.quien === "Banca múltiple" ? GRIS : AZUL), tip: true, title: (d) => `${d.quien}\n${num(d.v, 1)} créditos por cada 100 cuentas` }),
        ],
      };
    },
    [banca_desarrollo],
  );

  const opcionesMensual = useCallback(
    (ancho: number): Plot.PlotOptions => {
      const filas = portafolio.mensual.map((m) => ({
        fecha: new Date(Number(m.mes.slice(0, 4)), Number(m.mes.slice(4)) - 1, 1),
        v: m.por_tarjeta,
      }));
      return {
        width: ancho,
        height: 220,
        marginLeft: 44,
        x: { label: null, type: "utc" },
        y: { label: "Transacciones por tarjeta al mes", labelAnchor: "top", grid: true, zero: true },
        marks: [
          Plot.areaY(filas, { x: "fecha", y: "v", fill: AZUL, fillOpacity: 0.1 }),
          Plot.lineY(filas, { x: "fecha", y: "v", stroke: AZUL, strokeWidth: 1.6, tip: true, title: (d) => `${d.fecha.getFullYear()}-${String(d.fecha.getMonth() + 1).padStart(2, "0")}: ${num(d.v, 2)}` }),
        ],
      };
    },
    [portafolio],
  );

  return (
    <section className="seccion" id="uso" aria-labelledby="titulo-uso">
      <header>
        <h2 id="titulo-uso">¿Se usan las cuentas?</h2>
        <p>
          Que el banco llegue no es lo mismo que el banco sirva. Las cuentas que abre se usan para
          cobrar programas; casi no vienen con crédito ni con pagos.
        </p>
      </header>

      <ul className="respuesta" style={{ marginTop: 0 }}>
        <li>
          Por cada 10 mil adultos, el banco abrió <strong>+{num(capt.att)} cuentas</strong> y{" "}
          <strong>+{num(tarj.att)} tarjetas</strong> de débito, pero solo{" "}
          <strong>+{num(cred.att, 1)} créditos</strong>: menos de uno por cada 100 cuentas nuevas.
          <span>
            Exploratorio: Callaway y Sant'Anna con {num(capt.tratadas)} municipios que abren en
            2023–2025 contra {num(capt.controles)} controles, sin tendencia previa (p = {p(capt.wald_p)},{" "}
            {p(cred.wald_p)} y {p(tarj.wald_p)}).
          </span>
        </li>
        <li>
          En todo el país hay {num(porCien, 1)} créditos del banco por cada 100 cuentas; en la banca
          múltiple de los mismos municipios, {num(porCienBm, 0)}.
          <span>
            Contratos de la banca de desarrollo en la CNBV, {ultimo.periodo.replace("Q", "T")}, sin los
            municipios con Banjército.
          </span>
        </li>
        <li>
          Sus {num(portafolio.cajeros)} cajeros son{" "}
          {portafolio.cajeros_solo_retiros === portafolio.cajeros ? "todos" : `${num(portafolio.cajeros_solo_retiros)}`} solo
          de retiro{!portafolio.tiene_tarjeta_credito && !portafolio.tiene_tpv && ", no emite tarjetas de crédito ni tiene terminales para cobrar con tarjeta"}. Donde abre,
          cada tarjeta se usa unas {num(datos.resumen.transacciones_por_tarjeta, 1)} veces por trimestre en
          ellos: una vez cada dos meses, al ritmo del pago de los programas.
          <span>Portafolio de la CNBV, hasta {ultimoMes.mes.slice(0, 4)}-{ultimoMes.mes.slice(4)}.</span>
        </li>
      </ul>

      <div className="rejilla" style={{ marginTop: "2.5rem" }}>
        <figure>
          <h3>Lo que pasa al abrir</h3>
          <div className="controles" style={{ marginBottom: "0.6rem" }}>
            <Segmentado
              etiqueta="Resultado"
              valor={serie}
              onCambio={setSerie}
              opciones={(Object.keys(SERIES) as Serie[]).map((s) => ({ valor: s, texto: SERIES[s] }))}
            />
          </div>
          <Grafica opciones={opcionesEvento} descripcion={`Estudio de evento de ${SERIES[serie]} del banco`} />
          <figcaption>
            Banca de desarrollo sin los municipios con Banjército, 2022T4–2025T4; bandas simultáneas al
            95%. Efecto: {num(elegida.att, serie === "cred_total_bd_pc" ? 1 : 0)} (ee{" "}
            {num(elegida.ee, serie === "cred_total_bd_pc" ? 1 : 0)}).
          </figcaption>
        </figure>
        <figure>
          <h3>Créditos por cada 100 cuentas</h3>
          <p className="nota">Contratos de crédito por cada 100 de captación. El banco casi no presta; la banca múltiple tiene más de 60 créditos por cada 100 cuentas.</p>
          <Grafica opciones={opcionesProporcion} descripcion="Créditos por cada 100 cuentas, banco contra banca múltiple" />
        </figure>
        <figure>
          <h3>Uso de las tarjetas</h3>
          <p className="nota">
            Todo el país: transacciones en los cajeros del banco por tarjeta emitida, cada mes. En
            promedio, {num(promedioMes, 2)} al mes en el último año.
          </p>
          <Grafica opciones={opcionesMensual} descripcion="Transacciones por tarjeta al mes" />
        </figure>
        <div>
          <h3>¿Y la banca privada?</h3>
          <p className="prosa" style={{ marginTop: "0.4rem" }}>
            Tampoco se mueve el crédito privado: las tarjetas de crédito de la banca múltiple cambian{" "}
            {num(tarjetas_credito_bm.pct, 1)}% (intervalo de {num(tarjetas_credito_bm.lo, 1)}% a{" "}
            {num(tarjetas_credito_bm.hi, 1)}%). La cuenta del banco no abre la puerta a otros
            servicios financieros.
          </p>
          <div className="recomendacion" style={{ marginTop: "1.2rem" }}>
            <h3>Lectura</h3>
            <p>
              El banco cumple como pagador de programas: llega, abre cuentas y entrega tarjetas. No
              se usa como banco: casi no presta, no procesa pagos y sus tarjetas sirven para retirar
              el apoyo.
            </p>
          </div>
        </div>
      </div>
      <p className="nota" style={{ marginTop: "1.5rem" }}>
        En 2025T2 la CNBV reclasificó las cuentas del banco del nivel 4 al nivel 2 (cuentas de bajo
        monto); en {ultimo.periodo.replace("Q", "T")}, el {num((100 * ultimo.n2) / ultimo.capt, 0)}% son de
        nivel 2. Saldos, cuentas activas y crédito por sucursal no son públicos: medirlos requiere
        pedirlos al banco.
      </p>
    </section>
  );
}
