# referencia_cs.R — Referencia en R para validar el laboratorio de la app.
#
# Uso (desde la raíz del repo):
#   Rscript app/datos/referencia_cs.R
#
# El laboratorio de la app vuelve a estimar Callaway y Sant'Anna en el navegador, **sin
# covariables** (con covariables el estimador DR necesita un logit y una regresión por cada
# ATT(g,t), y la app no los replica). Este script corre `did` con la misma muestra que la batería
# (`leer_panel("municipio_trim")`), `xformla = ~1`, aún no tratados como control, periodo base
# variable y errores analíticos, y guarda ATT(g,t), el efecto global θ (agregación por cohorte) y
# θ(e), y el p de la pre-prueba de la batería. `app/src/lib/cs.test.ts` compara la versión en
# TypeScript contra este archivo.
#
# Salida: app/datos/referencia_cs.csv, en formato largo (se versiona; solo cambia si cambia el
# panel): una fila por ATT(g,t) (`tipo = attgt`), por θ(e) (`dinamico`), el θ global (`theta`)
# y una por municipio de la muestra (`id`), para comprobar que la app usa la misma.

source(here::here("analisis", "00_utils.R"))
source(here::here("analisis", "02_cs_did.R"))  # prueba_previa()

RESULTADOS <- c("sucursales_privado_pc", "sucursales_total_pc")
CONTROLES <- c("notyettreated", "nevertreated")
DESTINO <- here::here("app", "datos", "referencia_cs.csv")

referencia <- function(resultado, control) {
  dt <- leer_panel("municipio_trim", resultado = resultado)
  fit <- did::att_gt(
    yname = resultado, tname = "tiempo", idname = "id", gname = "G", xformla = ~1,
    data = as.data.frame(dt), panel = TRUE, allow_unbalanced_panel = FALSE,
    control_group = control, anticipation = 0, est_method = "reg", base_period = "varying",
    bstrap = FALSE, cband = FALSE, print_details = FALSE
  )
  grupo <- did::aggte(fit, type = "group", na.rm = TRUE, bstrap = FALSE)
  dinamico <- did::aggte(fit, type = "dynamic", na.rm = TRUE, bstrap = FALSE)
  previa <- prueba_previa(fit, dt, dinamico)
  rbindlist(list(
    data.table(tipo = "attgt", g = fit$group, t = fit$t, att = fit$att, se = fit$se),
    data.table(tipo = "dinamico", e = dinamico$egt, att = dinamico$att.egt, se = dinamico$se.egt),
    data.table(tipo = "theta", att = grupo$overall.att, se = grupo$overall.se),
    # Pre-prueba de la batería (Wald de todos los θ(e) previos): `att` guarda el p.
    data.table(tipo = "wald_p", e = previa$n, att = previa$wald_p),
    data.table(tipo = "id", id = sort(unique(dt$cve_mun)))
  ), fill = TRUE)[, `:=`(resultado = resultado, control = control)]
}

salida <- rbindlist(lapply(RESULTADOS, function(y) {
  rbindlist(lapply(CONTROLES, function(c) referencia(y, c)))
}), fill = TRUE)
setcolorder(salida, c("resultado", "control", "tipo", "g", "t", "e", "id", "att", "se"))
fwrite(salida, DESTINO)
message("referencia en ", DESTINO)
