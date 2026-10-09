# Despliegue en VPS Linux — DemoVotehub (sitio MIRADOR 2027)

DemoVotehub es un sitio **estático**: HTML, CSS, JavaScript, GeoJSON y algunos CSV. En el
VPS lo sirve **nginx**, que además reenvía `/api/` al servicio de datos
**mirador-backend** en el mismo servidor. No hace falta Node, compilación ni `serve.py`
(este último es solo para desarrollo local).

**Orden:** primero instala el backend con `mirador-backend/DEPLOY_VPS.md` (pasos 1–7),
luego sigue esta guía y al final vuelve al paso 8 del backend para la verificación.

---

## Guía del flujo

```
Navegador ── https://tu-dominio ──► nginx
                                     ├── /            → /opt/mirador/DemoVotehub   (sitio estático)
                                     ├── /api/ ...    → mirador-api 127.0.0.1:8001 (datos que se actualizan solos)
                                     └── /health      → mirador-api
mirador-scheduler (cada 12 h) ── regenera ──► mirador-backend/data/ ── la API lo sirve ──► el sitio
```

Qué pide cada vista:

| Vista | Archivos del sitio | Datos de la API |
|---|---|---|
| Vista general, Predicciones, Detalle de estado | `geojsons/estados-poligonos.geojson`, `data/padron-ln.json` | `/api/v1/agregado.csv`, `/api/v1/encuestas_clean.csv` (*) |
| Mapa de dominio | `geojsons/muni/NN.geojson`, `data/SE_GUB_*.csv`, `data/gubernaturas_manifest.json` | `/api/v1/municipios/estimacion`, `/api/v1/metodologia` |
| Preferencia estatal | `geojsons/estados-poligonos.geojson` | `/api/v1/estados`, `/api/v1/encuestas`, `/api/v1/meta` (*) |
| Alcaldías 2027 | `geojsons/muni/NN.geojson`, `data/padron-ln.json` | `/api/v1/alcaldias` |
| Metodología | — | `/api/v1/metodologia` (sin ella, la página se ve sin las cifras) |
| Encuestas (aprobación, rumbo) | — (series ilustrativas generadas en el navegador) | — |

(*) Si la API no responde, estas vistas usan las copias `data/agregado.csv` y
`data/encuestas_clean.csv` del sitio, que pueden estar desactualizadas. El Mapa de
dominio y Alcaldías necesitan la API.

**Dirección de la API.** El sitio la toma de `js/config.js` (`API_BASE`):

- En el VPS usa el **mismo dominio** (`/api/...`), así que no hay nada que configurar.
- En desarrollo local (`python serve.py`, puerto 8000) usa `http://127.0.0.1:8001`.
- Para pruebas se puede forzar con `?api=https://otro-servidor` en la URL.

---

## 1. Copiar el sitio al VPS

Destino: `/opt/mirador/DemoVotehub`.

**Opción A — git** (el proyecto tiene remoto en GitHub):

```bash
sudo git clone https://github.com/iBlastM/DemoVoteHub.git /opt/mirador/DemoVotehub
```

**Opción B — desde la PC con Windows** (PowerShell). Se excluyen archivos que el
navegador no usa: los CP por estado sin simplificar (~310 MB), el XLSX del INE y las
herramientas de generación de datos.

```powershell
cd G:\Metrix
tar -czf demovotehub.tgz --exclude=.git --exclude=.playwright-mcp --exclude=__pycache__ `
    --exclude="geojsons/[0-9][0-9]-*.geojson" --exclude="data/*.xlsx" DemoVotehub
