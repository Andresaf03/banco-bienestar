import { useCallback, useMemo, useState } from "react";
import { Segmentado, Selector } from "../componentes/Controles";
import { Grafica } from "../componentes/Grafica";
import { construirMuestra, estimarCS, FILTRO_COMPLETO, type FiltroMuestra, type GrupoControl } from "../lib/cs";
import { pNormal } from "../lib/estadistica";
import { num, p, pct, trimestre } from "../lib/formato";
import { evento } from "../lib/graficas";
import type { Datos, VarPanel } from "../lib/tipos";
import { frase } from "../lib/veredicto";

const RESULTADOS: { valor: VarPanel; texto: string; oficial: string }[] = [
  { valor: "privado", texto: "Sucursales privadas", oficial: "privado" },
  { valor: "bm", texto: "Sucursales de banca múltiple", oficial: "bm" },
  { valor: "eacp", texto: "Sucursales de EACP", oficial: "eacp" },
  { valor: "total", texto: "Sucursales totales (primera etapa)", oficial: "total" },
];

const MARGINACION = ["Muy bajo", "Bajo", "Medio", "Alto", "Muy alto"];

const POBLACION: Record<string, [number, number] | null> = {
  todos: null,
  chico: [0, 14_999],
  medio: [15_000, 49_999],
  grande: [50_000, Infinity],
};

const VENTANA_E: [number, number] = [-12, 11];

