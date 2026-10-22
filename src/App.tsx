import { useEffect, useState } from "react";
import { useDatos } from "./lib/datos";
import { Efecto } from "./secciones/Efecto";
import { Laboratorio } from "./secciones/Laboratorio";
import { Metodo } from "./secciones/Metodo";
import { Portada } from "./secciones/Portada";
import { Pruebas } from "./secciones/Pruebas";

const SECCIONES = [
  { id: "mapa", texto: "Mapa" },
  { id: "respuesta", texto: "Respuesta" },
  { id: "efecto", texto: "Efecto" },
  { id: "pruebas", texto: "Pruebas" },
  { id: "laboratorio", texto: "Laboratorio" },
  { id: "metodo", texto: "Método" },
];

/** Sección visible para marcarla en la navegación. */
function useSeccionActual(listo: boolean): string | null {
  const [actual, setActual] = useState<string | null>(null);
  useEffect(() => {
    if (!listo) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        const visibles = entradas.filter((e) => e.isIntersecting);
        if (visibles.length) setActual(visibles[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const s of SECCIONES) {
      const nodo = document.getElementById(s.id);
      if (nodo) obs.observe(nodo);
    }
    return () => obs.disconnect();
  }, [listo]);
  return actual;
}

export function App() {
  const estado = useDatos();
  const actual = useSeccionActual(estado.estado === "listo");

  return (
    <>
      <nav className="nav" aria-label="Secciones">
        <div className="nav__dentro">
          <a className="nav__marca" href="#inicio">
            Banco del Bienestar y banca privada
          </a>
          <div className="nav__enlaces">
            {SECCIONES.map((s) => (
              <a key={s.id} href={`#${s.id}`} aria-current={actual === s.id}>
                {s.texto}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <main>
        {estado.estado === "cargando" && <p className="cargando">Cargando datos…</p>}
        {estado.estado === "error" && (
          <p className="cargando">
            {estado.mensaje} Revisa que existan los archivos de <code>public/datos/</code> (se generan
            con <code>make app-datos</code>) y recarga la página.
          </p>
        )}
        {estado.estado === "listo" && (
          <>
            <Portada datos={estado.datos} />
            <Efecto datos={estado.datos} />
            <Pruebas datos={estado.datos} />
            <Laboratorio datos={estado.datos} />
            <Metodo datos={estado.datos} />
          </>
        )}
      </main>

      <footer className="pie">
        <p>
          Andrés Álvarez Flores. Ciencia de Datos Aplicada II, ITAM, otoño de 2026. Parte del proyecto
          de Tópicos de Política Pública II con Fernando Barba y Luis Islas. Datos públicos de la CNBV,
          el INEGI y la CONAPO.
        </p>
      </footer>
    </>
  );
}
