// Genera una Script Application de HCL DX Compose por aplicación de la suite (carpeta con index.html + suite.js +
// suite.css) en build/scriptapps. k8s/01-construir.sh las prepara para DX y k8s/05-scriptapps.sh las sube con dxclient.
//
// Variables (opcionales):
//   SUITE_API      URL del servicio REST, por defecto /suite-api
//   SUITE_PAGINAS  dónde están las páginas de DX con las aplicaciones, por defecto /wps/myportal/Home/
//   SUITE_QUIOSCO  URL del quiosco, por defecto /wps/myportal/Home/quiosco (solo usuarios autenticados)
import {mkdirSync, copyFileSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';

const API = process.env.SUITE_API || '/suite-api';
const PAGINAS = process.env.SUITE_PAGINAS || '/wps/myportal/Home/';
const QUIOSCO = process.env.SUITE_QUIOSCO || '/wps/myportal/Home/quiosco';
const CLAVE_QUIOSCO = 'quiosco-demo'; // igual que Kiosco.CLAVE

// carpeta (= nombre amigable de la página) → aplicación
const APPS = [
  ['mi-intranet', 'inicio'],
  ['fichaje', 'fichaje'],
  ['vacaciones', 'vacaciones'],
  ['gastos', 'gastos'],
  ['aprobaciones', 'aprobaciones'],
  ['quiosco', 'kiosco'],
];
const BUNDLE = 'build/scriptapp-bundle';
const DESTINO = 'build/scriptapps';
const FUENTE = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">';

function contenedor(app) {
  const kiosco = app === 'kiosco';
  return `<div class="si-app" data-app="${app}" data-api="${kiosco ? `${API}/publico` : `${API}/api`}"`
    + `${kiosco ? ` data-clave="${CLAVE_QUIOSCO}"` : ''} data-paginas="${PAGINAS}" data-quiosco="${QUIOSCO}" data-sufijo="">`
    + '<p class="si-cargando">Cargando&hellip;</p></div>';
}

rmSync(DESTINO, {recursive: true, force: true});
for (const [carpeta, app] of APPS) {
  const dir = join(DESTINO, carpeta);
  mkdirSync(dir, {recursive: true});
  copyFileSync(join(BUNDLE, 'suite.js'), join(dir, 'suite.js'));
  copyFileSync(join(BUNDLE, 'suite.css'), join(dir, 'suite.css'));
  // En DX la Script Application es un fragmento dentro de la página (no un documento HTML completo)
  writeFileSync(join(dir, 'index.html'), `<!-- ÓRBITA - ${carpeta} (Script Application para HCL DX Compose) -->\n`
    + `${FUENTE}\n<link rel="stylesheet" href="suite.css">\n${contenedor(app)}\n<script type="module" src="suite.js"></script>\n`);
}
console.log(`Script Applications en ${DESTINO} (API ${API}, páginas ${PAGINAS})`);
