"""Datos de la aplicación web (JSON estático en `app/public/datos/`).

Uso (desde la raíz del repo):
    uv run python app/datos/exportar.py

No estima nada: lee el panel municipal, el tratamiento y las tablas de la batería
(`outputs/tablas/`) y escribe archivos pequeños que la app carga en el navegador. Así el sitio
se construye y se publica sin acceso a `data/` (que no se versiona).

Salidas:
  - municipios.json: un registro por municipio (clave, nombre, estado, cohorte, covariables).
  - panel.json: resultados por municipio y trimestre 2019T1–2024T4, en columnas, para el mapa y
    para el laboratorio (que vuelve a estimar CS en el navegador).
  - sucursales.json: sucursales del Banco del Bienestar por municipio y trimestre 2019T1–2025T4
    (línea de tiempo del mapa).
  - efectos.json: cifra de cabecera, estudio de evento por estimador, efecto por cohorte y
    HonestDiD de cada resultado financiero.
  - robustez.json, heterogeneidad.json, extensiones.json y resumen.json.
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any

import pandas as pd

from proyecto.utils.io import INTERIM, PROCESSED, TABLAS, parametros, ruta

log = logging.getLogger(__name__)

DESTINO = ruta("app", "public", "datos")
VENTANA = (1, 24)  # 2019T1–2024T4, la ventana preregistrada del bloque financiero
VENTANA_MAPA = (1, 28)  # la línea de tiempo del mapa llega a 2025T4

# Resultados del laboratorio y del mapa: columna del panel → clave corta en panel.json.
PANEL = {
    "sucursales_privado_pc": "privado",
    "sucursales_bm_pc": "bm",
    "sucursales_eacp_pc": "eacp",
    "sucursales_total_pc": "total",
}

# Resultados financieros de la sección "El efecto". `cs`: sufijo de cs_agg_municipio_trim_esc_*;
# `apilado`, `twfe`, `honest`: sufijos de apilado_evento_*, fase4_evento_twfe_* y
# rob_honest_municipio_trim_esc_* (None si no existe).
EFECTOS = [
    dict(
        clave="privado",
        variante="principal",
        resultado="sucursales_privado_pc",
        nombre="Sucursales privadas",
        grupo="Banca privada",
        detalle="Banca múltiple más cooperativas y financieras populares (EACP)",
        unidad="sucursales por 10 mil adultos",
        cs="sucursales_privado_pc",
        apilado="sucursales_privado_pc",
        twfe="sucursales_privado_pc",
        honest="sucursales_privado_pc",
    ),
    dict(
        clave="bm",
        variante="principal",
        resultado="sucursales_bm_pc",
        nombre="Sucursales de banca múltiple",
        grupo="Banca privada",
        detalle="Bancos comerciales",
        unidad="sucursales por 10 mil adultos",
        cs="sucursales_bm_pc",
        apilado="sucursales_bm_pc",
        twfe="sucursales_bm_pc",
        honest="sucursales_bm_pc",
    ),
    dict(
        clave="eacp",
        variante="principal",
        resultado="sucursales_eacp_pc",
        nombre="Sucursales de EACP",
        grupo="Banca privada",
        detalle="Cooperativas (SOCAP) y financieras populares (SOFIPO)",
        unidad="sucursales por 10 mil adultos",
        cs="sucursales_eacp_pc",
        apilado="sucursales_eacp_pc",
        twfe="sucursales_eacp_pc",
        honest="sucursales_eacp_pc",
    ),
    dict(
        clave="captacion",
        variante="panel_corto",
        resultado="captacion_privado_pc",
        nombre="Contratos de captación privados",
        grupo="Banca privada",
        detalle="Cuentas de banca múltiple y EACP; por sector solo desde 2022T4",
        unidad="contratos por 10 mil adultos",
        cs="panel_corto_captacion_privado_pc",
        apilado=None,
        twfe=None,
        honest=None,
    ),
    dict(
        clave="credito",
        variante="panel_corto",
        resultado="credito_privado_pc",
        nombre="Contratos de crédito privados",
        grupo="Banca privada",
        detalle="Créditos de banca múltiple y EACP; por sector solo desde 2022T4",
        unidad="contratos por 10 mil adultos",
        cs="panel_corto_credito_privado_pc",
        apilado=None,
        twfe=None,
        honest=None,
    ),
    dict(
        clave="ahorro_eacp",
        variante="eacp",
        resultado="capt_ahorro_eacp_pc",
        nombre="Captación de ahorro de EACP",
        grupo="Banca privada",
        detalle="Cuentas de ahorro en cooperativas y financieras populares",
        unidad="contratos por 10 mil adultos",
        cs="eacp_capt_ahorro_eacp_pc",
        apilado="capt_ahorro_eacp_pc",
        twfe=None,
        honest="eacp_capt_ahorro_eacp_pc",
    ),
    dict(
        clave="consumo_eacp",
        variante="eacp",
        resultado="cred_consumo_eacp_pc",
        nombre="Crédito al consumo de EACP",
        grupo="Banca privada",
        detalle="Reprueba la pre-prueba en el DiD apilado: descriptivo",
        unidad="contratos por 10 mil adultos",
        cs="eacp_cred_consumo_eacp_pc",
        apilado="cred_consumo_eacp_pc",
        twfe=None,
        honest="eacp_cred_consumo_eacp_pc",
    ),
    dict(
        clave="total",
        variante="primera_etapa",
        resultado="sucursales_total_pc",
        nombre="Sucursales totales",
        grupo="Primera etapa",
        detalle="Incluye al Banco del Bienestar: ¿el tratamiento cambió algo?",
        unidad="sucursales por 10 mil adultos",
        cs="primera_etapa_sucursales_total_pc",
        apilado="sucursales_total_pc",
        twfe="sucursales_total_pc",
        honest=None,
    ),
    dict(
        clave="tarjetas_bb",
        variante="primera_etapa",
        resultado="tarjetas_debito_bd_pc",
        nombre="Tarjetas de débito del banco",
        grupo="Primera etapa",
        detalle="Del Banco del Bienestar; por sector solo desde 2022T4",
        unidad="tarjetas por 10 mil adultos",
        cs="primera_etapa_tarjetas_debito_bd_pc",
        apilado=None,
        twfe=None,
        honest=None,
    ),
]

# Lectura del proyecto que la regla mecánica no captura (CLAUDE.md §5.bis, diseños alternativos).
NOTAS = {
    "DENUE": "Sube el padrón en la actualización censal de 2024, pero sin dosis, igual en las "
    "vecinas a 0–2 km y sin reflejo en los Censos Económicos: medición, no efecto de la sucursal.",
}

# Resultados de sucursales por sector → clave corta de la app.
CLAVE_RESULTADO = {
    "sucursales_privado_pc": "privado",
    "sucursales_bm_pc": "bm",
    "sucursales_eacp_pc": "eacp",
}

HETEROGENEIDAD = {
    "desierto_bancario": {"0": "Con banca múltiple en 2019", "1": "Sin banca múltiple en 2019"},
    "grado_marginacion_2020": None,  # los grupos ya vienen con nombre
    "tamano_localidad": None,
}

# Extensiones del trabajo final: (archivo, panel, variante, resultado) → nombre y fuente.
EXTENSIONES = [
    (
        "tabla_final",
        "localidad",
        "principal",
        "estab_emprendimiento_pc",
        "Establecimientos por mil habitantes",
        "DENUE",
    ),
    (
        "tabla_final",
        "localidad",
        "principal",
        "empleo_est_emprendimiento_pc",
        "Empleo estimado en establecimientos",
        "DENUE",
    ),
    ("tabla_final", "localidad", "principal", "estab_consumo_pc", "Comercio y alimentos", "DENUE"),
    ("tabla_final", "municipio_ce", "ce", "ue_pc", "Unidades económicas", "Censos Económicos"),
    (
        "tabla_final",
        "municipio_ce",
        "ce",
        "personal_ocupado_pc",
        "Personal ocupado",
        "Censos Económicos",
    ),
    ("tabla_final", "municipio_trim", "imss", "log_salario_diario", "Salario diario", "IMSS"),
    ("tabla_final", "municipio_trim", "imss", "ta_pc", "Puestos de trabajo afiliados", "IMSS"),
    (
        "fase2_resumen",
        "municipio_eic",
        "eic",
        "pct_negocio",
        "Hogares con negocio propio",
        "Encuesta Intercensal y Censo",
    ),
    (
        "fase2_resumen",
        "municipio_eic",
        "eic",
        "pct_ocupacion",
        "Población ocupada",
        "Encuesta Intercensal y Censo",
    ),
    (
        "fase2_resumen",
        "municipio_eic",
        "eic",
        "log_ingreso_trabajo",
        "Ingreso por trabajo",
        "Encuesta Intercensal y Censo",
    ),
    (
        "fase2_resumen",
        "localidad_viirs",
        "viirs",
        "log1p_luz_1km",
        "Luz nocturna a 1 km",
        "Satélite VIIRS",
    ),
    (
        "fase3_resumen",
        "municipio_delitos",
        "delitos",
        "tasa_robo_total",
        "Robos denunciados",
        "SESNSP",
    ),
    (
        "fase3_resumen",
        "municipio_delitos",
        "delitos",
        "tasa_robo_negocio",
        "Robos a negocio denunciados",
        "SESNSP",
    ),
    (
        "fase3_resumen",
        "municipio_delitos",
        "delitos",
        "tasa_homicidio_doloso",
        "Homicidios dolosos",
        "SESNSP",
    ),
    (
        "fase3_resumen",
        "municipio_elecciones",
        "elecciones",
        "pct_participacion",
        "Participación electoral",
        "INE",
    ),
    (
        "fase3_resumen",
        "municipio_elecciones",
        "elecciones",
        "pct_bloque_gobierno",
        "Voto por el bloque de gobierno",
        "INE",
    ),
]


# --- Utilidades -------------------------------------------------------------------------------


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


# --- Municipios y panel ------------------------------------------------------------------------


def municipios() -> tuple[list[dict], pd.DataFrame]:
    panel = pd.read_parquet(PROCESSED / "panel_municipio_trim.parquet")
    base = panel.drop_duplicates("cve_mun").set_index("cve_mun")
    nombres = pd.read_parquet(INTERIM / "municipios.parquet").set_index("cve_mun")
    registros = []
    for cve, fila in base.sort_index().iterrows():
        n = nombres.loc[cve] if cve in nombres.index else None
        registros.append(
            {
                "c": cve,
                "n": None if n is None else n["nom_mun"],
                "e": cve[:2],
                "G": int(fila["G"]),
                "pob": _limpio(fila["poblacion_2020"], 0),
                "mg": None
                if pd.isna(fila["grado_marginacion_2020"])
                else str(fila["grado_marginacion_2020"]),
                "im": _limpio(fila["indice_marginacion_2020"], 3),
                "des": bool(fila["desierto_bancario"]),
                "ya": bool(fila["ya_tratado_inicio"]),
                "sos": bool(fila["sospechoso_banjercito"]),
            }
        )
    return registros, panel


def panel_json(panel: pd.DataFrame, ids: list[str]) -> dict:
    """Resultados por municipio y trimestre en columnas: vars[clave][i * T + (t - 1)]."""
    sub = panel[panel["t"].between(*VENTANA)]
    periodos = sorted(sub["t"].unique())
    etiquetas = sub.drop_duplicates("t").set_index("t")["periodo"].to_dict()
    ancho = sub.pivot(index="cve_mun", columns="t")
    salida: dict[str, list] = {}
    for columna, clave in PANEL.items():
        tabla = ancho[columna].reindex(index=ids, columns=periodos)
        salida[clave] = [_limpio(v, 6) for v in tabla.to_numpy().ravel()]
    return {
        "t": [int(t) for t in periodos],
        "periodos": [etiquetas[t] for t in periodos],
        "vars": salida,
    }


def sucursales_json(ids: list[str]) -> dict:
    suc = pd.read_parquet(INTERIM / "sucursales_bienestar.parquet")
    suc = suc[suc["t"].between(*VENTANA_MAPA)]
    periodos = sorted(suc["t"].unique())
    etiquetas = suc.drop_duplicates("t").set_index("t")["periodo"].to_dict()
    ancho = suc.pivot_table(index="cve_mun", columns="t", values="suc_bienestar", aggfunc="sum")
    ancho = ancho.reindex(index=ids, columns=periodos)
    valores = [None if pd.isna(v) else int(round(v)) for v in ancho.to_numpy().ravel()]
    return {
        "t": [int(t) for t in periodos],
        "periodos": [etiquetas[t] for t in periodos],
        "n": valores,
    }


def estados() -> dict[str, str]:
    m = pd.read_parquet(INTERIM / "municipios.parquet", columns=["cve_ent", "nom_ent"])
    return dict(sorted(m.drop_duplicates("cve_ent").itertuples(index=False, name=None)))


def poligonos() -> dict[str, str]:
    """Polígonos del Marco Geoestadístico cuya clave no es la del panel (municipios nuevos)."""
    cruce = pd.read_parquet(
        INTERIM / "crosswalk_municipios.parquet", columns=["cve_mun", "cve_estable"]
    )
    distintos = cruce[cruce["cve_mun"] != cruce["cve_estable"]]
    return dict(distintos.itertuples(index=False, name=None))


# --- Efectos -----------------------------------------------------------------------------------


def _cabecera(r: pd.Series) -> dict:
    return {
        "att": _limpio(r["valor"]),
        "ee": _limpio(r["ee"]),
        "ic90": [_limpio(r["ic90_bajo"]), _limpio(r["ic90_alto"])],
        "media": _limpio(r["media_base"]),
        "pct": _limpio(r["efecto_pct"], 3),
        "cota": _limpio(r["cota_equivalencia_pct"], 3),
        "mde80": _limpio(r["mde80_pct"], 3),
        "p": _limpio(r["p"]),
        "p_rw": _limpio(r.get("p_rw")),
        "wald_p": _limpio(r["pre_wald_p"]),
        "nulo": bool(r["nulo_informativo"]),
        "tratadas": int(r["n_tratadas"]),
        "controles": int(r["n_controles"]),
    }


def _evento_cs(sufijo: str) -> tuple[list[dict], list[dict]]:
    d = _leer(f"cs_agg_municipio_trim_esc_{sufijo}")
    din = d[d["tipo"] == "dynamic"].copy()
    din["e"] = din["termino"].astype(int)
    din = din.sort_values("e")
    grupo = d[d["tipo"] == "group"].copy()
    grupo["g"] = grupo["termino"].astype(int)
    return (
        _registros(din, {"e": "e", "valor": "att", "ee": "ee", "ic_bajo": "lo", "ic_alto": "hi"}),
        _registros(
            grupo.sort_values("g"),
            {"g": "g", "valor": "att", "ee": "ee", "ic_bajo": "lo", "ic_alto": "hi"},
        ),
    )


def _evento_simple(nombre: str | None) -> list[dict] | None:
    d = _leer_opcional(nombre)
    if d is None:
        return None
    if "controles" in d.columns:  # apilado: la especificación principal usa los controles limpios
        d = d[d["controles"].str.startswith("limpios")]
    d = d.sort_values("e")
    return [
        {
            "e": int(f.e),
            "att": _limpio(f.att),
            "ee": _limpio(f.ee),
            "lo": _limpio(f.att - 1.96 * f.ee),
            "hi": _limpio(f.att + 1.96 * f.ee),
        }
        for f in d.itertuples()
    ]


def _honest(sufijo: str | None) -> list[dict] | None:
    d = _leer_opcional(None if sufijo is None else f"rob_honest_municipio_trim_esc_{sufijo}")
    if d is None:
        return None
    d = d[d["Delta"] == "DeltaRM"].sort_values("Mbar")
    return _registros(d, {"Mbar": "m", "lb": "lo", "ub": "hi"})


def efectos() -> list[dict]:
    t = _leer("tabla_final")
    apilado = _leer("apilado_resumen")
    apilado = apilado[apilado["controles"].str.startswith("limpios")]
    salida = []
    for cfg in EFECTOS:
        r = _fila(t, variante=cfg["variante"], panel="municipio_trim", resultado=cfg["resultado"])
        dinamico, por_cohorte = _evento_cs(cfg["cs"])
        estimadores = {"cs": dinamico}
        apl = _evento_simple(cfg["apilado"] and f"apilado_evento_{cfg['apilado']}")
        if apl:
            estimadores["apilado"] = apl
        twfe = _evento_simple(cfg["twfe"] and f"fase4_evento_twfe_{cfg['twfe']}")
        if twfe:
            estimadores["twfe"] = twfe
        resumen_apilado = apilado[apilado["resultado"] == cfg["resultado"]]
        salida.append(
            {
                "clave": cfg["clave"],
                "nombre": cfg["nombre"],
                "grupo": cfg["grupo"],
                "detalle": cfg["detalle"],
                "unidad": cfg["unidad"],
                "cabecera": _cabecera(r),
                "apilado": None
                if resumen_apilado.empty
                else {
                    "pct": _limpio(resumen_apilado.iloc[0]["efecto_pct"], 3),
                    "cota": _limpio(resumen_apilado.iloc[0]["cota_equivalencia_pct"], 3),
                    "wald_p": _limpio(resumen_apilado.iloc[0]["pre_wald_p"]),
                },
                "evento": estimadores,
                "cohortes": por_cohorte,
                "honest": _honest(cfg["honest"]),
            }
        )
    return salida


# --- Robustez, heterogeneidad y extensiones ----------------------------------------------------


def robustez() -> dict:
    est = _leer("fase4_estimadores")
    est = est[est["resultado"].isin(CLAVE_RESULTADO)].copy()
    est["r"] = est["resultado"].map(CLAVE_RESULTADO)
    # En esta tabla el IC al 90% ya viene en % de la media previa.
    est["lo"] = est["ic90_bajo"]
    est["hi"] = est["ic90_alto"]
    perm = _fila(_leer("fase4_permutacion"), resultado="sucursales_privado_pc")
    dist = _leer("fase4_permutacion_distribucion")
    sin_estado = _leer("fase4_sin_un_estado")
    sin_estado = sin_estado[sin_estado["resultado"] == "sucursales_privado_pc"].copy()
    sin_estado["e"] = sin_estado["variante"].str.replace("sin ", "", regex=False)
    sin_estado["pct"] = 100 * sin_estado["att"] / sin_estado["media_base"]
    sin_estado["lo"] = (
        100 * (sin_estado["att"] - 1.645 * sin_estado["ee"]) / sin_estado["media_base"]
    )
    sin_estado["hi"] = (
        100 * (sin_estado["att"] + 1.645 * sin_estado["ee"]) / sin_estado["media_base"]
    )
    validez = _leer("fase4_validez")
    placebo = validez[validez["variante"] == "A2_placebo"]
    placebo = placebo[placebo["resultado"] == "sucursales_privado_pc"].iloc[0]
    vecinos = validez[validez["variante"] == "A1b"]
    vecinos = vecinos[vecinos["resultado"] == "sucursales_privado_pc"].iloc[0]
    controles = _leer("fase4_controles")
    controles = controles[controles["resultado"].isin(CLAVE_RESULTADO)].copy()
    controles["r"] = controles["resultado"].map(CLAVE_RESULTADO)
    controles["pct"] = 100 * controles["att"] / controles["media_base"]
    controles["lo"] = 100 * (controles["att"] - 1.645 * controles["ee"]) / controles["media_base"]
    controles["hi"] = 100 * (controles["att"] + 1.645 * controles["ee"]) / controles["media_base"]
    honest_sd = _leer("fase4_honest_sd")
    honest_sd = honest_sd[honest_sd["resultado"] == "sucursales_privado_pc"]
    return {
        "estimadores": _registros(
            est,
            {"r": "r", "estimador": "est", "efecto_pct": "pct", "lo": "lo", "hi": "hi"},
            3,
        ),
        "permutacion": {
            "observado": _limpio(perm["att_observado"]),
            "p": _limpio(perm["p_permutacion"], 3),
            "n": int(perm["permutaciones"]),
            "distribucion": [_limpio(v) for v in dist["att"]],
        },
        "sin_estado": _registros(sin_estado, {"e": "e", "pct": "pct", "lo": "lo", "hi": "hi"}, 3),
        "placebo": {
            "pct": _limpio(100 * placebo["valor"] / placebo["media_base"], 3),
            "lo": _limpio(
                100 * (placebo["valor"] - 1.645 * placebo["ee"]) / placebo["media_base"], 3
            ),
            "hi": _limpio(
                100 * (placebo["valor"] + 1.645 * placebo["ee"]) / placebo["media_base"], 3
            ),
            "wald_p": _limpio(placebo["pre_wald_p"]),
        },
        "vecinos": {
            "pct": _limpio(100 * vecinos["valor"] / vecinos["media_base"], 3),
            "lo": _limpio(
                100 * (vecinos["valor"] - 1.645 * vecinos["ee"]) / vecinos["media_base"], 3
            ),
            "hi": _limpio(
                100 * (vecinos["valor"] + 1.645 * vecinos["ee"]) / vecinos["media_base"], 3
            ),
            "tratadas": int(vecinos["n_tratadas"]),
            "controles": int(vecinos["n_controles"]),
        },
        "controles": _registros(
            controles,
            {
                "r": "r",
                "variante": "v",
                "tratadas": "tratadas",
                "controles": "controles",
                "pct": "pct",
                "lo": "lo",
                "hi": "hi",
            },
            3,
        ),
        "honest_sd": _registros(honest_sd, {"M": "m", "lb_pct": "lo", "ub_pct": "hi"}, 3),
    }


def heterogeneidad() -> list[dict]:
    salida = []
    for clave, resultado in [
        ("privado", "sucursales_privado_pc"),
        ("bm", "sucursales_bm_pc"),
        ("eacp", "sucursales_eacp_pc"),
    ]:
        for dimension, nombres in HETEROGENEIDAD.items():
            d = _leer_opcional(f"het_municipio_trim_esc_{resultado}_{dimension}")
            if d is None:
                continue
            for f in d.itertuples():
                grupo = str(f.grupo)
                salida.append(
                    {
                        "r": clave,
                        "dim": dimension,
                        "grupo": nombres.get(grupo, grupo) if nombres else grupo,
                        "tratadas": int(f.tratadas),
                        "unidades": int(f.unidades),
                        "pct": _limpio(100 * f.att / f.media_base, 3),
                        "lo": _limpio(100 * (f.att - 1.645 * f.ee) / f.media_base, 3),
                        "hi": _limpio(100 * (f.att + 1.645 * f.ee) / f.media_base, 3),
                        "p_dif": _limpio(getattr(f, "p_dif", None)),
                    }
                )
    return salida


def extensiones() -> list[dict]:
    tablas = {n: _leer(n) for n in {e[0] for e in EXTENSIONES}}
    salida = []
    for archivo, panel, variante, resultado, nombre, fuente in EXTENSIONES:
        nota = NOTAS.get(fuente)
        r = _fila(tablas[archivo], panel=panel, variante=variante, resultado=resultado)
        pre_falla = bool(r["pre_falla"]) if "pre_falla" in r else bool(r["pre_wald_p"] < 0.05)
        escala = 1 if str(resultado).startswith(("log", "log1p")) else abs(r["media_base"])
        salida.append(
            {
                "nombre": nombre,
                "fuente": fuente,
                "pct": _limpio(r["efecto_pct"], 3),
                "lo": _limpio(100 * (r["valor"] - 1.645 * r["ee"]) / escala, 3),
                "hi": _limpio(100 * (r["valor"] + 1.645 * r["ee"]) / escala, 3),
                "lectura": _veredicto(pre_falla, bool(r["nulo_informativo"]), _limpio(r["p"])),
                "nota": nota,
            }
        )
    return salida


def resumen(muni: list[dict], panel: pd.DataFrame) -> dict:
    suc = pd.read_parquet(
        INTERIM / "sucursales_bienestar.parquet", columns=["periodo", "suc_bienestar"]
    )
    totales = suc.groupby("periodo")["suc_bienestar"].sum()
    m19 = panel[panel["t"] == 1]
    banc = _leer("fase4_bancarizacion")
    tarjetas = _fila(banc, resultado="tarjetas_debito_bb_pc", estimador="Callaway y Sant'Anna")
    # Transacciones por tarjeta en los cajeros del banco: mediana del primer al undécimo trimestre
    # después de abrir (descriptivo de la fase 4).
    tx = _leer("fase4_desc_transacciones_por_tarjeta")
    tx = tx[tx["e"].between(1, 11)]["transacciones_por_tarjeta"].median()
    return {
        "sucursales_2019": int(totales.loc["2019Q1"]),
        "sucursales_2024": int(totales.loc["2024Q4"]),
        "municipios": len(muni),
        "sin_bm_2019": int((m19["sucursales_bm"] == 0).sum()),
        "tarjetas_bb": _limpio(tarjetas["valor"], 1),
        "tarjetas_bb_ee": _limpio(tarjetas["ee"], 1),
        "transacciones_por_tarjeta": _limpio(tx, 2),
        "sesoi": float(parametros()["estimacion"]["sesoi_pct"]),
        "min_cohorte": int(parametros()["estimacion"]["min_cohorte"]),
    }


def generar() -> None:
    muni, panel = municipios()
    ids = [m["c"] for m in muni]
    _guardar("municipios", {"estados": estados(), "poligonos": poligonos(), "municipios": muni})
    _guardar("panel", panel_json(panel, ids))
    _guardar("sucursales", sucursales_json(ids))
    _guardar("efectos", efectos())
    _guardar("robustez", robustez())
    _guardar("heterogeneidad", heterogeneidad())
    _guardar("extensiones", extensiones())
    _guardar("resumen", resumen(muni, panel))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    generar()
