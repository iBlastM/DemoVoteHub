# MIRADOR 2027 — demo tipo VoteHub (Gubernaturas de México)

Visualización **demostrativa** del pronóstico de las **17 gubernaturas** que se
eligen en México el **6 de junio de 2027**, inspirada en las vistas de
[VoteHub](https://votehub.com/). La proyección de voto por partido se calcula
a partir de **encuestas públicas reales** (Mitofsky, Enkoll, Alius, Electoralia,
Factométrica, Cripeso y Demoscopia Digital), agregadas por promedio ponderado
y suavizadas con un filtro Kalman. Las probabilidades de victoria se derivan de
una simulación Monte Carlo sobre esa proyección. El **mapa municipal**, las
**series de encuestas de opinión** (aprobación, rumbo del país) y el **mapa fino
por código postal** sí son **ilustrativos/ficticios**: no representan datos
reales, sin valor informativo oficial.

## Módulos

- **Vista general** (`#/general`): titular con la cifra clave, mapa nacional,
  franja de estadísticas, balance de fuerzas, "carreras para observar" y
  previsualización de encuestas.
- **Predicciones** (`#/predicciones`): escenarios de una simulación Monte Carlo
  (20 000 corridas), proyección de gubernaturas por fuerza con rango del 80 % y
  tabla ordenable de las 17 contiendas.
- **Encuestas** (`#/encuestas` y `#/encuestas/:id`): análisis de preguntas tipo
  "si hoy fueran las elecciones, ¿por quién votarías?", aprobación presidencial
  y rumbo del país. El detalle muestra la nube de sondeos individuales, el
  promedio ponderado en el tiempo y la banda del 90 %.
- **Mapa de dominio** (`#/dominio`): versión mexicana del mapa por casilla de
  VoteHub 2024, a pantalla completa sobre teselas Esri Gray Canvas. Muestra los
  ~690 municipios de las 17 entidades con elección (canvas, niveles de detalle,
  arrastre con inercia, rueda/pellizco, doble clic, flechas y `+`/`−`).
  - **Panel de resultados**: titular, barra de gubernaturas por fuerza,
    buscador de estados y municipios (teclado ↑ ↓ Enter) y tabla de apoyo
    estimado por fuerza que se recalcula con la selección.
  - **Selección**: clic selecciona; `⇧` + clic suma o quita; `⇧` + arrastre
    añade por recuadro y `Ctrl` + arrastre quita. `Esc` limpia.
  - **Capas**: *Margen* (intensidad por margen o probabilidad), *Ganador*,
    *Cambio* (contra el partido gobernante, o contra el voto 2021 en
    Querétaro) y *Oportunidad* (voto real 2021 por partido, Querétaro).
    Opción de **picos 3D** con altura proporcional a la lista nominal.
  - **Herramientas**: tema sistema/claro/oscuro, restablecer vista,
    perspectiva inclinada y contornos reforzados.
  - La proyección estatal viene de encuestas reales; el desglose municipal es
    **ilustrativo**: un campo espacial determinista ajustado para que la suma
    ponderada por lista nominal reproduzca exactamente la proyección estatal.
- **Detalle de estado** (`#/estado/:slug`): tendencia de intención de voto,
  proyección del día, probabilidad de victoria y encuestas del ciclo.
- **Preferencia estatal** (`#/estatal`): solo polígonos de estados, coloreados con
  el promedio ponderado de encuestas reales de gubernatura (sin desglose
  municipal). Indica qué casas encuestadoras y qué corte se usan.
- **Alcaldías 2027** (`#/alcaldias`): encuestas reales de Rubrum por municipio
  (preferencia por partido para presidencia municipal). Los municipios sin
  encuesta quedan en gris.
- Las dos vistas anteriores leen la API de `G:\Metrix\mirador-backend`
  (`deploy\run_api.bat`, puerto 8001). La gubernatura anterior (capas Cambio y
  Oportunidad del Mapa de dominio) cubre los 17 estados; en Sonora, Colima y
  Baja California Sur se muestra el voto de coalición donde el instituto no
  publicó el desglose por partido, con un aviso.

## Cómo ejecutar

> **Publicar en un servidor (VPS Linux con nginx):** ver [`DEPLOY_VPS.md`](DEPLOY_VPS.md).

La app usa módulos ES (`type="module"`) y carga los GeoJSON vía `fetch`, por lo
que **no** funciona con `file://`. Sirve la carpeta con un servidor local:

```bash
python serve.py            # http://localhost:8000
python serve.py 5500       # puerto alternativo
```

## Datos de encuestas y proyección de voto

La proyección de voto por partido en las 17 gubernaturas viene de
`data/agregado.csv`: un agregado ponderado (recencia, tamaño de muestra y
calidad de la encuestadora) con tendencia Kalman, calculado por el pipeline de
scraping en `G:\Metrix\ScrappingAgenticus` a partir de encuestas públicas
reales (Mitofsky, Enkoll, Alius, Electoralia, Factométrica, Cripeso y
Demoscopia Digital). La app carga el CSV directamente por `fetch` en
`js/data.js` (`cargarAgregado()`) y usa `tendencia_kalman` como estimación
puntual del voto; la incertidumbre de la simulación Monte Carlo se deriva de
la dispersión real (`min`/`max`/`n_encuestas`) de cada partido y estado.

Para regenerar `data/agregado.csv` con encuestas más recientes:

```bash
cd G:\Metrix\ScrappingAgenticus
python run_scrapers.py    # scraping de las encuestadoras configuradas
python clean_data.py      # limpieza y normalización
python agregador.py       # promedio ponderado + tendencia Kalman -> data/agregado.csv
```

Copia el `data/agregado.csv` resultante a este proyecto. La tabla "Encuestas del
ciclo" del detalle de cada estado usa además `data/encuestas_clean.csv` (el
detalle real por casa encuestadora, fecha y partido, generado por
`clean_data.py`): cada fila de la tabla es un sondeo público real, no una
simulación. Si un estado no tiene sondeos desagregados disponibles, la tabla
cae a una ilustración sintética alrededor del promedio real y lo indica en el
subtítulo. Copia también `data/encuestas_clean.csv` junto con `agregado.csv`
al actualizar. El mapa municipal, el mapa fino por código postal y las series
de opinión de `js/polls.js` (aprobación presidencial, rumbo del país,
identificación partidista) **no** vienen de este pipeline y siguen siendo
ilustrativos.

