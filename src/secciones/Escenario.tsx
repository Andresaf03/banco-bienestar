import { useMemo, useState } from "react";
import { Deslizador, Segmentado, Selector } from "../componentes/Controles";
import { num } from "../lib/formato";
import type { Datos } from "../lib/tipos";

// Escenario: si el banco abriera en municipios donde todavía no está, ¿qué cabría esperar? Aplica
// los efectos estimados (por 10 mil adultos) a los adultos de esos municipios. Es una extrapolación:
// supone que el efecto sería como en los municipios que ya abrieron.

type Grupo = "sin" | "desiertos";

const Z90 = 1.645;

interface Linea {
  nombre: string;
  /** efecto por 10 mil adultos y su error estándar */
  att: number;
  ee: number;
  decimales: number;
  nota: string;
}

export function Escenario({ datos }: { datos: Datos }) {
  const [grupo, setGrupo] = useState<Grupo>("sin");
  const [estado, setEstado] = useState("todos");
  const [cobertura, setCobertura] = useState(100);
  const { municipios, estados } = datos.municipios;
  const T = datos.panel.t.length;

  // Candidatos: sin sucursal del banco a 2025T4, ordenados de más a menos adultos.
  const candidatos = useMemo(
    () =>
      municipios
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.G === 0 && !m.ya && (m.ad ?? 0) > 0)
        .filter(({ m }) => grupo === "sin" || m.des)
        .filter(({ m }) => estado === "todos" || m.e === estado)
        .sort((a, b) => (b.m.ad ?? 0) - (a.m.ad ?? 0)),
    [municipios, grupo, estado],
  );
  const elegidos = candidatos.slice(0, Math.max(1, Math.round((candidatos.length * cobertura) / 100)));
  const adultos = elegidos.reduce((a, { m }) => a + (m.ad ?? 0), 0);
  const privadasHoy = elegidos.reduce((a, { m, i }) => {
    const v = datos.panel.vars.privado[i * T + (T - 1)];
    return a + (v === null ? 0 : (v * (m.ad ?? 0)) / 10_000);
  }, 0);
  const sinPrivadas = elegidos.filter(({ i }) => (datos.panel.vars.privado[i * T + (T - 1)] ?? 0) === 0).length;

  const u = datos.uso;
  const privado = datos.efectos.find((e) => e.clave === "privado")!.cabecera;
  const lineas: Linea[] = [
    { nombre: "Tarjetas de débito del banco", att: datos.resumen.tarjetas_bb, ee: datos.resumen.tarjetas_bb_ee, decimales: 0, nota: "todas las cohortes, fase 4" },
    { nombre: "Cuentas del banco", att: u.estimaciones.capt_total_bd_pc.att, ee: u.estimaciones.capt_total_bd_pc.ee, decimales: 0, nota: "contratos de captación, exploratorio" },
    { nombre: "Transacciones en sus cajeros por trimestre", att: u.transacciones_cajero.att, ee: u.transacciones_cajero.ee, decimales: 0, nota: "fase 4" },
    { nombre: "Créditos del banco", att: u.estimaciones.cred_total_bd_pc.att, ee: u.estimaciones.cred_total_bd_pc.ee, decimales: 0, nota: "contratos de crédito, exploratorio" },
    { nombre: "Sucursales privadas", att: privado.att, ee: privado.ee, decimales: 1, nota: "banca múltiple y EACP, estimación principal" },
  ];
  const escala = adultos / 10_000;

  return (
    <section className="seccion" id="escenario" aria-labelledby="titulo-escenario">
      <header>
        <h2 id="titulo-escenario">Escenario: si el banco siguiera abriendo</h2>
        <p>
          Elige dónde abriría y la app aplica los efectos estimados a los adultos de esos municipios.
          Es un ejercicio, no un pronóstico: supone que ahí el efecto sería como en los municipios que
          ya abrieron, y los que faltan son más chicos, más rurales y casi sin banca.
        </p>
      </header>

      <div className="controles">
        <Segmentado
          etiqueta="Dónde abre"
          valor={grupo}
          onCambio={setGrupo}
          opciones={[
            { valor: "sin", texto: "Municipios sin sucursal del banco" },
            { valor: "desiertos", texto: "Solo los que tampoco tienen banca múltiple" },
          ]}
        />
        <Selector etiqueta="Estado" valor={estado} onCambio={setEstado}>
          <option value="todos">Todo el país</option>
          {Object.entries(estados).map(([c, n]) => (
            <option key={c} value={c}>
              {n}
            </option>
          ))}
        </Selector>
        <Deslizador
          etiqueta="Abre en"
          valor={cobertura}
          min={10}
          max={100}
          paso={10}
          texto={`${cobertura}% (los más poblados primero)`}
          onCambio={setCobertura}
        />
      </div>

      {candidatos.length === 0 ? (
        <p className="vacio">En esa selección no quedan municipios sin sucursal del banco.</p>
      ) : (
        <>
          <p className="veredicto">
            {num(elegidos.length)} municipios con {num(adultos)} adultos; hoy tienen {num(privadasHoy, 0)}{" "}
            sucursales privadas y {num(sinPrivadas)} de ellos ninguna.
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">Qué cambiaría</th>
                <th scope="col">Por cada 10 mil adultos</th>
                <th scope="col">En estos municipios</th>
                <th scope="col">Intervalo al 90%</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.nombre}>
                  <td>
                    {l.nombre}
                    <div className="nota" style={{ fontWeight: 400 }}>{l.nota}</div>
                  </td>
                  <td>{num(l.att, l.att < 10 ? 2 : 0)}</td>
                  <td>
                    <b>{num(l.att * escala, l.decimales)}</b>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {num((l.att - Z90 * l.ee) * escala, l.decimales)} a {num((l.att + Z90 * l.ee) * escala, l.decimales)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="nota" style={{ marginTop: "1rem" }}>
            Las sucursales privadas no se moverían de forma apreciable: el intervalo incluye el cero y
            cabe en unas cuantas sucursales. Lo que sí llegaría son cuentas y tarjetas, con muy poco
            crédito.
          </p>
        </>
      )}
    </section>
  );
}
