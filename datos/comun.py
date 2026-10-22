"""Utilidades compartidas por los exportadores de la app (`exportar.py` y `temas.py`)."""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any

import pandas as pd

from proyecto.utils.io import TABLAS, ruta

log = logging.getLogger(__name__)

DESTINO = ruta("app", "public", "datos")


def _limpio(v: Any, d: int = 6) -> Any:
    """Número redondeado, o None si falta (JSON no admite NaN)."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    try:
        x = float(v)
    except (TypeError, ValueError):
        return v
    if not math.isfinite(x):
        return None
    return round(x, d)


def _leer(nombre: str) -> pd.DataFrame:
    archivo = TABLAS / f"{nombre}.csv"
    if not archivo.exists():
        raise FileNotFoundError(f"falta {archivo}: corre la batería antes de exportar la app")
    return pd.read_csv(archivo)


def _leer_opcional(nombre: str | None) -> pd.DataFrame | None:
    if nombre is None:
        return None
    archivo = TABLAS / f"{nombre}.csv"
    return pd.read_csv(archivo) if archivo.exists() else None


def _fila(t: pd.DataFrame, **filtro: str) -> pd.Series:
    sel = t
    for col, val in filtro.items():
        sel = sel[sel[col] == val]
    if len(sel) != 1:
        raise ValueError(f"se esperaba una fila para {filtro}, hay {len(sel)}")
    return sel.iloc[0]


def _registros(df: pd.DataFrame, columnas: dict[str, str], d: int = 6) -> list[dict]:
    """DataFrame → lista de dicts con nombres cortos y números limpios."""
    return [
        {corto: _limpio(fila[largo], d) for largo, corto in columnas.items()}
        for _, fila in df.iterrows()
    ]


def _guardar(nombre: str, datos: Any) -> Path:
    DESTINO.mkdir(parents=True, exist_ok=True)
    destino = DESTINO / f"{nombre}.json"
    destino.write_text(
        json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    log.info("%s (%.0f KB)", destino.relative_to(ruta()), destino.stat().st_size / 1024)
    return destino


def _veredicto(pre_falla: bool, nulo: bool, p: float | None) -> str:
    """Lectura de un resultado con la regla preregistrada (pre-prueba, equivalencia, p)."""
    if pre_falla:
        return "reprueba la pre-prueba"
    if nulo:
        return "nulo informativo"
    if p is not None and math.isfinite(p) and p < 0.05:
        return "efecto"
    return "no informativo"
