// Genera una Script Application de HCL DX por aplicación de ÓRBITA en build/scriptapps/<carpeta>/ (index.html +
// orbita.js + orbita.css), a partir del paquete de Vite (build/bundle). La imagen orbita-scriptapps las lleva en /app y
// el chart las sube a WCM con DXClient (subchart hcl-dx-scriptapp).
//
// Variable (opcional): ORBITA_API, base de la API REST en el host de DX (por defecto /orbita-api/v1).
// Lo demás (páginas del portal, clave del quiosco) no va aquí: lo da la API en GET /config.
import {copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';

const API = process.env.ORBITA_API || '/orbita-api/v1';
const BUNDLE = 'build/bundle';
const DESTINO = 'build/scriptapps';
// carpeta (= nombre amigable de la página en DX) → aplicación (data-app)
const APPS = [
  ['mi-intranet', 'inicio'],
  ['fichaje', 'fichaje'],
  ['vacaciones', 'vacaciones'],
  ['gastos', 'gastos'],
  ['aprobaciones', 'aprobaciones'],
  ['quiosco', 'kiosco'],
  ['comunicacion', 'comunicacion'],
];
const FUENTE = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">';

// WCM interpreta "[$..." (también "[ $...") como una etiqueta suya y la BORRA al servir el fichero: "[$,H]=useState()"
// o `[${e}]` quedarían rotos. Se escriben con escapes equivalentes:
//   `[${  ->  `\x5b${   (al empezar una plantilla de texto: \x5b es "[" y ${ sigue siendo una sustitución)
//   [$    ->  [$   (en el resto: $ es "$" en identificadores, cadenas y expresiones regulares)
const js = readFileSync(join(BUNDLE, 'orbita.js'), 'utf8').replace(/`\[\$\{/g, '`\\x5b${').replace(/\[\$/g, '[\\u0024');
if (/\[ *\$/.test(js)) throw new Error('orbita.js todavía contiene "[$", que WCM eliminaría');
const css = readFileSync(join(BUNDLE, 'orbita.css'), 'utf8');
if (/\[ *\$/.test(css)) throw new Error('orbita.css contiene "[$", que WCM eliminaría');
writeFileSync(join(BUNDLE, 'orbita.wcm.mjs'), js);
execFileSync(process.execPath, ['--check', join(BUNDLE, 'orbita.wcm.mjs')], {stdio: 'inherit'});   // sigue siendo JavaScript válido

rmSync(DESTINO, {recursive: true, force: true});
for (const [carpeta, app] of APPS) {
  const dir = join(DESTINO, carpeta);
  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'orbita.js'), js);
  copyFileSync(join(BUNDLE, 'orbita.css'), join(dir, 'orbita.css'));
  // En DX la Script Application es un fragmento dentro de la página (no un documento HTML completo). data-ns: DX
  // cambia __SPNS__ por el espacio de nombres de esta instancia (ns_Z7_..._), con el que la app encuentra su
  // ns_..._spHelper (preferencias de la instancia, que se editan en el modo edición de la página)
  writeFileSync(join(dir, 'index.html'), `<!-- ÓRBITA · ${carpeta} (Script Application de HCL DX) -->\n`
    + `${FUENTE}\n<link rel="stylesheet" href="orbita.css">\n`
    + `<div class="si-app" data-app="${app}" data-api="${API}" data-ns="__SPNS__"><p class="si-cargando">Cargando&hellip;</p></div>\n`
    + '<script type="module" src="orbita.js"></script>\n');
}
console.log(`Script Applications en ${DESTINO}: ${APPS.map((a) => a[0]).join(', ')} (API ${API})`);