## Datos de municipios (códigos postales)

Los mapas finos usan `geojsons/cp-demo.geojson`: un archivo **simplificado** que
combina los polígonos de código postal de los 17 estados con elección. Se genera
a partir de los geojsons por entidad (`01-Ags.geojson` … `32-Zac.geojson`) con:

```bash
python build_cp.py 0.004   # epsilon de simplificación (grados)
```

El script aplica Ramer–Douglas–Peucker, redondea coordenadas y asigna a cada CP
un partido ganador **ficticio** de forma determinista (sesgado hacia la fuerza
líder del estado). Resultado: ~13.7k polígonos en ~5.8 MB, renderizados en
`<canvas>` con hit-testing por buffer de índice para el hover.

## Datos de padrón y lista nominal

La demo usa el archivo fuente del INE `data/Copia-de-DatosAbiertos-derfe-pdln_edms_eo_20260820.xlsx` (corte **20 de agosto de 2026**) para obtener padrón y lista nominal por entidad y municipio. No se descarga el XLSX en el navegador: se genera el agregado compacto `data/padron-ln.json` con:

```bash
python build_padron.py
```

El dataset de las 17 contiendas se cruza por clave de entidad INEGI. La lista nominal territorial se utiliza para expresar el **apoyo potencial estimado en personas**; sigue siendo una proyección ficticia y no equivale a votos emitidos. La lista nominal de residentes en el extranjero se conserva como dato separado.

El XLSX numera los municipios con la clave del INE, que no coincide con la de INEGI usada por los GeoJSON (p. ej. Monterrey es 40 en el INE y 39 en INEGI). `build_padron.py` traduce las claves con `data/mun-ine-inegi.csv`, extraído de [emagar/elecRetrns](https://github.com/emagar/elecRetrns) (`ancillary/mun.yrs.csv`, licencia MIT).

## Estructura

```
index.html            Shell de la SPA (topbar, contenedor de vistas, footer)
styles.css            Sistema de diseño (paleta, tipografía, componentes)
atlas.css             Estilos del Mapa de dominio a pantalla completa
serve.py              Servidor de desarrollo local (sin dependencias)
build_cp.py           Genera cp-demo.geojson desde los CP por entidad
geojsons/
  estados-poligonos.geojson   Polígonos de los 32 estados
  cp-demo.geojson             CP simplificados de los 17 estados (con ganador)
  NN-Xxx.geojson              CP por entidad (fuente, sin simplificar)
js/
  main.js             Arranque: carga datos, registra rutas y navega
  theme.js            Tema sistema / claro / oscuro (persistente)
  atlas.js            Motor de mapa en canvas (teselas, zoom, picking, 3D)
  router.js           Router hash minimalista
  store.js            Estado compartido
  config.js           Partidos, coaliciones, colores y umbrales
  data.js             Proyección de las 17 gubernaturas (agregado.csv real) + simulación
  polls.js            Encuestas de opinión ilustrativas (serie temporal, dispersión, banda)
  utils.js            Formato, RNG con semilla, helpers SVG
  map.js              Mapa SVG (estados) y mapa fino en canvas (CP)
  components.js       Chips, barras de probabilidad, gráficas, tablas
  views/
    general.js        Vista general
    predicciones.js   Pronóstico
    encuestas.js      Encuestas (landing + detalle)
    dominio.js        Mapa de dominio (versión mexicana del mapa VoteHub 2024)
    estado.js         Detalle de estado
```

## Notas de datos

- El dataset de estados vive en `js/data.js` (arreglo `NUCLEO`, solo metadatos
  editoriales: geo, región y partido gobernante de referencia). El voto por
  partido se carga desde `data/agregado.csv` en tiempo de ejecución; las
  encuestas de opinión (aprobación, rumbo del país) viven en `js/polls.js`
  (arreglo `SPECS`) y siguen siendo ilustrativas, derivadas de forma
  determinista con un RNG sembrado.
- Fuerzas consideradas en la proyección de voto: Morena, PAN, PRI, Movimiento
  Ciudadano, PVEM y PT.
- Para actualizar la proyección de voto, reemplaza `data/agregado.csv` con una
  nueva corrida del pipeline de scraping (ver sección anterior); para cambiar
  las encuestas de opinión ilustrativas, sustituye `construirEncuestas()` en
  `js/polls.js` por cargas desde tu propia fuente.
#   D e m o V o t e H u b  
 