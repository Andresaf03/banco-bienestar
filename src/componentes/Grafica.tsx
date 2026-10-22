import * as Plot from "@observablehq/plot";
import { useEffect, useRef, useState } from "react";

// Envoltura de Observable Plot: dibuja al ancho del contenedor y vuelve a dibujar al cambiar el
// ancho o las opciones. `opciones` recibe el ancho disponible.

interface Props {
  opciones: (ancho: number) => Plot.PlotOptions;
  descripcion: string;
  alto?: number;
}

export const TINTA = "#000000";
export const GRIS = "#5b6270";
export const LINEA = "#e3e6eb";
export const AZUL = "#0b5fff";
export const AZUL_BANDA = "#e3ecff";
export const AZUL_CLARO = "#a9c4ff";

/** Estilo común: ejes y rejilla discretos, tipografía del cuerpo. */
export const ESTILO: Partial<Plot.PlotOptions> = {
  style: { fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: GRIS, background: "transparent" },
  marginLeft: 52,
  marginBottom: 40,
};

export function Grafica({ opciones, descripcion, alto }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const obs = new ResizeObserver(([entrada]) => setAncho(Math.floor(entrada.contentRect.width)));
    obs.observe(nodo);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo || ancho === 0) return;
    const figura = Plot.plot({ ...ESTILO, ...opciones(ancho), width: ancho, ...(alto ? { height: alto } : {}) });
    figura.setAttribute("role", "img");
    figura.setAttribute("aria-label", descripcion);
    nodo.replaceChildren(figura);
    return () => figura.remove();
  }, [ancho, opciones, descripcion, alto]);

  return <div ref={ref} className="grafica" />;
}
