import { useEffect, useMemo, useRef, useState } from "react";
import type { Topology } from "topojson-specification";
import { Segmentado } from "../componentes/Controles";
import { Ficha } from "../componentes/Ficha";
import { Mapa } from "../componentes/Mapa";
import { urlDatos } from "../lib/datos";
import { intervalo, num, pct, trimestre } from "../lib/formato";
import { CATEGORIAS, CLASES_PRIVADAS, geometria, type ModoMapa, SIN_SUCURSAL } from "../lib/mapa";
import type { Datos } from "../lib/tipos";

const PASO_MS = 170;

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function useTopologia() {
  const [topo, setTopo] = useState<Topology | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(urlDatos("mapa.topo.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo leer el mapa (HTTP ${r.status}).`);
        return r.json() as Promise<Topology>;
      })
      .then(setTopo)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return { topo, error };
}

export function Portada({ datos }: { datos: Datos }) {
  const { topo, error } = useTopologia();
  const geo = useMemo(() => (topo ? geometria(topo, datos) : null), [topo, datos]);
  const tiempos = datos.sucursales.t;
  const ultimo = tiempos[tiempos.length - 1];
  const reducido = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const [t, setT] = useState(reducido ? ultimo : tiempos[0]);
  const [corriendo, setCorriendo] = useState(!reducido);
  const [modo, setModo] = useState<ModoMapa>("apertura");
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const reloj = useRef<number | null>(null);

  // Una sola animación: la expansión corre una vez al cargar y se puede repetir.
  useEffect(() => {
    if (!corriendo || !geo) return;
    reloj.current = window.setInterval(() => setT((x) => Math.min(x + 1, ultimo)), PASO_MS);
    return () => {
      if (reloj.current) window.clearInterval(reloj.current);
    };
  }, [corriendo, geo, ultimo]);
  useEffect(() => {
    if (corriendo && t >= ultimo) setCorriendo(false);
  }, [corriendo, t, ultimo]);

  const { municipios, estados } = datos.municipios;
  // "Municipio, Estado"; los homónimos dentro de un estado llevan su clave para distinguirlos.
  const nombres = useMemo(() => {
    const base = municipios.map((m) => `${m.n ?? m.c}, ${estados[m.e]}`);
    const veces = new Map<string, number>();
    for (const n of base) veces.set(n, (veces.get(n) ?? 0) + 1);
    return base.map((n, i) => ((veces.get(n) ?? 0) > 1 ? `${n} (${municipios[i].c})` : n));
  }, [municipios, estados]);
  // La lista de búsqueda no cambia con la animación: se construye una vez.
  const opcionesBusqueda = useMemo(
    () => (
      <datalist id="lista-municipios">
        {nombres.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    ),
    [nombres],
  );
  const etiqueta = (idx: number) => {
    const m = municipios[idx];
    const cuando =
      m.ya || m.G === 1 ? "Ya tenía sucursal en 2019" : m.G === 0 ? "Sin sucursal" : `Abre en ${trimestre(m.G)}`;
    return (
      <>
        <b>{nombres[idx]}</b>
        <br />
        {cuando}
      </>
    );
  };

  const k = tiempos.indexOf(t);
  const Tn = tiempos.length;
  let total = 0;
  let conSucursal = 0;
  for (let i = 0; i < municipios.length; i++) {
    const v = datos.sucursales.n[i * Tn + k];
    if (v !== null && v > 0) {
      total += v;
      conSucursal++;
    }
  }

  // Búsqueda sin acentos ni mayúsculas: el nombre exacto (o la opción elegida de la lista) se
  // selecciona al momento; con Enter se toma la primera coincidencia parcial.
  const normales = useMemo(() => nombres.map(normalizar), [nombres]);
  const elegir = (idx: number) => {
    setSeleccionado(idx);
    setModo("apertura");
  };
  const buscar = (texto: string) => {
    setBusqueda(texto);
    const idx = nombres.indexOf(texto);
    if (idx >= 0) elegir(idx);
  };
  const buscarPrimero = () => {
    const q = normalizar(busqueda.trim());
    if (!q) return;
    const idx = normales.findIndex((n) => n.startsWith(q));
    const parcial = idx >= 0 ? idx : normales.findIndex((n) => n.includes(q));
    if (parcial >= 0) {
      setBusqueda(nombres[parcial]);
      elegir(parcial);
    }
  };

  const privadas = datos.efectos.find((e) => e.clave === "privado")!.cabecera;
  const primera = datos.efectos.find((e) => e.clave === "total")!.cabecera;
  const r = datos.resumen;
  const tratadas = privadas.tratadas;
  const nuevos = municipios.filter((m) => !m.ya && m.G >= 2 && m.G <= 24).length;

  return (
    <section className="portada" id="inicio" aria-labelledby="titulo">
      <h1 id="titulo">¿La primera sucursal del Banco del Bienestar atrajo a la banca privada o la desplazó?</h1>
      <p className="prosa" style={{ marginTop: "1rem", color: "var(--gris)" }}>
        Entre 2019 y 2024 el banco pasó de {num(r.sucursales_2019)} a {num(r.sucursales_2024)}{" "}
        sucursales y llegó por primera vez a {num(nuevos)} municipios. El mapa muestra el orden en
        que llegó a cada uno.
      </p>

      <div className="explorar portada__mapa" id="mapa">
        <div>
          <div className="controles" style={{ marginBottom: "0.8rem" }}>
            <Segmentado
              etiqueta="Colorear por"
              valor={modo}
              onCambio={setModo}
              opciones={[
                { valor: "apertura", texto: "Llegada del banco" },
                { valor: "privadas", texto: "Banca privada en 2019" },
              ]}
            />
            <label className="control" style={{ flex: 1, minWidth: "14rem" }}>
              <span>Buscar municipio</span>
              <input
                type="search"
                list="lista-municipios"
                value={busqueda}
                placeholder="Escribe un nombre"
                onChange={(e) => buscar(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") buscarPrimero();
                }}
              />
              {opcionesBusqueda}
            </label>
          </div>

          {error && <p className="aviso">{error}</p>}
          {geo ? (
            <Mapa
              municipios={geo.municipios}
              estados={geo.estados}
              modo={modo}
              t={t}
              seleccionado={seleccionado}
              onSeleccionar={setSeleccionado}
              etiqueta={etiqueta}
            />
          ) : (
            !error && <div className="mapa" aria-busy="true" />
          )}

          {modo === "apertura" ? (
            <>
              <div className="mapa__tiempo">
                <button
                  type="button"
                  className="boton"
                  onClick={() => {
                    if (!corriendo && t >= ultimo) setT(tiempos[0]);
                    setCorriendo(!corriendo);
                  }}
                >
                  {corriendo ? "Pausar" : t >= ultimo ? "Repetir" : "Continuar"}
                </button>
                <input
                  type="range"
                  min={tiempos[0]}
                  max={ultimo}
                  value={t}
                  aria-label="Trimestre"
                  onChange={(e) => {
                    setCorriendo(false);
                    setT(Number(e.target.value));
                  }}
                />
                <p className="mapa__conteo" aria-live="polite">
                  {trimestre(t)}: {num(total)} sucursales en {num(conSucursal)} municipios
                </p>
              </div>
              <div className="leyenda">
                {CATEGORIAS.map((c) => (
                  <span key={c.nombre}>
                    <i style={{ background: c.color }} />
                    {c.nombre}
                  </span>
                ))}
                <span>
                  <i style={{ background: SIN_SUCURSAL }} />
                  Sin sucursal todavía
                </span>
              </div>
            </>
          ) : (
            <div className="leyenda">
              <span>Sucursales de banca múltiple y EACP por 10 mil adultos, 2019T1:</span>
              {CLASES_PRIVADAS.map((c) => (
                <span key={c.nombre}>
                  <i style={{ background: c.color }} />
                  {c.nombre}
                </span>
              ))}
            </div>
          )}
        </div>
        <Ficha datos={datos} idx={seleccionado} />
      </div>

      <div id="respuesta">
      <h2 className="subtitulo" style={{ marginTop: "4rem" }}>
        La respuesta corta
      </h2>
      <ul className="respuesta">
        <li>
          El banco sí llegó y abrió cuentas: <strong>+{num(primera.att, 2)} sucursales</strong> por
          cada 10 mil adultos y <strong>+{num(r.tarjetas_bb)} tarjetas</strong> de débito propias
          donde abrió.
          <span>Primera etapa en los {num(tratadas)} municipios tratados, sin tendencia previa.</span>
        </li>
        <li>
          La banca privada no se movió: <strong>{pct(privadas.pct)}</strong> en sucursales de bancos,
          cooperativas y financieras populares, con un intervalo de{" "}
          {intervalo((100 * privadas.ic90[0]) / privadas.media, (100 * privadas.ic90[1]) / privadas.media)}.
          <span>
            Se descartan efectos mayores a ±{num(privadas.cota, 1)}%: ni atracción ni desplazamiento.
          </span>
        </li>
        <li>
          Pero las cuentas no traen crédito: por cada 100 cuentas nuevas, menos de un crédito, y sus
          tarjetas se usan unas {num(r.transacciones_por_tarjeta, 1)} veces por trimestre en cajeros que
          solo sirven para retirar.
          <span>El banco funciona como pagador de programas, no como banco. Detalle en Uso.</span>
        </li>
      </ul>
      <div className="recomendacion">
        <h3>Para decidir</h3>
        <p>
          Si la meta es pagar programas y abrir cuentas, el banco cumple. Si la meta es inclusión
          financiera (crédito, ahorro, pagos) o atraer a la banca privada a los municipios sin bancos,
          abrir sucursales no basta: el banco tendría que prestar y procesar pagos, o hace falta otra
          política para atraer oferta.
        </p>
      </div>
      </div>
    </section>
  );
}
