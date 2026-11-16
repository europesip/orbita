// ÓRBITA · Genera el manual ilustrado en PDF (español e inglés) a partir de manual.es.html y manual.en.html.
//   node docs/manual/fuente/generar.mjs            (desde la raíz del repositorio; necesita Google Chrome o Chromium)
// 1. Saca los iconos de las aplicaciones de web/src/marca.jsx (los mismos que ven los usuarios) a img/app-*.svg.
// 2. Imprime cada HTML a PDF con Chrome sin interfaz: docs/manual/orbita-explicada.es.pdf y orbita-explained.en.pdf.
// Las capturas de pantalla (img/*.es.jpg, img/*.en.jpg) las hace capturas.mjs contra un DX con ÓRBITA y la demo.
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../../..');

// ---- 1. Iconos
const marca = readFileSync(join(RAIZ, 'web/src/marca.jsx'), 'utf8');
const bloque = marca.slice(marca.indexOf('const DIBUJO_APP = {'), marca.indexOf('\n};', marca.indexOf('const DIBUJO_APP = {')));
const iconos = {};
for (const m of bloque.matchAll(/^\s+([a-z]+): <>(.*)<\/>,\s*$/gm)) iconos[m[1]] = m[2];
const svg = (dibujo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1">`
  + '<stop offset="0" stop-color="#0b5fff"/><stop offset=".55" stop-color="#004ad7"/><stop offset="1" stop-color="#004ad7"/></linearGradient></defs>'
  + '<rect width="64" height="64" rx="16" fill="url(#f)"/><circle cx="11" cy="12" r="1" fill="#fff" opacity=".6"/><circle cx="54" cy="53" r=".9" fill="#fff" opacity=".45"/>'
  + '<ellipse cx="32" cy="32" rx="27" ry="10" transform="rotate(-25 32 32)" fill="none" stroke="#fff" stroke-width="1.6" stroke-opacity=".22"/>'
  + `<g fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${dibujo.replace(/strokeWidth/g, 'stroke-width')}</g>`
  + '<circle cx="54.3" cy="21.6" r="3.1" fill="#4b9bff" stroke="#fff" stroke-width="1.2"/></svg>';
for (const [k, v] of Object.entries(iconos)) writeFileSync(join(AQUI, 'img', `app-${k}.svg`), svg(v));
console.log(`iconos: ${Object.keys(iconos).join(', ')}`);

// ---- 2. PDF
const chrome = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
  .find((c) => { try { execFileSync('which', [c], {stdio: 'ignore'}); return true; } catch { return existsSync(c); } });
if (!chrome) { console.error('No encuentro Chrome: pon su ruta en la variable CHROME'); process.exit(1); }
for (const [idioma, salida] of [['es', 'orbita-explicada.es.pdf'], ['en', 'orbita-explained.en.pdf']]) {
  const pdf = join(RAIZ, 'docs/manual', salida);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=8000', `--print-to-pdf=${pdf}`, pathToFileURL(join(AQUI, `manual.${idioma}.html`)).href], {stdio: 'ignore'});
  console.log(`${idioma}: ${pdf}`);
}
