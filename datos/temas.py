"""Secciones de la app más allá del efecto principal: uso de las cuentas, otros temas y covariables.

Lo llama `exportar.py`; cada función devuelve el contenido de un JSON de `app/public/datos/`:
  - uso(): ¿se usan las cuentas del banco? Estimaciones exploratorias de la fase 5
    (`analisis/14_uso.R`), series nacionales de la banca de desarrollo y del Portafolio, y el uso
    privado (fase 4).
  - temas(): emprendimiento, empleo e informalidad, violencia, política y hogares, con su efecto y
    su estudio de evento.
  - covariables(): qué se ajusta, el balance por cohorte antes y después de reponderar y el
    emparejamiento.
"""

from __future__ import annotations

import pandas as pd
from comun import _fila, _leer, _leer_opcional, _limpio, _registros, _veredicto

from proyecto.construccion.panel import mapa_crosswalk
from proyecto.utils.io import INTERIM, PROCESSED

BANCO = "037166"  # Banco del Bienestar en el Portafolio de la CNBV
TIPOS_PORTAFOLIO = {"34": "transacciones", "38": "tarjetas", "33": "cajeros", "44": "solo_retiros"}

# ------------------------------------------------------------------------------------------ uso


def _evento(etiqueta: str, ventana: tuple[int, int] | None = None) -> list[dict]:
    d = _leer_opcional(f"cs_agg_{etiqueta}")
    if d is None:
        return []
    d = d[d["tipo"] == "dynamic"].copy()
    d["e"] = d["termino"].astype(int)
    if ventana:
        d = d[d["e"].between(*ventana)]
    return _registros(
        d.sort_values("e"), {"e": "e", "valor": "att", "ee": "ee", "ic_bajo": "lo", "ic_alto": "hi"}
    )


def _series_banca_desarrollo() -> list[dict]:
    """Contratos de captación y crédito por trimestre, banca de desarrollo (solo el banco: sin los
    municipios con Banjército) y banca múltiple en los mismos municipios."""
    p = pd.read_parquet(
        PROCESSED / "panel_municipio_uso.parquet",
        columns=[
            "cve_mun",
            "periodo",
            "t",
            "con_banjercito",
            "capt_total_bd",
            "cred_total_bd",
            "capt_n2_bd",
            "capt_n4_bd",
            "tarjetas_debito_bd",
        ],
    )
    p = p[(~p["con_banjercito"]) & (p["t"] >= 16)]
    sin_bj = set(p["cve_mun"])
    banco = p.groupby("periodo")[
        ["capt_total_bd", "cred_total_bd", "capt_n2_bd", "capt_n4_bd", "tarjetas_debito_bd"]
    ].sum(min_count=1)
    b = pd.read_parquet(
        INTERIM / "cnbv_bdif.parquet", columns=["cve_mun", "periodo", "sector", "variable", "valor"]
    )
    bm = b[
        (b["sector"] == "banca_multiple") & b["variable"].isin(["capt_total", "cred_total"])
    ].copy()
    # Claves estables, como en el panel: los municipios nuevos se suman a su municipio de origen.
    bm["cve_mun"] = bm["cve_mun"].map(mapa_crosswalk()).fillna(bm["cve_mun"])
    bm = bm[bm["cve_mun"].isin(sin_bj) & bm["periodo"].isin(banco.index)]
    bm = bm.pivot_table(index="periodo", columns="variable", values="valor", aggfunc="sum")
    salida = []
    for periodo, f in banco.iterrows():
        salida.append(
            {
                "periodo": periodo,
                "capt": _limpio(f["capt_total_bd"], 0),
                "cred": _limpio(f["cred_total_bd"], 0),
                "n2": _limpio(f["capt_n2_bd"], 0),
                "n4": _limpio(f["capt_n4_bd"], 0),
                "tarjetas": _limpio(f["tarjetas_debito_bd"], 0),
                "capt_bm": _limpio(bm.loc[periodo, "capt_total"], 0)
                if periodo in bm.index
                else None,
                "cred_bm": _limpio(bm.loc[periodo, "cred_total"], 0)
                if periodo in bm.index
                else None,
            }
        )
    return salida


