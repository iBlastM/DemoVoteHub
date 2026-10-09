// Prueba: usa el parseCSV real de js/hist2021.js sobre cada base nueva (sin fetch).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'G:/Metrix/DemoVotehub';
const src = fs.readFileSync(`${root}/js/hist2021.js`, 'utf8')
  .replace("import { slugify } from './utils.js';", `import { slugify } from '${pathToFileURL(root + '/js/utils.js').href}';`)
  .replace("export async function loadHist2021", "async function _unused");
const tmp = path.join(root, 'js', '_tmp_hist_test.mjs');
fs.writeFileSync(tmp, src + '\nexport { parseCSV };\n');
const { parseCSV } = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

const files = fs.readdirSync(`${root}/data`).filter((f) => /^SE_GUB_[A-Z]+_\d{4}\.csv$/.test(f)).sort();
for (const f of ['Gubernatura_2021.csv', ...files]) {
  const text = fs.readFileSync(`${root}/data/${f}`, 'utf8');
  const lines = text.trim().split(/\r?\n/);
  const n = lines[0].split(',').length;
  const malas = lines.filter((l) => l.split(',').length !== n).length;
  const m = parseCSV(text);
  const keys = Object.keys(m);
  const votos = keys.reduce((a, k) => a + m[k].votos, 0);
  const nom = keys.reduce((a, k) => a + m[k].nominal, 0);
  const morena = keys.reduce((a, k) => a + (m[k].partidos.MORENA || 0), 0);
  console.log(f.padEnd(22), 'cols', n, 'filas con #cols distinto:', malas, 'municipios', keys.length, 'votos', votos, 'nominal', nom, 'MORENA(col)', morena);
}
