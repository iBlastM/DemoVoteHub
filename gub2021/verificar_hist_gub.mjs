// Prueba de js/hist_gub.js con un fetch simulado que lee de DemoVotehub/ (sin navegador).
// Uso: node gub2021/verificar_hist_gub.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async (url) => {
  const p = path.join(root, url);
  if (!fs.existsSync(p)) return { ok: false, status: 404 };
  const buf = fs.readFileSync(p, 'utf8');
  return { ok: true, status: 200, text: async () => buf, json: async () => JSON.parse(buf) };
};

const { loadManifest, loadHistGub, avisosGub, PARTIDOS_BASE } = await import(pathToFileURL(path.join(root, 'js/hist_gub.js')).href);
const manifest = await loadManifest();
let fallos = 0;
for (const cve of Object.keys(manifest).sort((a, b) => a - b)) {
  const meta = manifest[cve];
  const r = await loadHistGub(cve);
  const avisos = avisosGub(meta).map((a) => a.tipo).join(',') || '-';
  if (!r) { console.log(cve.padStart(2), meta.archivo.padEnd(22), 'SIN MUNICIPIOS', '| avisos:', avisos); continue; }
  const ks = Object.keys(r.muni);
  const votos = ks.reduce((a, k) => a + r.muni[k].votos, 0);
  const nom = ks.reduce((a, k) => a + r.muni[k].nominal, 0);
  const base = PARTIDOS_BASE.map((p) => ks.reduce((a, k) => a + (r.muni[k].partidos[p] || 0), 0));
  console.log(cve.padStart(2), meta.archivo.padEnd(22), 'mun', String(ks.length).padStart(3), 'votos', votos, 'LN', nom,
    'part', (votos / nom).toFixed(3), '| base', base.join('/'), '| avisos:', avisos);
  if (!ks.length || !votos || !nom) fallos++;
}
console.log(fallos ? `FALLOS: ${fallos}` : 'OK');
process.exit(fallos ? 1 : 0);