def _portafolio_banco() -> dict:
    """Tarjetas, transacciones y cajeros del banco por mes (todo el país, Portafolio CNBV)."""
    m = pd.read_parquet(
        INTERIM / "cnbv_portafolio_modelo.parquet",
        columns=["yyyymm", "institucion", "tipo", "valor"],
    )
    m = m[(m["institucion"] == BANCO) & m["tipo"].astype(str).isin(TIPOS_PORTAFOLIO)]
    m["serie"] = m["tipo"].astype(str).map(TIPOS_PORTAFOLIO)
    mes = m.pivot_table(index="yyyymm", columns="serie", values="valor", aggfunc="sum").sort_index()
    mes = mes[mes["tarjetas"] > 0]
    ultimo = mes.iloc[-1]
    tipos_banco = set(
        pd.read_parquet(INTERIM / "cnbv_portafolio_modelo.parquet", columns=["institucion", "tipo"])
        .query("institucion == @BANCO")["tipo"]
        .astype(str)
    )
    return {
        "mensual": [
            {
                "mes": str(k),
                "tarjetas": _limpio(f["tarjetas"], 0),
                "transacciones": _limpio(f["transacciones"], 0),
                "por_tarjeta": _limpio(f["transacciones"] / f["tarjetas"], 3),
            }
            for k, f in mes.iterrows()
        ],
        "ultimo_mes": str(mes.index[-1]),
        "cajeros": _limpio(ultimo.get("cajeros"), 0),
        "cajeros_solo_retiros": _limpio(ultimo.get("solo_retiros"), 0),
        # Tipos 32 (tarjeta de crédito) y 35 (terminales punto de venta): el banco no los reporta.
        "tiene_tarjeta_credito": "32" in tipos_banco,
        "tiene_tpv": "35" in tipos_banco,
    }


def _estimacion(r: pd.Series) -> dict:
    return {
        "att": _limpio(r["valor"], 3),
        "ee": _limpio(r["ee"], 3),
        "lo": _limpio(r["valor"] - 1.645 * r["ee"], 3),
        "hi": _limpio(r["valor"] + 1.645 * r["ee"], 3),
        "media": _limpio(r["media_base"], 3),
        "wald_p": _limpio(r["pre_wald_p"], 4),
        "tratadas": int(r["n_tratadas"]),
        "controles": int(r["n_controles"]),
    }


def uso() -> dict:
    resumen = _leer("uso_resumen")
    estimaciones = {}
    for r in resumen.itertuples():
        fila = resumen[resumen["resultado"] == r.resultado].iloc[0]
        estimaciones[r.resultado] = {**_estimacion(fila), "evento": _evento(r.etiqueta)}
    banc = _leer("fase4_bancarizacion")
    cajero = _fila(banc, resultado="transacciones_cajero_bb_pc", estimador="Callaway y Sant'Anna")
    privado = _leer("fase4_uso")
    tdc = _fila(privado, resultado="tarjetas_credito_bm_pc", variante="C4")
    por_tarjeta = _leer("fase4_desc_transacciones_por_tarjeta")
    return {
        "estimaciones": estimaciones,
        "transacciones_cajero": _estimacion(cajero),
        "tarjetas_credito_bm": {
            "pct": _limpio(100 * tdc["valor"] / tdc["media_base"], 2),
            "lo": _limpio(100 * (tdc["valor"] - 1.645 * tdc["ee"]) / tdc["media_base"], 2),
            "hi": _limpio(100 * (tdc["valor"] + 1.645 * tdc["ee"]) / tdc["media_base"], 2),
            "wald_p": _limpio(tdc["pre_wald_p"], 3),
        },
        "por_tarjeta_evento": _registros(
            por_tarjeta, {"e": "e", "transacciones_por_tarjeta": "v", "municipios": "n"}, 3
        ),
        "banca_desarrollo": _series_banca_desarrollo(),
        "portafolio": _portafolio_banco(),
    }


# ---------------------------------------------------------------------------------------- temas

