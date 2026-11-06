// ÓRBITA · example theme for the ÓRBITA pages (see after-push.sh). Runs in the DXClient container (/dxclient), after
// the push, with DXClient already configured. Idempotent.
//   node tema.mjs <tema.json> <assets dir>
//
//  1. DAM: collection (theme.damCollection) with the company logo, the HCL Software logo and the ÓRBITA icon, readable
//     by everybody. An image already there is kept: to change the company logo, upload a new version of it in the DAM.
//  2. Copies the static files of the base theme (Portal 8.5) from the DX WebDAV and changes only the header of its
//     theme*.html: the logos from the DAM, "powered by HCL Software" and a button that opens the ÓRBITA assistant.
//     HCL's theme files are not part of ÓRBITA: they are copied from your own DX at install time.
//  3. Registers the theme (a copy of the base theme registration, exported with XMLAccess) and uploads it with
//     `dxclient deploy-theme`. paginas.mjs then assigns it to the ÓRBITA pages only.
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

const [cfgFile, assetsDir] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'));
if (!cfg.enabled) { console.log('theme: not deployed (theme.enabled=false)'); process.exit(0); }

const e = process.env;
const BASE = `${e.DX_PROTOCOL}://${e.DX_HOST}:${e.DX_PORT}`;
const DAM = `${BASE}/dx/api/dam/v1`, CORE = `${BASE}/dx/api/core/v1`;
const DAV = `${BASE}${e.DX_CONTENT_HANDLER_PATH || '/wps/mycontenthandler'}/dav/fs-type1/themes`;
const WORK = '/tmp/orbita-theme';
const log = (m) => console.log(`theme: ${m}`);
const fail = (m) => { console.error(`theme: ERROR ${m}`); process.exit(1); };