scp demovotehub.tgz usuario@IP_DEL_VPS:/tmp/
```

```bash
sudo tar -xzf /tmp/demovotehub.tgz -C /opt/mirador
```

En ambos casos, después:

```bash
sudo chown -R root:www-data /opt/mirador/DemoVotehub
sudo find /opt/mirador/DemoVotehub -type d -exec chmod 755 {} \;
sudo find /opt/mirador/DemoVotehub -type f -exec chmod 644 {} \;
```

nginx solo necesita **leer** estos archivos. Las carpetas `gub2021/` y `deploy/` y los
scripts `.py` no se publican (el nginx los bloquea).

## 2. Configurar nginx

```bash
sudo cp /opt/mirador/DemoVotehub/deploy/nginx/mirador.conf /etc/nginx/sites-available/mirador
sudo sed -i 's/mirador.ejemplo.mx/TU-DOMINIO/' /etc/nginx/sites-available/mirador
sudo ln -s /etc/nginx/sites-available/mirador /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default        # quita la página de bienvenida de nginx
sudo nginx -t && sudo systemctl reload nginx
```

El archivo `deploy/nginx/mirador.conf` ya trae:

- **Proxy** de `/api/` y `/health` a `127.0.0.1:8001`, con un límite de 20 peticiones por segundo por IP.
- **Bloqueo** de `POST /api/v1/pipeline/run` desde fuera.
- **Compresión gzip** de GeoJSON, JSON, CSV, JS y CSS (los mapas municipales pesan varios MB).
- **Caché:** `index.html`, JS, CSS y CSV se revalidan en cada visita, así un despliegue
  se ve de inmediato. Los GeoJSON se guardan 7 días y las imágenes 30.
- **Bloqueo** de archivos de trabajo (`.py`, `.md`, `.xlsx`, `.git`, `gub2021/`, `deploy/`).

## 3. HTTPS

```bash
sudo certbot --nginx -d TU-DOMINIO
sudo systemctl status certbot.timer         # renovación automática
```

Certbot agrega el bloque `listen 443` y la redirección de HTTP a HTTPS.

Revisa también que `MIRADOR_CORS_ORIGINS` en `mirador-backend/.env` sea
`https://TU-DOMINIO`. Si lo cambias, aplica con `sudo systemctl restart mirador-api`.

## 4. Comprobar

```bash
curl -I https://TU-DOMINIO/                          # 200
curl -s https://TU-DOMINIO/health                    # {"status":"ok",...}
curl -sI https://TU-DOMINIO/geojsons/muni/22.geojson | grep -i -E 'content-type|encoding'
curl -sI https://TU-DOMINIO/build_padron.py          # 403 (no se publica)
```

En el navegador:

1. Abre `https://TU-DOMINIO/#/dominio` y espera "Cargando municipios · 17 de 17".
2. Pasa el cursor sobre un municipio: el tooltip debe mostrar la confianza y "Estimación con…".
3. Revisa `#/estatal`, `#/alcaldias` y `#/metodologia`. En Metodología deben aparecer
   las casas encuestadoras y la tabla de error del modelo.
4. En la consola del navegador (F12) no debe haber errores, salvo quizá `favicon.ico`.

---

## Actualizar el sitio

```bash
cd /opt/mirador/DemoVotehub && sudo git pull       # o copiar el tgz nuevo (paso 1, opción B)
sudo chown -R root:www-data /opt/mirador/DemoVotehub
```

No hace falta reiniciar nginx: JS y CSS se revalidan en cada visita. Si los visitantes
siguen viendo una versión vieja, basta con recargar con Ctrl+F5.

### Datos que viven en el sitio (no los genera el backend)

| Archivo | Se genera con | Cuándo |
|---|---|---|
| `data/padron-ln.json` | `python build_padron.py` (desde el XLSX del INE) | Nuevo corte de lista nominal |
| `data/SE_GUB_*.csv`, `data/gubernaturas_manifest.json` | `python -m gub2021.build` (en la PC: usa `G:\Metrix\AppBasesElectorales`) | Si se corrigen resultados históricos |
| `geojsons/cp-demo.geojson` | `python build_cp.py 0.004` | Si cambian los polígonos de CP |

Estos scripts se corren en la PC de trabajo y luego se sube el resultado. Si cambias los
`SE_GUB_*`, cópialos también a `mirador-backend/data/fuentes/gubernatura/` y sigue
"Actualizar los resultados históricos de gubernatura" en la guía del backend.

---

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| "No se pudo iniciar el visualizador" | Faltan `geojsons/` o `data/padron-ln.json`, o permisos | Revisar la copia (paso 1) y `chmod` |
| Mapa de dominio solo con estados y aviso "No se pudo cargar la estimación por municipio" | `/api/` no llega a la API | `curl https://TU-DOMINIO/api/v1/meta`; si da 502, `systemctl status mirador-api` |
| Alcaldías: "No se pudieron cargar las encuestas municipales" | Igual que la anterior | Igual que la anterior |
| Los mapas tardan mucho en cargar | Compresión desactivada | `curl -sI -H 'Accept-Encoding: gzip' .../geojsons/muni/16.geojson` debe incluir `Content-Encoding: gzip` |
| `403` en todo el sitio | nginx no puede leer `/opt/mirador/DemoVotehub` | `sudo chmod 755 /opt/mirador /opt/mirador/DemoVotehub` y el paso de permisos |
| Cambios que no se ven | Caché del navegador | Ctrl+F5 |

## Desarrollo local (sin VPS)

```bash
# terminal 1 — servicio de datos
cd mirador-backend && .venv/Scripts/python -m uvicorn mirador.api.app:app --port 8001
# terminal 2 — sitio
cd DemoVotehub && python serve.py          # http://localhost:8000
```