# (archivo, panel, variante, resultado, nombre, fuente, unidad del evento)
TEMAS = {
    "emprendimiento": [
        (
            "tabla_final",
            "municipio_ce",
            "ce",
            "ue_pc",
            "Unidades económicas",
            "Censos Económicos",
            "censos",
        ),
        (
            "tabla_final",
            "municipio_ce",
            "ce",
            "personal_ocupado_pc",
            "Personal ocupado",
            "Censos Económicos",
            "censos",
        ),
        (
            "fase2_resumen",
            "municipio_eic",
            "eic",
            "pct_negocio",
            "Hogares con negocio propio",
            "Intercensal y Censo",
            "levantamientos",
        ),
        (
            "fase2_resumen",
            "municipio_eic",
            "eic",
            "pct_empleador",
            "Personas empleadoras",
            "Intercensal y Censo",
            "levantamientos",
        ),
        (
            "fase2_resumen",
            "municipio_enoe",
            "enoe",
            "pct_negocio",
            "Ocupados con negocio propio",
            "ENOE",
            "trimestres",
        ),
    ],
    "empleo": [
        (
            "fase2_resumen",
            "municipio_enoe",
            "enoe",
            "pct_informal",
            "Ocupados en la informalidad",
            "ENOE",
            "trimestres",
        ),
        (
            "fase2_resumen",
            "municipio_enoe",
            "enoe",
            "pct_ocupacion",
            "Población ocupada",
            "ENOE",
            "trimestres",
        ),
        (
            "tabla_final",
            "municipio_trim",
            "imss",
            "ta_pc",
            "Puestos de trabajo formales",
            "IMSS",
            "trimestres",
        ),
        (
            "tabla_final",
            "municipio_trim",
            "imss",
            "log_salario_diario",
            "Salario diario formal",
            "IMSS",
            "trimestres",
        ),
        (
            "fase2_resumen",
            "municipio_eic",
            "eic",
            "pct_cuenta_propia",
            "Trabajo por cuenta propia",
            "Intercensal y Censo",
            "levantamientos",
        ),
    ],
    "violencia": [
        (
            "fase3_resumen",
            "municipio_delitos",
            "delitos",
            "tasa_robo_total",
            "Robos",
            "SESNSP",
            "trimestres",
        ),
        (
            "fase3_resumen",
            "municipio_delitos",
            "delitos",
            "tasa_robo_negocio",
            "Robo a negocio",
            "SESNSP",
            "trimestres",
        ),
        (
            "fase3_resumen",
            "municipio_delitos",
            "delitos",
            "tasa_robo_transeunte",
            "Robo a transeúnte",
            "SESNSP",
            "trimestres",
        ),
        (
            "fase3_resumen",
            "municipio_delitos",
            "delitos",
            "tasa_extorsion",
            "Extorsión",
            "SESNSP",
            "trimestres",
        ),
        (
            "fase3_resumen",
            "municipio_delitos",
            "delitos",
            "tasa_homicidio_doloso",
            "Homicidio doloso",
            "SESNSP",
            "trimestres",
        ),
        (
            "fase3_resumen",
            "municipio_delitos",
            "delitos",
            "tasa_dano_propiedad",
            "Daño a la propiedad (placebo de denuncia)",
            "SESNSP",
            "trimestres",
        ),
    ],
    "politica": [
        (
            "fase3_resumen",
            "municipio_elecciones",
            "elecciones",
            "pct_participacion",
            "Participación electoral",
            "INE",
            "elecciones",
        ),
        (
            "fase3_resumen",
            "municipio_elecciones",
            "elecciones",
            "pct_bloque_gobierno",
            "Voto por el bloque de gobierno",
            "INE",
            "elecciones",
        ),
        (
            "fase3_resumen",
            "municipio_elecciones",
            "elecciones",
            "pct_nulos",
            "Votos nulos",
            "INE",
            "elecciones",
        ),
    ],
    "hogares": [
        (
            "fase2_resumen",
            "municipio_eic",
            "eic",
            "pct_hog_programas",
            "Hogares que reciben programas",
            "Intercensal y Censo",
            "levantamientos",
        ),
        (
            "fase2_resumen",
            "municipio_eic",
            "eic",
            "pct_hog_remesas",
            "Hogares que reciben remesas",
            "Intercensal y Censo",
            "levantamientos",
        ),
        (
            "fase2_resumen",
            "localidad_viirs",
            "viirs",
            "log1p_luz_1km",
            "Luz nocturna a 1 km",
            "Satélite VIIRS",
            "años",
        ),
        (
            "fase2_resumen",
            "municipio_efipem",
            "efipem",
            "log_impuestos_pc",
            "Impuestos municipales",
            "EFIPEM",
            "años",
        ),
    ],
}


def _unidad(resultado: str) -> str:
    """Unidad del estudio de evento según la familia del resultado."""
    if resultado.startswith("log"):
        return "diferencia en logaritmos"
    if resultado.startswith("pct_"):
        return "puntos porcentuales"
    if resultado.startswith("tasa_"):
        return "por 100 mil habitantes"
    if resultado in ("ue_pc", "personal_ocupado_pc"):
        return "por mil habitantes"
    return "por 10 mil adultos"