// ---- Session (LtpaToken2), the same DX administrator as the push
let cookie = '';
async function login() {
  const r = await fetch(`${CORE}/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username: e.DX_USERNAME, password: e.DX_PASSWORD})});
  if (!r.ok) fail(`DX login answered ${r.status}`);
  cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
async function call(method, url, body, headers = {}) {
  const r = await fetch(url, {method, headers: {Cookie: cookie, ...headers}, body});
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return {status: r.status, ok: r.ok, json, text};
}
const json = (o) => ({body: JSON.stringify(o), headers: {'Content-Type': 'application/json'}});

// ---- 1. DAM
async function coleccion(nombre) {
  const r = await call('GET', `${DAM}/collections?query=${encodeURIComponent(nombre)}&limit=100`);
  let c = r.ok && (r.json.contents || []).find((x) => x.name === nombre);
  if (!c) {
    const j = json({name: nombre, description: 'ÓRBITA theme images (logos). Replace the company logo with a new version.'});
    const n = await call('POST', `${DAM}/collections`, j.body, j.headers);
    if (!n.ok) fail(`cannot create the DAM collection "${nombre}" (${n.status}): ${n.text.slice(0, 200)}`);
    c = n.json;
    log(`DAM collection "${nombre}" created`);
  }
  // Readable by everybody (they are logos): anonymous and all authenticated users get the User role.
  // Granting it again answers an error that is ignored.
  const rid = encodeURIComponent(c.accessreferenceid);
  await call('POST', `${CORE}/access/principals?resourceId=${rid}&roleName=User`);
  const p = json({permissionList: [{distinguishedName: 'all authenticated portal users'}]});
  await call('POST', `${CORE}/access/permissions?resourceId=${rid}&roleName=User&type=virtual`, p.body, p.headers);
  return c.id;
}

async function imagen(cid, fichero) {
  const items = await call('GET', `${DAM}/collections/${cid}/items?limit=200`);
  let item = items.ok && (items.json.contents || []).find((x) => x.name === fichero);
  if (!item) {
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(join(assetsDir, fichero))], {type: 'image/png'}), fichero);
    fd.append('name', fichero);
    const r = await call('POST', `${DAM}/collections/${cid}/items`, fd);
    if (!r.ok || !r.json || !r.json.mediaInfo) fail(`cannot upload ${fichero} to the DAM (${r.status}): ${r.text.slice(0, 200)}`);
    item = r.json.mediaInfo;
    log(`DAM: ${fichero} uploaded`);
  }
  // The renditions are generated after the upload: wait for the original one
  for (let i = 0; i < 60; i++) {
    const r = await call('GET', `${DAM}/collections/${cid}/items/${item.id}/renditions`);
    const o = r.ok && (r.json.contents || []).find((x) => x.renditionType === 'Original' && x.binaryUrl);
    if (o) return `/dx/api/dam/v1${o.binaryUrl}`;
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  return fail(`the DAM did not create the original rendition of ${fichero}`);
}

// ---- 2. Copy of the base theme (WebDAV)
async function listar(ruta) {
  const r = await fetch(`${DAV}/${ruta}`, {method: 'PROPFIND', headers: {Cookie: cookie, Depth: '1'}});
  if (r.status !== 207 && !r.ok) fail(`WebDAV PROPFIND ${ruta} answered ${r.status}`);
  const xml = await r.text();
  const hrefs = [...xml.matchAll(/<(?:[a-zA-Z]+:)?href>([^<]+)<\/(?:[a-zA-Z]+:)?href>/g)].map((m) => decodeURIComponent(m[1]));
  const raiz = `/dav/fs-type1/themes/${ruta}`;
  return hrefs.map((h) => h.slice(h.indexOf('/dav/fs-type1/themes/'))).filter((h) => h.startsWith(raiz) && h !== raiz)
    .map((h) => h.slice('/dav/fs-type1/themes/'.length));
}
async function copiar(origen) {
  const pendientes = [`${origen}/`], ficheros = [];
  while (pendientes.length) {
    const carpeta = pendientes.shift();
    for (const h of await listar(carpeta)) (h.endsWith('/') ? pendientes : ficheros).push(h);
  }
  let n = 0;
  const trabajo = async () => {
    for (let f; (f = ficheros.shift());) {
      const r = await fetch(`${DAV}/${f.split('/').map(encodeURIComponent).join('/')}`, {headers: {Cookie: cookie}});
      if (!r.ok) fail(`WebDAV GET ${f} answered ${r.status}`);
      const destino = join(WORK, f.slice(origen.length + 1));
      mkdirSync(dirname(destino), {recursive: true});
      writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
      n++;
    }
  };
  await Promise.all(Array.from({length: 8}, trabajo));
  return n;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cabecera(html, fichero, url) {
  const es = /_es\.html$/.test(fichero);
  const estilo = `<style id="orbita-theme">
.wpthemeHeader{background:${cfg.headerBackground}!important}
.wpthemeHeader .wpthemeInner{display:flex;align-items:center;flex-wrap:wrap;gap:16px 24px}
.wpthemeLogo.orbitaThemeMarca{display:flex!important;align-items:center;gap:20px;background:none!important;width:auto!important;height:auto!important;margin:10px 0!important;float:none!important}
.orbitaThemeLogo img{height:44px;width:auto;display:block}
.orbitaThemeHcl{display:flex;align-items:center;gap:10px;padding-left:20px;border-left:1px solid rgba(255,255,255,.3);color:#c7d2fe;font:600 11px/1 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}
.orbitaThemeHcl img{height:15px;width:auto;filter:brightness(0) invert(1)}
.orbitaThemeChat{display:none;margin-left:auto;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.1);color:#fff;border-radius:999px;padding:5px 16px 5px 5px;font:600 14px/1 Arial,sans-serif;cursor:pointer}
html.orbita-asistente .orbitaThemeChat{display:inline-flex}
.orbitaThemeChat:hover,.orbitaThemeChat:focus-visible{background:rgba(255,255,255,.2)}
.orbitaThemeChat img{width:30px;height:30px;border-radius:9px;display:block}
</style>`;
  const titulo = es ? 'Pregúntale a ÓRBITA' : 'Ask ÓRBITA';
  const marca = `<div class="wpthemeLogo wpthemeLeft orbitaThemeMarca">
						<a class="orbitaThemeLogo" href="${esc(cfg.homeUrl)}"><img src="${esc(url.logo)}" alt="${esc(cfg.logoAlt)}"></a>${cfg.hclLogo ? `
						<span class="orbitaThemeHcl"><span>Powered by</span><img src="${esc(url.hcl)}" alt="HCL Software"></span>` : ''}
					</div>`;
  const boton = cfg.assistantButton ? `
					<button type="button" class="orbitaThemeChat" title="${titulo}" aria-label="${titulo}" onclick="window.dispatchEvent(new CustomEvent('orbita:asistente'))"><img src="${esc(url.icono)}" alt=""><span>${titulo}</span></button>` : '';
  let h = html;
  if (!h.includes('id="orbita-theme"')) h = h.replace('</head>', `${estilo}\n</head>`);
  h = h.replace(/<div class="wpthemeLogo wpthemeLeft[^"]*">[\s\S]*?<\/div>/, marca);
  const nav = '<a rel="dynamic-content" href="dyn-cs:id:85theme_topNav"></a>';
  if (boton && h.includes(nav) && !h.includes('orbitaThemeChat"')) h = h.replace(nav, nav + boton);
  return h;
}

// ---- 3. Registration (XMLAccess) and deploy-theme
function xmlaccess(peticion, salida) {
  writeFileSync('/tmp/orbita-theme-req.xml', peticion);
  let out = '';
  try {
    out = execFileSync('./bin/dxclient', ['xmlaccess', '--xmlFile', '/tmp/orbita-theme-req.xml', '--xmlAccessOutputFileName', salida],
      {stdio: 'pipe', encoding: 'utf8'});
  } catch (err) { out = `${err.stdout || ''}${err.stderr || ''}`; }
  try {
    return readFileSync(`store/outputFiles/xmlaccess/${salida}`, 'utf8');
  } catch {
    console.error(out.split('\n').filter((l) => l.trim()).slice(-12).join('\n'));
    return '';
  }
}

function registro() {
  const exp = xmlaccess(`<?xml version="1.0" encoding="UTF-8"?>
<request xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="PortalConfig_8.5.0.xsd" type="export">
  <portal action="locate"><theme action="export" uniquename="${esc(cfg.baseUniqueName)}"/></portal>
</request>`, 'orbita-theme-base.xml');
  if (!/<theme [^>]*uniquename=/.test(exp) || !exp.includes('<status element="all" result="ok"/>')) {
    fail(`cannot export the base theme ${cfg.baseUniqueName}`);
  }
  // The whole exported request (it locates the skins the theme refers to), with: a new object ID and unique name, not
  // the default theme, our WebDAV folder, editable, titles in English and Spanish only (DXClient fails on the import
  // with the 30 exported languages), and without the export's <status>.
  const baseRef = `dav:fs-type1/themes/${cfg.base}/`, ref = `dav:fs-type1/themes/${cfg.name}/`;
  const desc = {en: 'ÓRBITA example theme (copy of the HCL DX Portal 8.5 theme)', es: 'Theme de ejemplo de ÓRBITA (copia del theme Portal 8.5 de HCL DX)'};
  const req = exp.slice(exp.indexOf('<request'))
    .replace(/<theme ([^>]*)>/, (m0, a) => `<theme ${a.replace(/ objectid="[^"]*"/, ' objectid="orbitaTema"')
      .replace(/ uniquename="[^"]*"/, ` uniquename="${esc(cfg.uniqueName)}"`).replace(/ default="true"/, ' default="false"')}>`)
    .split(baseRef).join(ref)
    .replace(/<parameter name="com\.ibm\.portal\.theme\.disallow"[\s\S]*?<\/parameter>\s*/, '')
    .replace(/(<parameter name="com\.ibm\.portal\.isTemplate"[^>]*><!\[CDATA\[)true(\]\]>)/, '$1false$2')
    .replace(/<localedata locale="([^"]+)">[\s\S]*?<\/localedata>\s*/g, (m0, l) => (desc[l]
      ? `<localedata locale="${l}"><title>${esc(cfg.title)}</title><description>${esc(desc[l])}</description></localedata>\n            ` : ''))
    .replace(/\s*<status [^>]*\/>/g, '')
    .replace(/ build="[^"]*"/, '').replace(/ version="[^"]*"/, '')
    .replace(/<request ([^>]*)type="update"/, '<request $1type="update" create-oids="true"');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ÓRBITA · registration of the example theme (a copy of ${esc(cfg.baseUniqueName)}, generated by the chart) -->
${req}`;
}

await login();
const cid = await coleccion(cfg.damCollection);
const url = {logo: await imagen(cid, 'company-logo.png'), hcl: await imagen(cid, 'hcl-software.png'), icono: await imagen(cid, 'orbita-icon.png')};
log(`DAM images ready in "${cfg.damCollection}"`);

const n = await copiar(cfg.base);
let cambiados = 0;
const recorrer = (d) => {
  for (const f of readdirSync(d, {withFileTypes: true})) {
    const p = join(d, f.name);
    if (f.isDirectory()) recorrer(p);
    else if (/^theme(_sidenav)?(_[A-Za-z_]+)?\.html$/.test(f.name)) {
      const antes = readFileSync(p, 'utf8'), despues = cabecera(antes, f.name, url);
      if (despues !== antes) { writeFileSync(p, despues); cambiados++; }
    }
  }
};
recorrer(WORK);
if (!cambiados) fail(`no theme*.html of ${cfg.base} has the expected header (wpthemeLogo)`);
log(`${n} files copied from ${cfg.base}, header changed in ${cambiados} theme*.html`);

// deploy-theme uploads the WebDAV part. Its own registration step fails in the CF239 DXClient ("Cannot read properties
// of undefined"), so the registration is a plain XMLAccess import (same result, and its status is checked).
const xml = registro();
writeFileSync('/tmp/orbita-theme.xml', xml);
let salida = '';
try {
  salida = execFileSync('./bin/dxclient', ['deploy-theme', '--xmlFile', '/tmp/orbita-theme.xml', '--themeName', cfg.name,
    '--themePath', WORK], {stdio: 'pipe', encoding: 'utf8'});
} catch (err) {
  salida = `${err.stdout || ''}${err.stderr || ''}`;
}
if (!/Theme WebDAV deployment successful|Files uploaded successfully/.test(salida)) {
  console.error(salida.split('\n').slice(-15).join('\n'));
  fail('dxclient deploy-theme did not upload the theme to WebDAV');
}
log(`static files uploaded to dav:fs-type1/themes/${cfg.name}/`);
const res = xmlaccess(xml, 'orbita-theme-registro.xml');
if (!res.includes('<status element="all" result="ok"/>')) {
  console.error(res.split('\n').filter((l) => /status|message|fail/i.test(l)).slice(0, 15).join('\n'));
  fail('XMLAccess could not register the theme');
}
log(`"${cfg.title}" (${cfg.uniqueName}) registered`);
