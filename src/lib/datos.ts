// Carga de los JSON estáticos de `public/datos/`.

import { useEffect, useState } from "react";
import type {
  Datos,
  Efecto,
  Extension,
  Heterogeneidad,
  MunicipiosArchivo,
  PanelArchivo,
  Resumen,
  Robustez,
  SucursalesArchivo,
} from "./tipos";

const BASE = `${import.meta.env.BASE_URL}datos/`;

async function json<T>(nombre: string): Promise<T> {
  const r = await fetch(`${BASE}${nombre}.json`);
  if (!r.ok) throw new Error(`No se pudo leer ${nombre}.json (HTTP ${r.status}).`);
  return (await r.json()) as T;
}

export async function cargarDatos(): Promise<Datos> {
  const [municipios, panel, sucursales, efectos, robustez, heterogeneidad, extensiones, resumen] =
    await Promise.all([
      json<MunicipiosArchivo>("municipios"),
      json<PanelArchivo>("panel"),
      json<SucursalesArchivo>("sucursales"),
      json<Efecto[]>("efectos"),
      json<Robustez>("robustez"),
      json<Heterogeneidad[]>("heterogeneidad"),
      json<Extension[]>("extensiones"),
      json<Resumen>("resumen"),
    ]);
  return { municipios, panel, sucursales, efectos, robustez, heterogeneidad, extensiones, resumen };
}

export function urlDatos(nombre: string): string {
  return `${BASE}${nombre}`;
}

export type Estado<T> = { estado: "cargando" } | { estado: "listo"; datos: T } | { estado: "error"; mensaje: string };

export function useDatos(): Estado<Datos> {
  const [estado, setEstado] = useState<Estado<Datos>>({ estado: "cargando" });
  useEffect(() => {
    let vivo = true;
    cargarDatos()
      .then((datos) => vivo && setEstado({ estado: "listo", datos }))
      .catch((e: unknown) =>
        vivo && setEstado({ estado: "error", mensaje: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}