export function Laboratorio({ datos }: { datos: Datos }) {
  const { municipios, estados } = datos.municipios;
  const [resultado, setResultado] = useState<VarPanel>("privado");
  const [control, setControl] = useState<GrupoControl>("notyettreated");
  const [desierto, setDesierto] = useState<FiltroMuestra["desierto"]>("todos");
  const [marginacion, setMarginacion] = useState<Set<string>>(new Set(MARGINACION));
  const [poblacion, setPoblacion] = useState("todos");
  const claves = Object.keys(estados);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(claves));

  const filtro: FiltroMuestra = useMemo(
    () => ({
      estados: elegidos.size === claves.length ? null : elegidos,
      desierto,
      marginacion: marginacion.size === MARGINACION.length ? null : marginacion,
      poblacion: POBLACION[poblacion],
    }),
    [elegidos, claves.length, desierto, marginacion, poblacion],
  );

  const opciones = useMemo(
    () => ({ tiempos: datos.panel.t, minCohorte: datos.resumen.min_cohorte, minPre: 2 }),
    [datos],
  );
  const muestra = useMemo(() => construirMuestra(municipios, filtro, opciones), [municipios, filtro, opciones]);
  const r = useMemo(
    () => estimarCS(datos.panel.vars[resultado], datos.panel.t.length, muestra, datos.panel.t, control),
    [datos, resultado, muestra, control],
  );

  const completa = filtro === FILTRO_COMPLETO || (filtro.estados === null && filtro.desierto === "todos" && filtro.marginacion === null && filtro.poblacion === null);
  const oficial = datos.efectos.find((e) => e.clave === RESULTADOS.find((x) => x.valor === resultado)!.oficial)!.cabecera;
  const tratadas = muestra.cohortes.reduce((a, c) => a + c.n, 0);

  const estimacion = r && Number.isFinite(r.mediaPrevia) && r.mediaPrevia > 0
    ? {
        pct: (100 * r.theta.att) / r.mediaPrevia,
        lo: (100 * (r.theta.att - 1.645 * r.theta.se)) / r.mediaPrevia,
        hi: (100 * (r.theta.att + 1.645 * r.theta.se)) / r.mediaPrevia,
        p: pNormal(r.theta.att / r.theta.se),
      }
    : null;

  const opcionesEvento = useCallback(
    (ancho: number) =>
      evento(
        (r?.dinamico ?? [])
          .filter((d) => d.e >= VENTANA_E[0] && d.e <= VENTANA_E[1] && Number.isFinite(d.se))
          .map((d) => ({ e: d.e, att: d.att, lo: d.att - 1.96 * d.se, hi: d.att + 1.96 * d.se })),
        {
          ancho,
          banda: resultado === "total" || !r ? undefined : (datos.resumen.sesoi / 100) * r.mediaPrevia,
          etiquetaY: "Sucursales por 10 mil adultos",
          decimales: 3,
        },
      ),
    [r, resultado, datos.resumen.sesoi],
  );

  const alternar = (conjunto: Set<string>, valor: string) => {
    const nuevo = new Set(conjunto);
    if (nuevo.has(valor)) nuevo.delete(valor);
    else nuevo.add(valor);
    return nuevo;
  };

  const restablecer = () => {
    setResultado("privado");
    setControl("notyettreated");
    setDesierto("todos");
    setMarginacion(new Set(MARGINACION));
    setPoblacion("todos");
    setElegidos(new Set(claves));
  };

  const pocos = tratadas < 30 || (control === "nevertreated" ? muestra.nunca : muestra.idx.length - tratadas) < 30;

  return (
    <section className="seccion" id="laboratorio" aria-labelledby="titulo-laboratorio">
      <header>
        <h2 id="titulo-laboratorio">Laboratorio</h2>
        <p>
          Elige qué municipios entran y la app vuelve a estimar el efecto en tu navegador, con el
          mismo estimador de Callaway y Sant'Anna y las mismas reglas de muestra. Esta versión no
          ajusta por covariables; con toda la muestra da lo mismo que el paquete did de R, y las
          pruebas automáticas del repositorio lo comprueban.
        </p>
      </header>

      <div className="laboratorio">
        <div className="laboratorio__panel">
          <Selector etiqueta="Resultado" valor={resultado} onCambio={(v) => setResultado(v as VarPanel)}>
            {RESULTADOS.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.texto}
              </option>
            ))}
          </Selector>
          <Segmentado
            etiqueta="Comparar contra"
            valor={control}
            onCambio={setControl}
            opciones={[
              { valor: "notyettreated", texto: "Aún no abren" },
              { valor: "nevertreated", texto: "Nunca abren" },
            ]}
          />
          <Segmentado
            etiqueta="Banca múltiple en 2019"
            valor={desierto}
            onCambio={setDesierto}
            opciones={[
              { valor: "todos", texto: "Todos" },
              { valor: "no", texto: "Con" },
              { valor: "si", texto: "Sin" },
            ]}
          />
          <Selector etiqueta="Población 2020" valor={poblacion} onCambio={setPoblacion}>
            <option value="todos">Todos los tamaños</option>
            <option value="chico">Menos de 15 mil habitantes</option>
            <option value="medio">De 15 mil a 50 mil</option>
            <option value="grande">Más de 50 mil</option>
          </Selector>
          <fieldset className="control">
            <legend>Marginación 2020</legend>
            <div className="casillas">
              {MARGINACION.map((g) => (
                <label key={g}>
                  <input
                    type="checkbox"
                    checked={marginacion.has(g)}
                    onChange={() => setMarginacion(alternar(marginacion, g))}
                  />
                  {g}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="control">
            <legend>
              Estados ({elegidos.size} de {claves.length}){" "}
              <button type="button" className="boton" style={{ minHeight: 0, padding: "0 0.4rem", fontSize: "0.85rem" }} onClick={() => setElegidos(elegidos.size === claves.length ? new Set() : new Set(claves))}>
                {elegidos.size === claves.length ? "Quitar todos" : "Todos"}
              </button>
            </legend>
            <div className="laboratorio__estados">
              {claves.map((c) => (
                <label key={c} className="casillas">
                  <input type="checkbox" checked={elegidos.has(c)} onChange={() => setElegidos(alternar(elegidos, c))} />
                  {estados[c]}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" className="boton" onClick={restablecer}>
            Restablecer
          </button>
        </div>

        <div>
          {r && estimacion ? (
            <>
              <p className="veredicto">{frase(estimacion, resultado === "total" ? 0 : datos.resumen.sesoi)}</p>
              <div className="cifras">
                <span>
                  <b>{num(r.n)}</b> municipios: <b>{num(tratadas)}</b> tratados en {muestra.cohortes.length} cohortes
                </span>
                <span>
                  Media previa <b>{num(r.mediaPrevia, 2)}</b>
                </span>
                <span>
                  Pre-prueba conjunta <b>p = {p(r.preprueba?.p)}</b>
                </span>
              </div>
              {pocos && (
                <p className="aviso" style={{ marginBottom: "1rem" }}>
                  Quedan pocos tratados o pocos controles. El error estándar asume muchos municipios;
                  con menos de 30 en algún grupo, léelo con cautela.
                </p>
              )}
              {r.preprueba && r.preprueba.p < 0.05 && (
                <p className="aviso" style={{ marginBottom: "1rem" }}>
                  En esta muestra los trimestres previos no son planos (p {p(r.preprueba.p)}): las
                  tratadas ya se movían distinto antes de abrir y el efecto no se puede leer como causal.
                </p>
              )}
              <figure>
                <Grafica opciones={opcionesEvento} descripcion="Estudio de evento del laboratorio" />
                <figcaption>
                  Sin covariables, IC al 95% punto por punto.{" "}
                  {completa
                    ? `La estimación oficial, doblemente robusta y con covariables, da ${pct(oficial.pct)}.`
                    : "Compara con la muestra completa usando Restablecer."}
                  {muestra.cohortesChicas.length > 0 &&
                    ` Salen ${muestra.cohortesChicas.length} cohortes con menos de ${datos.resumen.min_cohorte} municipios (${muestra.cohortesChicas
                      .map((c) => trimestre(c.g))
                      .join(", ")}).`}
                </figcaption>
              </figure>
            </>
          ) : (
            <p className="vacio">
              Con estos filtros no quedan tratados y controles suficientes para estimar. Agrega estados
              o quita un filtro.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