LECTURAS = {
    "descriptivo (pre-prueba falla)": "reprueba la pre-prueba",
    "nulo informativo": "nulo informativo",
    "no informativo": "no informativo",
}


def _lectura(r: pd.Series) -> str:
    if "lectura" in r and isinstance(r["lectura"], str):
        texto = r["lectura"]
        if texto.startswith("significativo sin corrección"):
            return "significativo sin corrección múltiple"
        return LECTURAS.get(texto, texto)
    return _veredicto(bool(r["pre_wald_p"] < 0.05), bool(r["nulo_informativo"]), _limpio(r["p"]))


def temas() -> dict:
    tablas = {n: _leer(n) for n in ("tabla_final", "fase2_resumen", "fase3_resumen")}
    salida: dict[str, list[dict]] = {}
    for tema, filas in TEMAS.items():
        salida[tema] = []
        for archivo, panel, variante, resultado, nombre, fuente, paso in filas:
            r = _fila(tablas[archivo], panel=panel, variante=variante, resultado=resultado)
            escala = 1 if resultado.startswith("log") else abs(r["media_base"])
            ventana = (-12, 11) if paso == "trimestres" else None
            salida[tema].append(
                {
                    "nombre": nombre,
                    "fuente": fuente,
                    "paso": paso,
                    "log": resultado.startswith("log"),
                    "unidad": _unidad(resultado),
                    "pct": _limpio(r["efecto_pct"], 3),
                    "lo": _limpio(100 * (r["valor"] - 1.645 * r["ee"]) / escala, 3),
                    "hi": _limpio(100 * (r["valor"] + 1.645 * r["ee"]) / escala, 3),
                    "att": _limpio(r["valor"], 4),
                    "media": _limpio(r["media_base"], 4),
                    "wald_p": _limpio(r["pre_wald_p"], 4),
                    "tratadas": int(r["n_tratadas"]),
                    "controles": int(r["n_controles"]),
                    "lectura": _lectura(r),
                    "evento": _evento(r["etiqueta"], ventana),
                }
            )
    salida["denue"] = _denue()
    return salida


def _denue() -> list[dict]:
    """Efecto en el padrón del DENUE por distancia a la sucursal (decaimiento espacial)."""
    d = _leer("decaimiento_estab_emprendimiento_pc")
    d = d[d["banda"].notna() & (d["banda"].astype(str) != "")]
    return [
        {
            "banda": str(f.banda),
            "pct": _limpio(f.efecto_pct, 3),
            "lo": _limpio(100 * (f.att - 1.645 * f.ee) / f.media_base, 3),
            "hi": _limpio(100 * (f.att + 1.645 * f.ee) / f.media_base, 3),
            "wald_p": _limpio(f.pre_wald_p, 4),
            "tratadas": int(f.tratadas),
        }
        for f in d.itertuples()
    ]


# ---------------------------------------------------------------------------------- covariables


def covariables() -> dict:
    grupos = _leer("desc_balance_municipio_trim_sucursales_privado_pc")
    soporte = _leer("desc_soporte_comun")
    soporte = soporte[soporte["cohorte"].notna()]
    controles = _leer("fase4_controles")
    pareados = _fila(
        controles,
        resultado="sucursales_privado_pc",
        variante="H1d nunca tratados emparejados (PS 1:1, región)",
    )
    return {
        "grupos": _registros(
            grupos,
            {
                "grupo": "grupo",
                "unidades": "unidades",
                "resultado_base": "privadas",
                "poblacion_2020": "poblacion",
                "indice_marginacion_2020": "marginacion",
                "banca_mun_2019": "banca",
            },
            3,
        ),
        "cohortes": _registros(
            soporte,
            {
                "cohorte": "g",
                "tratadas": "tratadas",
                "controles": "controles",
                "auc": "auc",
                "fuera_soporte": "fuera",
                "dif_max_bruta": "bruta",
                "dif_max_ponderada": "ponderada",
                "peor_covariable": "peor",
            },
            3,
        ),
        "emparejados": {
            "tratadas": int(pareados["tratadas"]),
            "controles": int(pareados["controles"]),
            "pct": _limpio(100 * pareados["att"] / pareados["media_base"], 3),
            "lo": _limpio(
                100 * (pareados["att"] - 1.645 * pareados["ee"]) / pareados["media_base"], 3
            ),
            "hi": _limpio(
                100 * (pareados["att"] + 1.645 * pareados["ee"]) / pareados["media_base"], 3
            ),
        },
    }
