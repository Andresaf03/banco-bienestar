import type { ReactNode } from "react";

// Controles pequeños con el mismo aspecto en toda la app.

interface Opcion<T extends string> {
  valor: T;
  texto: string;
  deshabilitada?: boolean;
}

export function Segmentado<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambio,
}: {
  etiqueta: string;
  opciones: Opcion<T>[];
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <div className="control" role="group" aria-label={etiqueta}>
      <span>{etiqueta}</span>
      <div className="segmentado">
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={o.valor === valor}
            disabled={o.deshabilitada}
            onClick={() => onCambio(o.valor)}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Selector({
  etiqueta,
  valor,
  onCambio,
  children,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="control">
      <span>{etiqueta}</span>
      <select value={valor} onChange={(e) => onCambio(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

export function Deslizador({
  etiqueta,
  valor,
  min,
  max,
  paso,
  texto,
  onCambio,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  texto: string;
  onCambio: (v: number) => void;
}) {
  return (
    <label className="control">
      <span>
        {etiqueta}: <b style={{ color: "var(--tinta)", fontWeight: 600 }}>{texto}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onCambio(Number(e.target.value))}
      />
    </label>
  );
}
