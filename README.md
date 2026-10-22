# Aplicación web: ¿atrajo o desplazó?

Entregable E5 de Ciencia de Datos Aplicada II. Es un sitio estático que responde si la primera
sucursal del Banco del Bienestar atrajo o desplazó a la banca privada en los municipios. Está pensado
para quien tiene que decidir, no para quien quiere leer el código.

| Sección | Qué permite |
|---|---|
| Mapa | Ver la expansión 2019–2025 trimestre por trimestre, buscar un municipio y abrir su ficha: cuándo llegó el banco, si entra en la estimación y cómo se movieron sus sucursales privadas |
| Respuesta | La conclusión en tres frases y qué implica para decidir |
| Efecto | Estudio de evento de 9 resultados con tres estimadores. El veredicto se reescribe cuando se mueve el umbral de equivalencia. Incluye el efecto por cohorte, HonestDiD y los resultados fuera del sistema financiero |
| Pruebas | Otros estimadores, otros controles, fechas al azar, sin un estado a la vez, heterogeneidad, placebo y derrames |
| Laboratorio | Vuelve a estimar Callaway y Sant'Anna en el navegador con la muestra que se elija (estados, banca previa, marginación, población, grupo de control) |
| Método | Supuestos con veredicto, el camino de los datos, límites, cómo reproducir y las fuentes |

## Correr en local

Requiere Node 18 o más reciente. Los datos ya vienen en `public/datos/`, así que no hace falta R ni
Python para abrir la app:

```bash
cd app
npm ci
npm run dev        # http://localhost:5173
```

Otras órdenes: `npm test` (valida el estimador contra R), `npm run build` (sitio estático en
`dist/`) y `npm run preview` (sirve `dist/`).

## De dónde salen los datos

La app no estima nada en el servidor. Desde la raíz del proyecto, con la batería ya corrida:

```bash
make app-datos
```

Esa orden ejecuta tres pasos:

1. `datos/exportar.py` lee `outputs/tablas/` y el panel municipal y escribe los JSON de
   `public/datos/`. Las cifras de las secciones salen de ahí, nunca se copian a mano.
2. `datos/referencia_cs.R` corre `did` sin covariables con la misma muestra que la batería y guarda
   `datos/referencia_cs.csv`.
3. `npm run geo` simplifica el Marco Geoestadístico 2024 con mapshaper y lo guarda como
   `public/datos/mapa.topo.json`.

## El laboratorio y su validación

`src/lib/cs.ts` implementa Callaway y Sant'Anna sin covariables:

- ATT(g,t) con periodo base variable y, como control, los municipios que aún no abren o los que nunca
  abren;
- errores analíticos sobre la función de influencia, incluido el efecto de estimar los pesos de
  agregación;
- el efecto global θ, el estudio de evento θ(e) y la pre-prueba de Wald.

La muestra sigue las reglas de `leer_panel()`: sin ya tratados ni fechas dudosas de Banjército, con
cohortes de al menos cinco municipios y dos trimestres previos.

`src/lib/cs.test.ts` comprueba, para dos resultados y los dos grupos de control, que la muestra, cada
ATT(g,t) con su error estándar, θ, θ(e) y el p de la pre-prueba coinciden con R. La versión oficial
del trabajo es doblemente robusta, con covariables; la app la muestra junto al cálculo del laboratorio.

## Publicar

Enlace público: **https://andresaf03.github.io/banco-bienestar/**

La app se publica desde un repositorio propio,
[Andresaf03/banco-bienestar](https://github.com/Andresaf03/banco-bienestar), que contiene solo esta
carpeta: es `git subtree split --prefix app` del proyecto, que no tiene remoto. Para actualizarla,
con los cambios de `app/` ya en un commit, desde la raíz del proyecto:

```bash
git push git@github.com:Andresaf03/banco-bienestar.git "$(git subtree split --prefix app):refs/heads/main"
```

En la máquina de desarrollo `git` es `/Library/Developer/CommandLineTools/usr/bin/git`. El push
activa `.github/workflows/app.yml` del repositorio público, que corre `npm ci`, `npm test` y
`npm run build` y publica `dist/` en GitHub Pages (fuente "GitHub Actions").

El build usa rutas relativas (`base: "./"`), así que el mismo `dist/` sirve en cualquier subcarpeta.
En Vercel basta importar el repositorio público (o este con `app` como *Root Directory*): Vite se
detecta solo, `npm run build` y salida `dist`.

## Estructura

```
datos/        exportar.py · referencia_cs.R · referencia_cs.csv
public/datos/ JSON de la app y mapa.topo.json (generados)
src/lib/      cs.ts (estimador) · estadistica.ts · datos.ts · tipos.ts · mapa.ts · graficas.ts ·
              veredicto.ts · formato.ts
src/componentes/  Mapa · Ficha · Grafica (Observable Plot) · Controles
src/secciones/    Portada · Efecto · Pruebas · Laboratorio · Metodo
```

El mapa no usa teselas externas, solo los polígonos municipales, así que no requiere llaves ni
conexión a otros servicios. Las fuentes (Lora y Source Sans 3) se empaquetan con la app.
