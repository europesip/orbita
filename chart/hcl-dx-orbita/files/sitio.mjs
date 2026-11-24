// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// ÓRBITA · portal part of ÓRBITA on the HCL DX Simple theme (issue #28). Runs in the DXClient container of the
// scriptapps Job (after-push.sh), after the push of the Script Applications. Based on the "orbita-simple" installer
// by Macarena (EUROPESIP): same steps, now driven by the chart values instead of a second installer.
//
//   node sitio.mjs <after-push dir> [--dry]
//
// Steps (all idempotent, they only ADD or UPDATE, never delete):
//   theme         copy of the static part of the base theme (Simple) + ÓRBITA's theme.html (generated from the base
//                 theme.html of YOUR portal + files/site/theme/parts/; no HCL file ships with ÓRBITA) + nls/, registered
//                 as theme.uniqueName. A theme registered by chart 3.x (copy of Portal 8.5) is migrated to it.
//   templates     authoring templates of wcm/templates.json in the theme library, without workflow
//   themesetting  the WCM contents theme.html calls (wcm/themesetting/)
//   orbita        ÓRBITA library: parent site area with the Setting fields (filled only when empty), child areas,
//                 header TOP and footer brand components, images in the DAM or as WCM image components
//   pages         pages.mode site: label <pages.site.uniqueName> (/wps/portal/<pages.site.friendly>) with the pages;
//                 pages.mode home: the pages under pages.parent (as chart 3.x). Plus the hidden Setting page.
//   access        User role on both libraries for the principals of theme.access
//
// Files: the ConfigMap <release>-pages is mounted in <after-push dir>: site-files.json (path -> text of every file of
// files/site/ except the images), site-img-<file> (images of files/site/theme/images/) and sitio.json (the values).
// Credentials: DX_USERNAME / DX_PASSWORD of the Job (the DX administrator Secret of scriptapps.dx.credentialsSecret).
import {readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';

process.removeAllListeners('warning');

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node sitio.mjs <after-push dir> [--dry]'); process.exit(2); }
const values = JSON.parse(readFileSync(join(SRC, 'sitio.json'), 'utf8'));
const THEME = values.theme.enabled !== false;
if (!THEME && !values.pages.create) { console.log('site: nothing to do (theme.enabled=false and pages.create=false)'); process.exit(0); }
const DRY = process.argv.includes('--dry') || values.dryRun === true;

// Materialize files/site/ of the chart in a work folder (the ConfigMap keys cannot have "/")
const HERE = '/tmp/orbita-site';
rmSync(HERE, {recursive: true, force: true});
for (const [rel, body] of Object.entries(JSON.parse(readFileSync(join(SRC, 'site-files.json'), 'utf8')))) {
  mkdirSync(dirname(join(HERE, rel)), {recursive: true});
  writeFileSync(join(HERE, rel), body);
}
mkdirSync(join(HERE, 'theme', 'images'), {recursive: true});
for (const f of readdirSync(SRC).filter((x) => x.startsWith('site-img-'))) {
  writeFileSync(join(HERE, 'theme', 'images', f.slice('site-img-'.length)), readFileSync(join(SRC, f)));
}
if (values.logoBase64) writeFileSync(join(HERE, 'theme', 'images', 'company-logo.png'), Buffer.from(values.logoBase64, 'base64'));

// Configuration: files/site/orbita.config.json with the chart values on top
const cfg = JSON.parse(readFileSync(join(HERE, 'orbita.config.json'), 'utf8'));
cfg.libraries = {...cfg.libraries, ...values.libraries};
cfg.theme = {...cfg.theme, folder: values.theme.folder, uniqueName: values.theme.uniqueName, title: values.theme.title,
  base: values.theme.base, ...(values.theme.languages?.length ? {languages: values.theme.languages} : {})};
// pages.site.anonymous (default false): the ÓRBITA site is for authenticated users only (anonymous users are sent to the
// login). Anonymous users then never render the ÓRBITA theme, so the libraries do not need anonymous read either; with
// anonymous true, "anonymous portal user" is added to the site and to the libraries.
const ANON = 'anonymous portal user';
const SITE_ANONYMOUS = values.pages?.site?.anonymous === true;
const principals = (list) => [...new Set([...(list || []).filter((a) => SITE_ANONYMOUS || a !== ANON), ...(SITE_ANONYMOUS ? [ANON] : [])])];
if (values.access) cfg.access = {libraries: {User: principals(values.access)}};
const LOG_DIR = '/tmp/orbita-site-logs';
mkdirSync(LOG_DIR, {recursive: true});
const log = (m) => console.log(m);
const fail = (m) => { console.error(`ERROR: ${m}`); process.exit(1); };

// ---------------------------------------------------------------------------------------------------------------
// Portal: the DX of the Job, with Basic authentication and the session cookie of the login form (with OpenID
// Connect the REST APIs only accept the session)
// ---------------------------------------------------------------------------------------------------------------
const env = {DX_USER: process.env.DX_USERNAME, DX_PASSWORD: process.env.DX_PASSWORD};
if (!env.DX_USER || !env.DX_PASSWORD) fail('DX_USERNAME / DX_PASSWORD are not set');
const BASE = `${process.env.DX_PROTOCOL || 'https'}://${process.env.DX_HOST}${process.env.DX_PORT ? `:${process.env.DX_PORT}` : ''}`;
const AUTH = 'Basic ' + Buffer.from(`${env.DX_USER}:${env.DX_PASSWORD}`).toString('base64');
const DAV = '/wps/mycontenthandler/dav/fs-type1/themes/';
const enc = (rel) => rel.split('/').map(encodeURIComponent).join('/');

// Basic authentication, as the XMLAccess servlet (/wps/config) needs: it answers 403 to a request with a session
// cookie. Only when DX refuses Basic (401, e.g. some OpenID Connect set-ups) the call is retried with the session.
let basicRefused = false;
async function http(method, path, body, headers = {}) {
  for (let i = 0; ; i++) {
    const session = basicRefused && !path.startsWith('/wps/config');
    const r = await fetch(BASE + path, {method, body, headers: {...(session ? {Cookie: await damSession()} : {Authorization: AUTH}), ...headers}});
    if (r.status === 401 && !session && !path.startsWith('/wps/config')) { basicRefused = true; continue; }
    if (r.status === 503 && i < 4) { await new Promise((ok) => setTimeout(ok, 10000)); continue; }
    return r;
  }
}

/** Files and folders under dav:fs-type1/themes/<folder>/ (paths relative to it), or null if the folder does not exist. */
async function tree(folder) {
  const files = [], dirs = [], pending = [''];
  while (pending.length) {
    const dir = pending.shift();
    const r = await http('PROPFIND', DAV + enc(folder) + '/' + enc(dir), undefined, {Depth: '1'});
    if (r.status === 404) { if (dir === '') return null; continue; }
    if (r.status !== 207) fail(`WebDAV PROPFIND ${folder}/${dir} answered ${r.status}`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<(?:\w+:)?href>([^<]+)<\/(?:\w+:)?href>/g)) {
      const href = decodeURIComponent(m[1]);
      const root = `${DAV}${folder}/`;
      const i = href.indexOf(root);
      if (i < 0) continue;
      const rel = href.slice(i + root.length);
      if (rel === dir) continue;
      if (rel.endsWith('/')) { dirs.push(rel); pending.push(rel); } else files.push(rel);
    }
  }
  return {files, dirs};
}

async function xmlaccess(xml, name) {
  const r = await http('POST', '/wps/config', xml, {'Content-Type': 'text/xml; charset=UTF-8'});
  const t = await r.text();
  if (name) { writeFileSync(join(LOG_DIR, `${name}.request.xml`), xml); writeFileSync(join(LOG_DIR, `${name}.result.xml`), t); }
  return {ok: t.includes('<status element="all" result="ok"/>'), text: t,
    messages: [...(r.ok ? [] : [`HTTP ${r.status}`]), ...t.matchAll(/<message[^>]*>([\s\S]*?)<\/message>/g)].map((m) => (typeof m === 'string' ? m : m[1].trim()))};
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// WCM REST
const REST = '/wps/mycontenthandler/wcmrest';
const NS = 'xmlns="http://www.w3.org/2005/Atom" xmlns:wcm="http://www.ibm.com/xmlns/wcm/8.0"';
const cdata = (s) => `<![CDATA[${String(s).split(']]>').join(']]]]><![CDATA[>')}]]>`;
const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const entries = (xml) => [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
const idOf = (blk) => (blk.match(/<id>wcmrest:([^<]+)<\/id>/) || [])[1];
const nameOf = (blk) => unescapeXml((blk.match(/<wcm:name>([^<]*)<\/wcm:name>/) || [])[1] || '');
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
const titleOf = (blk) => unescapeXml((blk.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1] || '');

async function wcm(method, path, body, type = 'application/atom+xml') {
  const r = await http(method, `${REST}/${path}`, body,
    {Accept: 'application/atom+xml', ...(body !== undefined ? {'Content-Type': type} : {})});
  const t = await r.text();
  if (!r.ok) fail(`WCM ${method} ${path.split('?')[0]} → ${r.status} ${(t.match(/text="([^"]*)"/) || [])[1] || t.slice(0, 200)}`);
  return t;
}
const get = (p) => wcm('GET', p);

async function libraryId(name) {
  const b = entries(await get('query?type=Library&pagesize=500'))
    .find((e) => nameOf(e).toLowerCase() === name.toLowerCase() || titleOf(e).toLowerCase() === name.toLowerCase());
  return b ? idOf(b) : null;
}
async function ensureLibrary(name) {
  const found = await libraryId(name);
  if (found) { log(`  library ${name}: already there`); return found; }
  if (DRY) { log(`  library ${name}: to create`); return null; }
  const id = idOf(await wcm('POST', 'Library', `<?xml version="1.0"?><entry ${NS}><title xml:lang="en">${esc(name)}</title><wcm:name>${esc(name)}</wcm:name><wcm:type>Library</wcm:type></entry>`));
  for (let i = 0; i < 20; i++) {   // the portal prepares the new library in the background
    const r = await http('GET', `${REST}/Library/${id}/preset-folders`, undefined, {Accept: 'application/atom+xml'});
    if (r.ok && /<wcm:name>Content<\/wcm:name>/.test(await r.text())) break;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  log(`  library ${name}: created`);
  return id;
}
/** Item of a type by name in a library (query type: ContentTemplate, SiteAreaTemplate, PresentationTemplate...). */
async function findItem(lib, type, name) {
  if (!lib) return null;
  const b = entries(await get(`query?type=${type}&libraryid=${lib}&pagesize=500`)).find((e) => sameName(nameOf(e), name));
  return b ? idOf(b) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Theme files (theme.html + nls/)
// ---------------------------------------------------------------------------------------------------------------
const ANCHOR = '<link rel="dynamic-content" href="dyn-cs:id:st_head">';

/**
 * ÓRBITA's theme.html, generated from the theme.html of the base theme IN THE PORTAL (HCL's file is not part of ÓRBITA,
 * issue #28): our parts (files/site/theme/parts/) replace or extend four places of it. If HCL changes those places in
 * a CF, the step stops and says which one is missing, instead of producing a broken theme.
 */
async function baseThemeHtml(folder) {
  const r = await http('GET', DAV + enc(folder) + '/theme.html');
  if (!r.ok) fail(`WebDAV GET ${folder}/theme.html answered ${r.status}`);
  return (await r.text()).replace(/^\uFEFF/, '');
}
function patchTheme(base) {
  const T = cfg.theme;
  const part = (n) => readFileSync(join(HERE, 'theme', 'parts', `${n}.html`), 'utf8').split('{{wcmPath}}').join(T.wcmPath.replace(/\/+$/, '')).replace(/\n$/, '');
  let html = base.replace(/\r\n/g, '\n');
  const step = (what, re, by) => {
    if (!re.test(html)) fail(`the theme.html of ${T.base.folder} has no ${what}: update files/site/theme/parts/ for this CF`);
    html = html.replace(re, by);
  };
  step('<link ... st_head> in <head>', /(<link rel="dynamic-content" href="dyn-cs:id:st_head">)/, `$1\n${part('head')}`);
  step('banner (<div id="stBanner"> ... <!--end main banner-->)', /[ \t]*<div id="stBanner"[\s\S]*?<!--end main banner-->/, part('header'));
  step('footer (<footer id="stFooter"> ... </footer>)', /[ \t]*<footer id="stFooter"[\s\S]*?<\/footer>(<!-- page footer -->)?/, part('footer'));
  step('</body>', /<\/body>/, `${part('body-end')}\n</body>`);
  return html;
}

async function themeFiles() {
  const T = cfg.theme;
  const html = patchTheme(await baseThemeHtml(T.base.folder));
  if (!html.includes(ANCHOR)) fail(`the generated theme.html has no ${ANCHOR}`);
  const nls = JSON.parse(readFileSync(join(HERE, 'theme', 'nls.json'), 'utf8'));
  const langs = T.languages ?? [];
  for (const l of langs) if (!nls[l]) fail(`language "${l}" is not in theme/nls.json`);

  const out = {};
  // nls/theme_<code>.html: a copy of theme.html with its language, locale class and texts
  for (const l of langs) {
    const {lang, locale, texts = {}} = nls[l];
    let h = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`).replace(/\blocale_en\b/, `locale_${locale}`);
    for (const [en, tr] of Object.entries(texts)) {
      h = h.split(`="${en}"`).join(`="${esc(tr)}"`).split(`>${en}<`).join(`>${esc(tr)}<`);
    }
    out[`nls/theme_${l}.html`] = h;
  }
  // root theme.html: the same, plus the locale links (rendering is delegated to nls/ for each language)
  out['theme.html'] = langs.length ? html.replace(ANCHOR, `${ANCHOR}
<!-- rendering is delegated to the specified href for each locale --><!--START LOCALE LINKS-->
${langs.map((l) => `<link rel="alternate" href="nls/theme_${l}.html" hreflang="${l}">`).join('\n')}<!--END LOCALE LINKS-->`) : html;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Registration (XMLAccess): the base theme's registration with our unique name and folder
// ---------------------------------------------------------------------------------------------------------------
async function registration() {
  const T = cfg.theme;
  const exp = await xmlaccess(`<?xml version="1.0" encoding="UTF-8"?>
<request xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="PortalConfig_8.5.0.xsd" type="export">
  <portal action="locate"><theme action="export" uniquename="${esc(T.base.uniqueName)}"/></portal>
</request>`, 'theme-base-export');
  if (!exp.ok || !/<theme [^>]*uniquename=/.test(exp.text)) fail(`cannot export the base theme ${T.base.uniqueName}: ${exp.messages.join(' | ')}`);
  const baseRef = `dav:fs-type1/themes/${T.base.folder}/`, ref = `dav:fs-type1/themes/${T.folder}/`;
  if (!exp.text.includes(baseRef)) fail(`the registration of ${T.base.uniqueName} does not point to ${baseRef}`);
  const req = exp.text.slice(exp.text.indexOf('<request'))
    .replace(/<theme ([^>]*)>/, (m0, a) => `<theme ${a.replace(/ objectid="[^"]*"/, ' objectid="orbitaTheme"')
      .replace(/ uniquename="[^"]*"/, ` uniquename="${esc(T.uniqueName)}"`).replace(/ default="true"/, ' default="false"')}>`)
    .split(baseRef).join(ref)
    .replace(/<parameter name="com\.ibm\.portal\.theme\.disallow"[\s\S]*?<\/parameter>\s*/, '')
    .replace(/(<parameter name="com\.ibm\.portal\.isTemplate"[^>]*><!\[CDATA\[)true(\]\]>)/, '$1false$2')
    .replace(HIDDEN_RE, '$1false$2')   // Simple is hidden in the theme manager; ours must not be
    // Marker of the chart: the base this registration was made from (a 3.x registration, copy of Portal 8.5, has none)
    .replace(/(\s*)<\/theme>/, `$1    <parameter name="${BASE_MARK}" type="string" update="set"><![CDATA[${esc(T.base.uniqueName)}]]></parameter>$1</theme>`)
    .replace(/<localedata locale="([^"]+)">[\s\S]*?<\/localedata>\s*/g, (m0, l) => (T.description[l]
      ? `<localedata locale="${l}"><title>${esc(T.title)}</title><description>${esc(T.description[l])}</description></localedata>\n            ` : ''))
    .replace(/\s*<status [^>]*\/>/g, '')
    .replace(/ build="[^"]*"/, '').replace(/ version="[^"]*"/, '')
    .replace(/<request ([^>]*)type="update"/, '<request $1type="update" create-oids="true"');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ÓRBITA · registration of the theme (a copy of ${esc(T.base.uniqueName)}, generated by the chart hcl-dx-orbita) -->
${req}`;
}

const BASE_MARK = 'com.europesip.orbita.theme.base';
const HIDDEN_RE = /(<parameter name="com\.ibm\.portal\.Hidden"[^>]*><!\[CDATA\[)true(\]\]>)/;

/** XMLAccess export of the registered theme, or null if it is not registered. */
async function registered(uniqueName) {
  const r = await xmlaccess(`<?xml version="1.0" encoding="UTF-8"?>
<request xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="PortalConfig_8.5.0.xsd" type="export">
  <portal action="locate"><theme action="export" uniquename="${esc(uniqueName)}"/></portal>
</request>`);
  return r.ok && /<theme [^>]*uniquename=/.test(r.text) ? r.text : null;
}

/** Already registered but hidden in the theme manager (registrations made before this check): show it. */
async function unhide(T, exported) {
  if (!HIDDEN_RE.test(exported)) return 'visible in the theme manager';
  if (DRY) return 'HIDDEN in the theme manager: to show';
  const r = await xmlaccess(`<?xml version="1.0" encoding="UTF-8"?>
<request xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="PortalConfig_8.5.0.xsd" type="update">
  <portal action="locate">
    <theme action="update" uniquename="${esc(T.uniqueName)}">
      <parameter name="com.ibm.portal.Hidden" type="string" update="set"><![CDATA[false]]></parameter>
    </theme>
  </portal>
</request>`, 'theme-unhide');
  if (!r.ok) fail(`cannot show the theme in the theme manager (logs/theme-unhide.result.xml): ${r.messages.join(' | ')}`);
  if (HIDDEN_RE.test(await registered(T.uniqueName))) fail('the theme is still hidden in the theme manager');
  return 'was hidden in the theme manager: now shown';
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Theme
// ---------------------------------------------------------------------------------------------------------------
async function installTheme() {
  const T = cfg.theme;
  log(`\n== Theme ${T.title} (${T.uniqueName}) → dav:fs-type1/themes/${T.folder}/  ·  base ${T.base.folder} (${T.base.uniqueName})`);
  const base = await tree(T.base.folder);
  if (!base) fail(`the base theme folder dav:fs-type1/themes/${T.base.folder}/ does not exist in ${BASE}`);
  const target = (await tree(T.folder)) ?? {files: [], dirs: []};
  const ours = await themeFiles();
  const exported0 = await registered(T.uniqueName);
  // Migration from chart 3.x: the theme was a copy of another base (Portal 8.5) and its registration has no base marker
  // (or another one). Its files are replaced by the base ones and the registration is updated (same unique name and
  // object ID, so the pages keep it).
  const markOf = (x) => (x.match(new RegExp(`<parameter name="${BASE_MARK.replace(/\./g, '\\.')}"[^>]*><!\\[CDATA\\[([^\\]]*)`)) || [])[1];
  const migrate = !!exported0 && markOf(exported0) !== T.base.uniqueName;
  const toCopy = base.files.filter((f) => !ours[f] && (migrate || !target.files.includes(f)));
  const stale = migrate ? target.files.filter((f) => !ours[f] && !base.files.includes(f)) : [];
  const dirs = [...new Set([...base.dirs, ...Object.keys(ours).filter((f) => f.includes('/')).map((f) => f.slice(0, f.lastIndexOf('/') + 1))])]
    .filter((d) => !target.dirs.includes(d)).sort((a, b) => a.length - b.length);
  const exported = exported0;
  const isRegistered = !!exported;
  const reg = isRegistered && !migrate ? null : await registration();
  if (migrate) log(`  MIGRATION: ${T.uniqueName} was a copy of another theme (${markOf(exported0) || 'chart 3.x, Portal 8.5'}): its files and registration become the ${T.base.uniqueName} ones · ${stale.length} old files to remove`);

  log(`  base: ${base.files.length} files · target: ${target.files.length ? target.files.length + ' files (exists)' : 'does not exist'}`);
  log(`  folders to create: ${dirs.length} · base files to copy: ${toCopy.length} · our files (theme.html + nls): ${Object.keys(ours).length}`);
  log(`  registration: ${isRegistered ? `already registered · ${await unhide(T, exported)}` : 'to create (XMLAccess)'}`);

  if (DRY) {
    const prev = join(LOG_DIR, 'preview', 'theme');
    rmSync(prev, {recursive: true, force: true});
    for (const [f, h] of Object.entries(ours)) { mkdirSync(dirname(join(prev, f)), {recursive: true}); writeFileSync(join(prev, f), h); }
    if (reg) writeFileSync(join(LOG_DIR, 'preview', 'theme-registration.xml'), reg);
    log(`  --dry: nothing changed. Generated files in logs/preview/theme/${reg ? ', registration in logs/preview/theme-registration.xml' : ''}`);
    return;
  }

  // WebDAV: folders, base files (only the missing ones), our files (always)
  for (const d of [...(target.files.length ? [] : ['']), ...dirs]) {
    const r = await http('MKCOL', DAV + enc(T.folder) + '/' + enc(d));
    if (![201, 405].includes(r.status)) fail(`WebDAV MKCOL ${T.folder}/${d} answered ${r.status}`);
  }
  let n = 0;
  const work = async () => {
    for (let f; (f = toCopy.shift());) {
      const g = await http('GET', DAV + enc(T.base.folder) + '/' + enc(f));
      if (!g.ok) fail(`WebDAV GET ${T.base.folder}/${f} answered ${g.status}`);
      const bytes = Buffer.from(await g.arrayBuffer());
      // The DX WebDAV sometimes answers 400/409 to parallel writes in the same folder: retried a few times
      let p;
      for (let k = 0; k < 5; k++) {
        p = await http('PUT', DAV + enc(T.folder) + '/' + enc(f), bytes, {'Content-Type': 'application/octet-stream'});
        if (p.ok || ![400, 409, 423, 500].includes(p.status)) break;
        await new Promise((ok) => setTimeout(ok, 1500 * (k + 1)));
      }
      if (!p.ok) fail(`WebDAV PUT ${T.folder}/${f} answered ${p.status}`);
      n++;
    }
  };
  await Promise.all(Array.from({length: 3}, work));
  log(`  ${n} base files copied`);
  for (const f of stale) {
    const r = await http('DELETE', DAV + enc(T.folder) + '/' + enc(f));
    if (![200, 204, 404].includes(r.status)) fail(`WebDAV DELETE ${T.folder}/${f} answered ${r.status}`);
  }
  if (stale.length) log(`  ${stale.length} old files removed`);
  for (const [f, h] of Object.entries(ours)) {
    const p = await http('PUT', DAV + enc(T.folder) + '/' + enc(f), Buffer.from(h, 'utf8'), {'Content-Type': 'text/html; charset=UTF-8'});
    if (!p.ok) fail(`WebDAV PUT ${T.folder}/${f} answered ${p.status}`);
  }
  log(`  theme.html and ${Object.keys(ours).length - 1} nls files uploaded`);

  if (reg) {
    const r = await xmlaccess(reg, 'theme-registration');
    if (!r.ok) fail(`theme registration failed (logs/theme-registration.result.xml): ${r.messages.join(' | ')}`);
    log(`  ${migrate ? 'registration updated' : 'registered'} as ${T.uniqueName}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Authoring templates (wcm/templates.json), without workflow, in the theme library
// ---------------------------------------------------------------------------------------------------------------
const ptText = (xml) => { const m = xml.match(/<content type="text\/html">([\s\S]*?)<\/content>/); return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '') : ''; };

// WCM REST v2 (JSON): the only API that reads and writes the field settings of a template (properties such as
// DIGITAL_ASSET_SOURCE_SELECTION_ENABLED = "show digital asset resource", HIDDEN, MANDATORY...) and the rendering
// behaviour of the default site area. The classic API (wcmrest) ignores them.
const REST2 = '/wps/mycontenthandler/wcmrest-v2';
async function wcm2(method, path, body) {
  const r = await http(method, `${REST2}/${path}`, body === undefined ? undefined : JSON.stringify(body),
    {Accept: 'application/json', ...(body !== undefined ? {'Content-Type': 'application/json'} : {})});
  const t = await r.text();
  if (!r.ok) fail(`WCM v2 ${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
const protoElements = (proto) => { const e = proto?.content?.siteArea?.elements?.element; return Array.isArray(e) ? e : e ? [e] : []; };

/** Readable names of the field settings that can only be set by hand (Authoring UI). */
const SETTING_LABEL = {
  DIGITAL_ASSET_SOURCE_SELECTION_ENABLED: '"Show digital asset resource" (Mostrar recurso de activo digital)',
  HIDDEN: '"Hidden"', MANDATORY: '"Required"', MAX_CHARS: 'maximum characters', RENDITIONS_ENABLED: 'renditions',
};
const manualSteps = [];

/**
 * Site area template: the rendering behaviour of its default site area (written with the v2 API) and a CHECK of the
 * field settings. In this DX version no API writes the field settings of a site area template (the v2 request has no
 * `properties`), so the differences with the model are listed as manual steps. Returns a text for the log.
 */
async function siteAreaTemplateSettings(id, t) {
  const res = `SiteAreaTemplate/${id}/Prototype`;
  const proto = await wcm2('GET', res);
  let out = '';
  if (t.renderingBehavior) {
    const c = (proto.category || []).find((x) => x.scheme === 'wcmrest:renderingBehavior');
    if (c?.term === t.renderingBehavior) out += ` · rendering ${t.renderingBehavior}`;
    else if (DRY) out += ` · rendering to set: ${t.renderingBehavior}`;
    else {
      const category = [...(proto.category || []).filter((x) => x.scheme !== 'wcmrest:renderingBehavior'), {scheme: 'wcmrest:renderingBehavior', term: t.renderingBehavior}];
      await wcm2('PUT', res, {entry: {title: proto.title, name: proto.name, type: proto.type, category, content: proto.content}});
      const after = await wcm2('GET', res);
      if ((after.category || []).find((x) => x.scheme === 'wcmrest:renderingBehavior')?.term !== t.renderingBehavior) fail(`${t.name}: rendering behaviour not saved`);
      out += ` · rendering set to ${t.renderingBehavior}`;
    }
  }
  // Field settings: only the keys the portal reports for the field, with a value different from the model
  const wanted = Object.fromEntries(t.elements.filter((e) => e.properties).map((e) => [e.name, e.properties]));
  const diff = [];
  for (const el of protoElements(proto)) {
    for (const {key, value} of wanted[el.name] || []) {
      const cur = (el.properties || []).find((p) => p.key === key);
      if (cur && cur.value !== value) diff.push({field: el.name, key, value});
    }
  }
  // "Show digital asset resource" only makes sense with DAM: without it the image fields take an uploaded file
  if (!(await hasDam())) {
    const n = diff.length;
    diff.splice(0, n, ...diff.filter((d) => d.key !== 'DIGITAL_ASSET_SOURCE_SELECTION_ENABLED'));
    if (n !== diff.length) out += ' · no DAM: "show digital asset resource" not needed';
  }
  if (diff.length) {
    for (const d of diff) manualSteps.push(`site area template "${t.name}" › field ${d.field} › ${SETTING_LABEL[d.key] || d.key}: ${d.value === 'true' ? 'tick it' : d.value === 'false' ? 'untick it' : d.value}`);
    out += ` · ${diff.length} field settings to set BY HAND (see the end)`;
  } else out += ' · field settings as in the model';
  return out;
}

async function installTemplates() {
  const def = JSON.parse(readFileSync(join(HERE, 'wcm', 'templates.json'), 'utf8'));
  log(`\n== Authoring templates → library ${cfg.libraries.theme}`);
  const lib = await ensureLibrary(cfg.libraries.theme);

  const pts = {};
  for (const pt of def.presentationTemplates) {
    const html = readFileSync(join(HERE, pt.file), 'utf8');
    let id = await findItem(lib, 'PresentationTemplate', pt.name);
    if (id) {
      const xml = await get(`PresentationTemplate/${id}`);
      if (ptText(xml).trim() === html.trim()) log(`  presentation template ${pt.name}: same`);
      else if (DRY) log(`  presentation template ${pt.name}: to update`);
      else {
        await wcm('PUT', `PresentationTemplate/${id}`, xml.replace(/<content type="text\/html">[\s\S]*?<\/content>/, `<content type="text/html">${cdata(html)}</content>`));
        log(`  presentation template ${pt.name}: updated`);
      }
    } else if (DRY) log(`  presentation template ${pt.name}: to create`);
    else {
      id = idOf(await wcm('POST', 'PresentationTemplate', `<?xml version="1.0"?><entry ${NS}><title xml:lang="en">${esc(pt.name)}</title><wcm:name>${esc(pt.name)}</wcm:name><wcm:type>PresentationTemplate</wcm:type><link rel="library" href="${REST}/Library/${lib}"/><content type="text/html">${cdata(html)}</content></entry>`));
      log(`  presentation template ${pt.name}: created`);
    }
    pts[pt.name] = id;
  }

  for (const [kind, list] of [['ContentTemplate', def.contentTemplates], ['SiteAreaTemplate', def.siteAreaTemplates]]) {
    for (const t of list) {
      let id = await findItem(lib, kind, t.name);
      const have = id ? new Set(entries(await get(`${kind}/${id}/Prototype/elements`)).map(nameOf)) : new Set();
      const missing = t.elements.filter((e) => !have.has(e.name));
      const label = `${kind === 'ContentTemplate' ? 'content' : 'site area'} template ${t.name}`;
      if (DRY) {
        const settings = id && kind === 'SiteAreaTemplate' ? await siteAreaTemplateSettings(id, t) : '';
        log(`  ${label}: ${id ? 'already there' : 'to create'}${missing.length ? ` · fields to add: ${missing.map((e) => e.name).join(', ')}` : ''}${settings}`);
        continue;
      }
      if (!id) id = idOf(await wcm('POST', kind, `<?xml version="1.0"?><entry ${NS}><title xml:lang="en">${esc(t.name)}</title><wcm:name>${esc(t.name)}</wcm:name><wcm:type>${kind}</wcm:type><link rel="parent" href="${REST}/Library/${lib}"/></entry>`));
      for (const e of missing) {
        await wcm('POST', `${kind}/${id}/Prototype/elements`, `<?xml version="1.0"?><entry ${NS}><title xml:lang="en">${esc(e.title)}</title><wcm:name>${esc(e.name)}</wcm:name><wcm:type>${e.type}</wcm:type></entry>`);
      }
      // Properties of the prototype: no workflow, and the default presentation template
      const res = `${kind}/${id}/Prototype/properties`;
      const before = await get(res);
      let props = before.replace(/<option name="ENABLE_WORKFLOW" enabled="true"\/>/, '<option name="ENABLE_WORKFLOW" enabled="false"/>');
      if (t.defaultPresentation) {
        const ptId = pts[t.defaultPresentation];
        if (!ptId) fail(`${label}: presentation template ${t.defaultPresentation} not found`);
        const link = `<link rel="default-presentation" href="${REST}/PresentationTemplate/${ptId}" type="application/vnd.ibm.wcm+xml" xml:lang="en" label="Default Presentation"/>`;
        const re = /<link\b[^>]*rel="default-presentation"[^>]*\/>/;
        const cur = props.match(re);
        if (!cur || !cur[0].includes(`/PresentationTemplate/${ptId}`)) props = cur ? props.replace(re, link) : props.replace(/<\/content-properties>\s*$/, `${link}</content-properties>`);
      }
      if (props !== before) await wcm('PUT', res, props, 'application/vnd.ibm.wcm+xml');
      const after = await get(res);
      if (!/<option name="ENABLE_WORKFLOW" enabled="false"\/>/.test(after)) fail(`${label}: the workflow is still enabled`);
      const settings = kind === 'SiteAreaTemplate' ? await siteAreaTemplateSettings(id, t) : '';
      log(`  ${label}: ${have.size ? 'already there' : 'created'}${missing.length ? ` · ${missing.length} fields added` : ''} · no workflow${t.defaultPresentation ? ` · presentation ${t.defaultPresentation}` : ''}${settings}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// DAM (Digital Asset Management): is it there? The API answers JSON when it is; a portal without it answers 404.
// ---------------------------------------------------------------------------------------------------------------
const DAM = '/dx/api/dam/v1';
let damState;   // undefined until checked, then true / false
async function hasDam() {
  if (damState === undefined) {
    const r = await http('GET', `${DAM}/collections?limit=1`, undefined, {Accept: 'application/json'});
    let j = null;
    try { j = await r.json(); } catch { /* not JSON: no DAM */ }
    damState = r.ok && !!j && Array.isArray(j.contents);
    log(`\n== DAM: ${damState ? 'available' : `not available (${r.status}): images as WCM image components`}`);
  }
  return damState;
}
// The DAM API reads with the user and password, but only writes with a portal session (SSO cookie): login form.
let damCookie;
async function damSession() {
  if (damCookie === undefined) {
    const f = await fetch(`${BASE}/wps/j_security_check`, {method: 'POST', redirect: 'manual',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({j_username: env.DX_USER, j_password: env.DX_PASSWORD})});
    damCookie = f.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => /^(LtpaToken2|WAS_[^=]*)=[^;]/.test(c)).join('; ');
    if (!damCookie) fail(`the portal did not open a session for the DAM (login form answered ${f.status})`);
  }
  return damCookie;
}
async function damJson(method, path, body, headers = {}) {
  const r = await fetch(BASE + (path.startsWith('/dx/') ? path : DAM + path), {method, body, headers: {Accept: 'application/json', Cookie: await damSession(), ...headers}});
  const t = await r.text();
  let json = null;
  try { json = JSON.parse(t); } catch { /* not JSON */ }
  return {ok: r.ok, status: r.status, json, text: t};
}
/** DAM collection by name: its id, created if missing (null in a dry run when it is missing). */
async function damCollection(name) {
  const r = await damJson('GET', `/collections?query=${encodeURIComponent(name)}&limit=100`);
  const c = r.ok && (r.json.contents || []).find((x) => x.name === name);
  if (c) {
    log(`  DAM collection ${name}: already there`);
    const anon = await fetch(`${BASE}${DAM}/collections/${c.id}/items?limit=1`, {headers: {Accept: 'application/json'}});
    if (!anon.ok && !DRY) await damReadable(c);
    return c.id;
  }
  if (DRY) { log(`  DAM collection ${name}: to create`); return null; }
  const n = await damJson('POST', '/collections', JSON.stringify({name, description: 'ÓRBITA header images (logos). To change one, upload a new version of it.'}), {'Content-Type': 'application/json'});
  if (!n.ok || !n.json?.id) fail(`cannot create the DAM collection "${name}" (${n.status}): ${n.text.slice(0, 200)}`);
  log(`  DAM collection ${name}: created`);
  await damReadable(n.json);
  return n.json.id;
}
/** Readable by everybody (they are the header logos): User role for anonymous and all authenticated users, as the ÓRBITA chart. */
async function damReadable(c) {
  const rid = encodeURIComponent(c.accessreferenceid);
  const a = await damJson('POST', `/dx/api/core/v1/access/principals?resourceId=${rid}&roleName=User`);
  const b = await damJson('POST', `/dx/api/core/v1/access/permissions?resourceId=${rid}&roleName=User&type=virtual`,
    JSON.stringify({permissionList: [{distinguishedName: 'all authenticated portal users'}]}), {'Content-Type': 'application/json'});
  log(`  DAM collection ${c.name}: readable by everybody (anonymous ${a.status}, authenticated ${b.status})`);
}
/** URL of the original rendition of an image of the collection, uploaded if missing. */
async function damImage(cid, file) {
  if (!cid) { log(`  DAM image ${file}: to upload`); return `{{DAM ${file}}}`; }
  const items = await damJson('GET', `/collections/${cid}/items?limit=500`);
  let item = items.ok && (items.json.contents || []).find((x) => x.name === file);
  if (!item) {
    if (DRY) { log(`  DAM image ${file}: to upload`); return `{{DAM ${file}}}`; }
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(join(HERE, 'theme', 'images', file))], {type: 'image/png'}), file);
    fd.append('name', file);
    const r = await damJson('POST', `/collections/${cid}/items`, fd);
    if (!r.ok || !r.json?.mediaInfo) fail(`cannot upload ${file} to the DAM (${r.status}): ${r.text.slice(0, 200)}`);
    item = r.json.mediaInfo;
    log(`  DAM image ${file}: uploaded`);
  } else log(`  DAM image ${file}: already there`);
  for (let i = 0; i < 60; i++) {   // the renditions are generated after the upload
    const r = await damJson('GET', `/collections/${cid}/items/${item.id}/renditions`);
    const o = r.ok && (r.json.contents || []).find((x) => x.renditionType === 'Original' && x.binaryUrl);
    if (o) return `${DAM}${o.binaryUrl}`;
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  return fail(`the DAM did not create the original rendition of ${file}`);
}

// ---------------------------------------------------------------------------------------------------------------
// WCM items: folders, components, site areas, contents (same REST calls as orbita-blueprint/deploy.mjs)
// ---------------------------------------------------------------------------------------------------------------
const cfgOf = (name) => JSON.parse(readFileSync(join(HERE, name), 'utf8'));
// Placeholders of the chart in the WCM files: {{pagesBase}} = URL of the ÓRBITA pages (pages.base, derived from pages.mode)
const text = (rel) => readFileSync(join(HERE, rel), 'utf8').split('{{pagesBase}}').join(values.pagesBase);
const imageType = (f) => (/\.svg$/i.test(f) ? 'image/svg' : /\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.ico$/i.test(f) ? 'image/x-icon' : 'image/png');
// Parent id (preset folders have ids such as <library id>-10)
const parentOf = (xml) => (xml.match(/<link rel="parent" href="[^"]*\/(?:Folder|SiteArea|Library)\/([^"/]+)"/) || [])[1];
// The portal adds id="..." to the [Component name="..."] tags it saves: ignored when comparing with our files
const sameHtml = (a, b) => {
  // (and it saves the component names in lower case: [Component name="orbita/img/hcl-logo"])
  const n = (s) => s.replace(/(\[Component\b[^\]]*?) id="[^"]*"/g, '$1').replace(/\[Component name="([^"]*)"/g, (m, x) => `[Component name="${x.toLowerCase()}"`).trim();
  return n(a) === n(b);
};

/** The text value of each element of a WCM item (CDATA or escaped), plus its whole block. */
function readElements(xml) {
  const out = [];
  for (const m of xml.matchAll(/<element name="([^"]+)">([\s\S]*?)<\/element>/g)) {
    const type = (m[2].match(/<type>([^<]*)<\/type>/) || [])[1];
    const d = m[2].match(/<data type="([^"]*)"(?:\/>|>([\s\S]*?)<\/data>)/);
    const raw = (d && d[2]) || '';
    const value = /^text\//.test(d ? d[1] : '') ? (raw.includes('<![CDATA[') ? raw.replace(/<!\[CDATA\[|\]\]>/g, '') : unescapeXml(raw)) : '';
    out.push({name: unescapeXml(m[1]), type, dataType: d ? d[1] : '', value, block: m[0], hasImage: /<fileName>[^<]+</.test(m[2])});
  }
  return out;
}
const EMPTY_IMAGE = (name) => `<element name="${esc(name)}"><title xml:lang="en">${esc(name)}</title><type>ImageComponent</type>`
  + '<data type="application/vnd.ibm.wcm+xml"><image><altText></altText><tagName></tagName><fileName></fileName><resourceUri type=""></resourceUri><renditionList/></image></data></element>';
const textElement = (name, type, dataType, value) => `<element name="${esc(name)}"><title xml:lang="en">${esc(name)}</title><type>${type}</type><data type="${dataType}">${cdata(value)}</data></element>`;
const setElements = (xml, blocks) => xml.replace(/<elements([^>]*)>[\s\S]*<\/elements>|<elements([^>]*)\/>/, (m, a, b) => `<elements${a || b || ''}>${blocks.join('')}</elements>`);

/** Id of the preset folder (Components, Content...) of a library. */
async function presetFolder(lib, name) {
  const b = entries(await get(`Library/${lib}/preset-folders`)).find((e) => nameOf(e) === name);
  if (!b) fail(`the library has no preset folder ${name}`);
  return idOf(b);
}
/** Folder `name` under the parent folder (created if missing). In a dry run, null when it is missing. */
async function ensureFolder(lib, parent, name, where) {
  if (!parent) { log(`  folder ${where}: to create`); return null; }
  for (const e of entries(await get(`query?type=Folder&libraryid=${lib}&pagesize=500`))) {
    if (nameOf(e).toLowerCase() === name.toLowerCase() && parentOf(await get(`Folder/${idOf(e)}`)) === parent) { log(`  folder ${where}: already there`); return idOf(e); }
  }
  if (DRY) { log(`  folder ${where}: to create`); return null; }
  const id = idOf(await wcm('POST', 'Folder', `<?xml version="1.0"?><entry ${NS}><title xml:lang="en">${esc(name)}</title><wcm:name>${esc(name)}</wcm:name><wcm:type>Folder</wcm:type><link rel="parent" href="${REST}/Folder/${parent}"/></entry>`));
  log(`  folder ${where}: created`);
  return id;
}
/** HTML component: created, or its text updated when it changed (the installer owns its code). */
async function ensureHtmlComponent(lib, folder, name, html, where) {
  const id = await findItem(lib, 'LibraryHTMLComponent', name);
  if (id) {
    const xml = await get(`LibraryHTMLComponent/${id}`);
    const cur = (xml.match(/<content type="text\/html">([\s\S]*?)<\/content>/) || [])[1] || '';
    const curText = cur.includes('<![CDATA[') ? cur.replace(/<!\[CDATA\[|\]\]>/g, '') : unescapeXml(cur);
    if (sameHtml(curText, html)) { log(`  component ${where}: same`); return; }
    if (DRY) { log(`  component ${where}: to update`); return; }
    await wcm('PUT', `LibraryHTMLComponent/${id}`, xml.replace(/<content type="text\/html">[\s\S]*?<\/content>|<content type="text\/html"\/>/, `<content type="text/html">${cdata(html)}</content>`));
    log(`  component ${where}: updated`);
  } else if (DRY || !folder) log(`  component ${where}: to create`);
  else {
    await wcm('POST', 'LibraryHTMLComponent', `<?xml version="1.0"?><entry ${NS}><title xml:lang="en">${esc(name)}</title><wcm:name>${esc(name)}</wcm:name><wcm:type>LibraryHTMLComponent</wcm:type><link rel="parent" href="${REST}/Folder/${folder}"/><content type="text/html">${cdata(html)}</content></entry>`);
    log(`  component ${where}: created`);
  }
}
/** Image component with the image of theme/images/<file> (uploaded only when it has none yet). */
async function ensureImageComponent(lib, folder, name, file, where) {
  let id = await findItem(lib, 'LibraryImageComponent', name);
  if (id && /<fileName>[^<]+</.test(await get(`LibraryImageComponent/${id}`))) { log(`  image component ${where}: already there`); return; }
  if (DRY || !folder) { log(`  image component ${where}: ${id ? 'image to upload' : 'to create'} (${file})`); return; }
  if (!id) id = idOf(await wcm('POST', 'LibraryImageComponent', `<?xml version="1.0"?><entry ${NS}><title xml:lang="en">${esc(name)}</title><wcm:name>${esc(name)}</wcm:name><wcm:type>LibraryImageComponent</wcm:type><link rel="parent" href="${REST}/Folder/${folder}"/>`
    + `<content type="application/vnd.ibm.wcm+xml"><wcm:image xmlns="http://www.ibm.com/xmlns/wcm/8.0"><altText></altText><tagName></tagName><fileName></fileName><resourceUri type=""></resourceUri><renditionList/></wcm:image></content></entry>`));
  await wcm('PUT', `LibraryImageComponent/${id}`, readFileSync(join(HERE, 'theme', 'images', file)), imageType(file));
  if (!/<fileName>[^<]+</.test(await get(`LibraryImageComponent/${id}`))) fail(`image component ${where}: the image was not saved`);
  log(`  image component ${where}: created with ${file}`);
}
/** Site area under a library (parent null) or under another site area. Returns its id (null in a dry run if missing). */
async function ensureSiteArea(lib, parentArea, name, templateId, where) {
  // WCM names are case-insensitive (an existing "setting" blocks a new "Setting" with 409): compare ignoring case
  const all = entries(await get(`query?type=SiteArea&libraryid=${lib}&pagesize=500`)).filter((e) => sameName(nameOf(e), name));
  for (const e of all) {
    const p = parentOf(await get(`SiteArea/${idOf(e)}`));
    if (parentArea ? p === parentArea : !p || p === lib) { log(`  site area ${where}: already there`); return idOf(e); }
  }
  if (DRY || (parentArea === null && !lib) || parentArea === undefined) { log(`  site area ${where}: to create`); return null; }
  log(`  site area ${where}: creating`);
  const id = idOf(await wcm('POST', 'SiteArea', `<?xml version="1.0"?><entry ${NS}><title xml:lang="en">${esc(name)}</title><wcm:name>${esc(name)}</wcm:name><wcm:type>SiteArea</wcm:type>`
    + `<link rel="parent" href="${REST}/${parentArea ? `SiteArea/${parentArea}` : `Library/${lib}`}"/>`
    + `${templateId ? `<link rel="sitearea-template" href="${REST}/SiteAreaTemplate/${templateId}"/>` : ''}</entry>`));
  log(`  site area ${where}: created`);
  return id;
}
/** Content with the HTML field of the content template; updated when the HTML changed (the installer owns it). */
async function ensureContent(lib, area, ct, name, element, html, where) {
  const id = await findItem(lib, 'Content', name);
  if (id) {
    const xml = await get(`Content/${id}`);
    const el = readElements(xml).find((e) => e.name === element);
    if (!el) fail(`content ${where} has no field "${element}"`);
    if (sameHtml(el.value, html)) { log(`  content ${where}: same`); return; }
    if (DRY) { log(`  content ${where}: to update`); return; }
    await wcm('PUT', `Content/${id}`, xml.replace(el.block, textElement(element, 'HTMLComponent', 'text/html', html)));
    log(`  content ${where}: updated`);
  } else if (DRY || !area || !ct) log(`  content ${where}: to create`);
  else {
    await wcm('POST', 'Content', `<?xml version="1.0"?><entry ${NS}><title xml:lang="en">${esc(name)}</title><wcm:name>${esc(name)}</wcm:name><wcm:type>Content</wcm:type><link rel="parent" href="${REST}/SiteArea/${area}"/><link rel="content-template" href="${REST}/ContentTemplate/${ct}"/><content type="application/vnd.ibm.wcm+xml"><wcm:content xmlns="http://www.ibm.com/xmlns/wcm/8.0"><elements>${textElement(element, 'HTMLComponent', 'text/html', html)}</elements></wcm:content></content></entry>`);
    log(`  content ${where}: created`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 3. ThemeSetting (wcm/themesetting/): the contents that theme.html calls, in the theme library
// ---------------------------------------------------------------------------------------------------------------
async function installThemeSetting() {
  const c = cfgOf('wcm/themesetting/themesetting.json');
  const [libName, areaName] = cfg.theme.wcmPath.split('/');
  log(`\n== ThemeSetting → ${cfg.theme.wcmPath}`);
  const lib = await ensureLibrary(libName);
  const comps = lib ? await presetFolder(lib, 'Components') : null;
  const folder = await ensureFolder(lib, comps, c.componentFolder, `Components/${c.componentFolder}`);
  for (const name of c.components) await ensureHtmlComponent(lib, folder, name, text(`wcm/themesetting/components/${name}.html`), `${c.componentFolder}/${name}`);
  const area = lib ? await ensureSiteArea(lib, null, areaName, null, areaName) : (log(`  site area ${areaName}: to create`), null);
  const ct = lib ? await findItem(lib, 'ContentTemplate', c.contentTemplate) : null;
  if (!ct && !DRY) fail(`content template ${c.contentTemplate} not found: run the templates step first`);
  for (const name of c.contents) await ensureContent(lib, area, ct, name, c.element, text(`wcm/themesetting/contents/${name}.html`), `${areaName}/${name}`);
}

// ---------------------------------------------------------------------------------------------------------------
// 4. ÓRBITA library (wcm/orbita/): parent site area with the Setting fields, its child areas, the header TOP
// ---------------------------------------------------------------------------------------------------------------
async function installOrbita() {
  const c = cfgOf('wcm/orbita/orbita.json');
  // One child area per page of pages.items (the default site area of each page), plus Setting
  c.childAreas = [...c.childAreas.filter((a) => a.name === 'Setting'), ...values.pages.items.map((i) => ({name: i.friendly}))];
  const libName = cfg.libraries.content, themeLib = cfg.libraries.theme;
  log(`\n== ÓRBITA library → ${libName}`);
  const dam = await hasDam();
  const lib = await ensureLibrary(libName);
  const comps = lib ? await presetFolder(lib, 'Components') : null;

  // Header TOP images: DAM (own collection) or image components in Components/<imageFolder>
  const url = {};
  if (dam) {
    const cid = await damCollection(c.headerTop.damCollection);
    for (const i of c.headerTop.images) url[i.file] = await damImage(cid, i.file);
  } else {
    const folder = await ensureFolder(lib, comps, c.headerTop.imageFolder, `Components/${c.headerTop.imageFolder}`);
    for (const i of c.headerTop.images) {
      await ensureImageComponent(lib, folder, i.component, i.file, `${c.headerTop.imageFolder}/${i.component}`);
      url[i.file] = `[Component name="${libName}/${c.headerTop.imageFolder}/${i.component}" rendition="auto" format="url"]`;
    }
  }
  // HTML components with those images: header TOP and the ÓRBITA brand of the footer
  mkdirSync(join(LOG_DIR, 'preview'), {recursive: true});
  for (const k of [c.headerTop, c.footerBrand].filter(Boolean)) {
    let html = text(k.file).replace(/\{\{image:([^}]+)\}\}/g, (all, f) => url[f] || fail(`${k.file}: ${all} is not in headerTop.images`));
    // Chart options: "Powered by HCL Software" (theme.hclLogo) and the assistant button (theme.assistantButton)
    if (values.theme.hclLogo === false) html = html.replace(/\s*<span class="orbitaTop__hcl">[\s\S]*?<\/span>\s*<\/span>/, '');
    if (values.theme.assistantButton === false) html = html.replace(/\s*<button type="button" class="orbitaTop__chat"[\s\S]*?<\/button>/, '');
    writeFileSync(join(LOG_DIR, 'preview', `${k.component}.html`), html);
    await ensureHtmlComponent(lib, comps, k.component, html, k.component);
  }

  // Parent site area with the Setting template and its fields
  const tl = await libraryId(themeLib);
  const st = tl ? await findItem(tl, 'SiteAreaTemplate', c.parentArea.template) : null;
  if (!st && !DRY) fail(`site area template ${c.parentArea.template} not found: run the templates step first`);
  const parent = lib ? await ensureSiteArea(lib, null, c.parentArea.name, st, c.parentArea.name) : (log(`  site area ${c.parentArea.name}: to create`), null);
  const fields = cfgOf(c.parentArea.fields);
  if (parent) {
    const xml = await get(`SiteArea/${parent}`);
    const cur = readElements(xml);
    const byName = Object.fromEntries(cur.map((e) => [e.name, e]));
    // Text fields: only filled when missing or empty, so the values changed in the portal are kept;
    // --reset-fields=a,b writes the model value of those fields even if they have one
    const reset = (process.argv.find((a) => a.startsWith('--reset-fields=')) || '').slice(15).split(',').filter(Boolean);
    for (const r of reset) if (!fields.some((f) => f.name === r && (f.file || f.value))) fail(`--reset-fields: "${r}" is not a text field of ${c.parentArea.fields}`);
    const fill = fields.filter((f) => f.type !== 'ImageComponent' && (f.file || f.value)
      && (!byName[f.name]?.value?.trim() || (reset.includes(f.name) && !sameHtml(byName[f.name].value, f.file ? text(f.file) : f.value))));
    const addImages = fields.filter((f) => f.type === 'ImageComponent' && !byName[f.name]);
    if (fill.length || addImages.length) {
      if (DRY) log(`  Setting fields to fill: ${[...fill, ...addImages].map((f) => f.name).join(', ')}`);
      else {
        const blocks = cur.map((e) => {
          const f = fill.find((x) => x.name === e.name);
          return f ? textElement(e.name, e.type, e.dataType || (e.type === 'HTMLComponent' ? 'text/html' : 'text/plain'), f.file ? text(f.file) : f.value) : e.block;
        });
        for (const f of fill.filter((x) => !byName[x.name])) blocks.push(textElement(f.name, f.type, f.type === 'HTMLComponent' ? 'text/html' : 'text/plain', f.file ? text(f.file) : f.value));
        for (const f of addImages) blocks.push(EMPTY_IMAGE(f.name));
        await wcm('PUT', `SiteArea/${parent}`, setElements(xml, blocks));
        log(`  Setting fields filled: ${[...fill, ...addImages].map((f) => f.name).join(', ')}`);
      }
    } else log('  Setting fields: already filled (values of the portal kept)');
    for (const f of fields.filter((x) => x.type === 'ImageComponent' && x.image)) {
      if (byName[f.name]?.hasImage) continue;
      if (DRY) { log(`  Setting image ${f.name}: to upload (${f.image})`); continue; }
      await wcm('PUT', `SiteArea/${parent}/elements/${f.name}`, readFileSync(join(HERE, 'theme', 'images', f.image)), imageType(f.image));
      log(`  Setting image ${f.name}: ${f.image} uploaded`);
    }
  } else log(`  Setting fields to fill: ${fields.map((f) => f.name).join(', ')}`);

  // Child site areas (system template), each with its contents
  const ct = tl ? await findItem(tl, 'ContentTemplate', c.contentTemplate) : null;
  for (const a of c.childAreas) {
    const id = await ensureSiteArea(lib, parent ?? undefined, a.name, null, `${c.parentArea.name}/${a.name}`);
    for (const k of a.contents || []) await ensureContent(lib, id, ct, k.name, c.element, text(k.file), `${c.parentArea.name}/${a.name}/${k.name}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Site (label) and pages from the chart values: XMLAccess, each one with its default site area
// ---------------------------------------------------------------------------------------------------------------
const exportRequest = (sel) => `<?xml version="1.0" encoding="UTF-8"?>
<request xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="PortalConfig_8.5.0.xsd" type="export">
  <portal action="locate"><content-node action="export" ${sel}/></portal>
</request>`;
/** XMLAccess export of a page or label by unique name, or null if it does not exist. */
async function exportedNode(uniqueName) {
  const r = await xmlaccess(exportRequest(`uniquename="${esc(uniqueName)}"`));
  return r.ok && r.text.includes(`uniquename="${uniqueName}"`) ? r.text : null;
}
/** Id of the site area at <path> (a/b/c) of a library, or null. */
async function findArea(lib, path) {
  if (!lib) return null;
  const all = entries(await get(`query?type=SiteArea&libraryid=${lib}&pagesize=500`));
  let parent = null;
  for (const name of path.split('/')) {
    let found = null;
    for (const e of all.filter((x) => sameName(nameOf(x), name))) {
      const p = parentOf(await get(`SiteArea/${idOf(e)}`));
      if (parent ? p === parent : !p || p === lib) { found = idOf(e); break; }
    }
    if (!found) return null;
    parent = found;
  }
  return parent;
}

/** Id of the WCM content of a Script Application (any library), or null. */
// Content IDs of the Script Applications just pushed by the Job ("name<TAB>id" lines of APP_IDS_FILE)
const pushedIds = (() => {
  try { return Object.fromEntries(readFileSync(process.env.APP_IDS_FILE, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'))); } catch { return {}; }
})();
async function scriptAppId(name) {
  if (pushedIds[name]) return pushedIds[name];
  const all = entries(await get(`query?type=Content&name=${encodeURIComponent(name)}&pagesize=50`)).filter((e) => nameOf(e) === name);
  if (all.length > 1) log(`  Script Application ${name}: ${all.length} contents with that name, the first one is used`);
  return all.length ? idOf(all[0]) : null;
}

async function installPages() {
  if (!values.pages.create) { log('\n== Pages: not created (pages.create=false)'); return; }
  const SITE = values.pages.mode !== 'home';
  const tplPages = cfgOf('wcm/pages.json');
  const setting = tplPages.pages.find((x) => x.friendly === 'setting');
  // pages.mode site: label pages.site (its own URL /wps/portal/<friendly>), pages orbita-site.<friendly>.
  // pages.mode home: pages orbita.<friendly> under pages.parent, the unique names of chart 3.x (so they are kept).
  const prefix = SITE ? values.pages.site.uniqueName : 'orbita';
  const c = {
    pageTemplate: values.pages.pageTemplate || tplPages.pageTemplate,
    scriptAppSkin: values.pages.skin || tplPages.scriptAppSkin,
    label: {...tplPages.label, uniqueName: values.pages.site.uniqueName, friendly: values.pages.site.friendly,
      title: values.pages.site.title || tplPages.label.title, siteArea: cfgOf('wcm/orbita/orbita.json').parentArea.name,
      access: principals(values.access).map((a) => ({subject: a, type: a === ANON ? 'user' : 'user_group'}))},
    pages: [
      ...values.pages.items.map((i) => ({uniqueName: `${prefix}.${i.friendly}`, title: {es: i.es, en: i.en}, friendly: i.friendly,
        siteArea: `${cfgOf('wcm/orbita/orbita.json').parentArea.name}/${i.friendly}`, scriptApp: `orbita-${i.friendly}`})),
      ...(setting && THEME ? [{...setting, uniqueName: `${prefix}.setting`}] : []),
    ],
  };
  const L = c.label;
  log(SITE ? `\n== Site ${L.uniqueName} (/${L.friendly}) and pages · theme ${cfg.theme.uniqueName}`
    : `\n== Pages under ${values.pages.parent} (pages.mode home) · theme ${cfg.theme.uniqueName}`);
  const param = (k, v) => `<parameter name="${k}" type="string" update="set">${cdata(v)}</parameter>`;
  const titles = (t) => Object.entries(t).map(([l, v]) => `<localedata locale="${l}"><title>${esc(v)}</title></localedata>`).join('');

  // Page template of the target portal: its layout (pagecontents), parameters and containers are copied
  const tpl = await xmlaccess(exportRequest(`uniquename="${esc(c.pageTemplate)}"`));
  const node = (tpl.text.match(/<content-node action="update"[^>]*type="staticpage"[^>]*>([\s\S]*?)\n\s*<\/content-node>/) || [])[1];
  if (!tpl.ok || !node) fail(`cannot export the page template ${c.pageTemplate}: ${tpl.messages.join(' | ')}`);
  const tplId = tpl.text.match(new RegExp(`objectid="([^"]+)"[^>]*uniquename="${c.pageTemplate.replace(/\./g, '\\.')}"`))[1];
  const pagecontents = node.match(/<pagecontents[\s\S]*?<\/pagecontents>/)[0];
  const tplParams = [...node.slice(0, node.indexOf('<access-control')).matchAll(/<parameter name="([^"]+)"[\s\S]*?<\/parameter>/g)]
    .filter((m) => !/^com\.ibm\.portal\.(friendly\.name|Hidden)$/.test(m[1])).map((m) => m[0]);
  const containers = node.slice(node.search(/<component /)).replace(/ objectid="[^"]*"/g, '')
    .replace(/ (deletable|modifiable|skinref|width)="undefined"/g, '');

  // Default site areas (WCM ids)
  const lib = await libraryId(cfg.libraries.content);
  const areas = {};
  for (const p of [...(SITE ? [L.siteArea] : []), ...c.pages.map((x) => x.siteArea)]) {
    areas[p] = await findArea(lib, p);
    if (!areas[p]) (DRY || !THEME ? log : fail)(`  site area ${cfg.libraries.content}/${p}: not found${THEME ? ' (run the orbita step first)' : ' (theme.enabled=false: no default site area)'}`);
  }
  const mapping = (p) => areas[p] ? `<content-mapping-info><content-mapping content-id="${areas[p]}" default="true"/></content-mapping-info>` : '';

  if (SITE) {
    const labelExists = !!(await exportedNode(L.uniqueName));
    log(`  label ${L.uniqueName}: ${labelExists ? 'already there (titles, theme, access and site area updated)' : 'to create'}`);
  }
  const pages = [];
  let viewer = false, skin = false;
  const pref = (k, v) => `<preferences name="${k}" update="set"><value>${cdata(v)}</value></preferences>`;
  // Web Content Viewer: without settings (default content of the page's site area) or showing a Script Application
  const control = (appId) => `<component action="update" active="true" domain="rel" ordinal="100" type="control"${appId ? ' skinref="skin"' : ''}><portletinstance action="update" domain="rel" portletref="viewer">${appId ? [
    pref('WCM_CONTENT_TYPE', 'CONTENT'), pref('WCM_CONTENT_CONTEXT_TYPE', 'content'), pref('WCM_CONTENT_CONTEXT_IDR', appId),
    pref('WCM_CONTENT_CONTEXT_IS_REL_PATH', 'false'), pref('WCM_BROADCASTS_TO', 'WCM_LINKING_NONE'), pref('WCM_LISTENS_TO', 'WCM_LINKING_NONE'),
    pref('WCM_PAGE_TITLE_TYPE', 'WCM_PAGE_TITLE_TYPE_DEFAULT'), pref('WCM_PORTLET_TITLE_TYPE', 'WCM_PORTLET_TITLE_TYPE_DYN')].join('') : ''}</portletinstance></component>`;
  const missingApps = [];
  for (const [n, p] of c.pages.entries()) {
    const exported = await exportedNode(p.uniqueName), exists = !!exported;
    const appId = p.scriptApp ? await scriptAppId(p.scriptApp) : null;
    if (p.scriptApp && !appId) missingApps.push(p.scriptApp);
    let comps = '', what = exists ? 'already there (layout and portlets kept)' : 'to create';
    if (!exists) {
      comps = containers;
      if (p.webContentViewer || appId) {
        viewer = true; skin = skin || !!appId;
        const i = comps.indexOf('ibmMainContainer'), j = comps.indexOf('</component>', i);
        comps = comps.slice(0, j) + control(appId) + '\n                ' + comps.slice(j);
      }
      if (p.scriptApp) what += appId ? ` with the Script Application ${p.scriptApp}` : ` EMPTY (Script Application ${p.scriptApp} not in the portal)`;
    } else if (appId && !exported.includes('<portletinstance')) {
      // Page created before its Script Application was deployed: the viewer is added to its main container
      const root = (exported.match(/<component action="update"[^>]*objectid="(Z7_[^"]+)"/) || [])[1];
      const main = (exported.match(/objectid="(Z7_[^"]+)"[^>]*type="container"[^>]*>\s*<parameter name="com\.ibm\.portal\.layoutnode\.localname"[^>]*><!\[CDATA\[ibmMainContainer/) || [])[1];
      if (!root || !main) fail(`page ${p.uniqueName}: main container not found, add the Script Application ${p.scriptApp} by hand`);
      viewer = true; skin = true;
      comps = `<component action="locate" objectid="${root}"><component action="locate" objectid="${main}">${control(appId)}</component></component>`;
      what += `; Script Application ${p.scriptApp} to add`;
    } else if (p.scriptApp && !appId) what += ` (Script Application ${p.scriptApp} not in the portal)`;
    log(`  page ${p.uniqueName} (${values.pagesBase}${p.friendly}): ${what}`);
    pages.push(`
    <content-node action="update" active="true" allportletsallowed="true" content-parentref="${SITE ? 'label' : 'parent'}" create-type="explicit" domain="rel" objectid="page${n}" ordinal="${(n + 1) * 100}" type="staticpage" uniquename="${esc(p.uniqueName)}"${SITE || !THEME ? '' : ' themeref="theme"'}>
      <supported-markup markup="html" update="set"/>
      ${titles(p.title)}
      ${exists ? '' : pagecontents}
      ${tplParams.join('\n      ')}
      ${param('com.ibm.portal.friendly.name', p.friendly)}
      ${param('com.ibm.portal.Hidden', p.hidden ? 'true' : 'false')}
      ${p.details !== undefined ? param('com.ibm.portal.Details', p.details ? 'true' : 'false') : ''}
      ${param('ibm.template.oid', tplId)}
      ${param('wcm.template.oid', tplId)}
      <access-control externalized="false" owner="undefined" private="false">${(p.blockInheritance || []).map((r) => `<role-block actionset="${esc(r)}" type="inheritance"/>`).join('')}</access-control>
      ${mapping(p.siteArea)}
      ${comps}
    </content-node>`);
  }

  const req = `<?xml version="1.0" encoding="UTF-8"?>
<!-- ÓRBITA · site and pages (generated by the chart hcl-dx-orbita, sitio.mjs) -->
<request xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="PortalConfig_8.5.0.xsd" type="update" create-oids="true">
  <portal action="locate">
    ${skin ? `<skin action="locate" objectid="skin" uniquename="${esc(c.scriptAppSkin)}"/>` : ''}${THEME ? `
    <theme action="locate" objectid="theme" uniquename="${esc(cfg.theme.uniqueName)}"/>` : ''}${viewer ? `
    <web-app action="locate" uid="ilwwcm-localrenderingportlet-jsr.war.webmod">
      <portlet-app action="locate" uid="ilwwcm-localrenderingportlet-jsr.war">
        <portlet action="locate" objectid="viewer" name="Web Content Viewer (JSR 286)"/>
      </portlet-app>
    </web-app>` : ''}
    ${SITE ? `<content-node action="locate" objectid="root" uniquename="wps.content.root"/>
    <content-node action="update" active="true" content-parentref="root" domain="rel" objectid="label"${THEME ? ' themeref="theme"' : ''} type="label" uniquename="${esc(L.uniqueName)}">
      <supported-markup markup="html" update="set"/>
      ${titles(L.title)}
      ${param('com.ibm.portal.friendly.name', L.friendly)}
      <access-control externalized="false" owner="undefined" private="false"><role actionset="User" update="set">
        ${L.access.map((a) => `<mapping subjectid="${esc(a.subject)}" subjecttype="${a.type}" update="set"/>`).join('\n        ')}${SITE_ANONYMOUS ? '' : `\n        <mapping subjectid="${ANON}" subjecttype="user" update="remove"/>`}
      </role></access-control>
      ${mapping(L.siteArea)}
    </content-node>` : `<content-node action="locate" objectid="parent" uniquename="${esc(values.pages.parent)}"/>`}${pages.join('')}
  </portal>
</request>
`;
  mkdirSync(join(LOG_DIR, 'preview'), {recursive: true});
  writeFileSync(join(LOG_DIR, 'preview', 'pages.request.xml'), req);
  if (missingApps.length) manualSteps.push(`Script Applications not in the portal: ${missingApps.join(', ')}. Deploy them (scriptapps of the ÓRBITA chart) and run the pages step again: it adds them to their pages.`);
  if (DRY) { log('  XMLAccess request: logs/preview/pages.request.xml'); return; }
  const r = await xmlaccess(req, 'pages');
  if (!r.ok) fail(`label and pages not saved (logs/pages.result.xml): ${r.messages.join(' | ')}`);
  for (const u of [...(SITE ? [L.uniqueName] : []), ...c.pages.map((p) => p.uniqueName)]) {
    const t = await exportedNode(u);
    if (!t) fail(`${u} not found after the import`);
    const area = u === L.uniqueName ? L.siteArea : c.pages.find((p) => p.uniqueName === u).siteArea;
    if (areas[area] && !t.includes(`content-id="${areas[area]}" default="true"`)) fail(`${u}: its default site area is not ${area}`);
    const pg = c.pages.find((p) => p.uniqueName === u);
    if (pg?.scriptApp && !missingApps.includes(pg.scriptApp) && !t.includes('<portletinstance')) fail(`${u}: its Script Application ${pg.scriptApp} was not added`);
    for (const r of (pg?.blockInheritance || [])) if (!new RegExp(`<role-block actionset="${r}" type="inheritance"`).test(t)) fail(`${u}: the inheritance of the role ${r} is not blocked`);
  }
  log(`  saved and checked: ${BASE}${values.pagesBase.replace('/myportal/', '/portal/')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Access rights of the WCM libraries (DX Core access API, with a portal session): the theme reads its contents,
//    logos and colors on every page, also for anonymous users. Only ADDS principals; it never removes any.
// ---------------------------------------------------------------------------------------------------------------
const CORE = '/dx/api/core/v1';
// The API answers the virtual principals as DNs of the realm ("cn=all authenticated portal users,o=..."): compare names
const principal = (n) => String(n).toLowerCase().replace(/^cn=/, '').replace(/,.*$/, '');
async function installAccess() {
  const A = cfg.access;
  log('\n== Access rights of the libraries');
  const list = await damJson('GET', `${CORE}/dxmyrest/webcontent/libraries?limit=500`);
  if (!list.ok) fail(`cannot list the libraries with the DX Core API (${list.status}): ${list.text.slice(0, 200)}`);
  for (const name of [cfg.libraries.theme, cfg.libraries.content]) {
    const lib = (list.json.contents || []).find((l) => (l.title?.value || '').toLowerCase() === name.toLowerCase());
    if (!lib) { log(`  library ${name}: not found (${DRY ? 'created by the previous steps' : 'run the previous steps first'})`); if (!DRY) fail(`library ${name} not found`); continue; }
    const rid = (lib.links?.accessControl?.href?.match(/resourceId=([^&]+)/) || [])[1];
    if (!rid) fail(`library ${name}: the DX Core API gives no access resource id`);
    const users = async () => ((await damJson('GET', `${CORE}/dxmyrest/access/principals?resourceId=${rid}&roleName=User`)).json?.members || []).map((m) => principal(m.name));
    for (const [role, subjects] of Object.entries(A.libraries)) {
      const have = role === 'User' ? await users() : ((await damJson('GET', `${CORE}/dxmyrest/access/principals?resourceId=${rid}&roleName=${encodeURIComponent(role)}`)).json?.members || []).map((m) => principal(m.name));
      const missing = subjects.filter((s) => !have.includes(principal(s)));
      if (!missing.length) { log(`  library ${name} · ${role}: already ${subjects.join(', ')}`); continue; }
      if (DRY) { log(`  library ${name} · ${role}: to add ${missing.join(', ')}`); continue; }
      if (missing.includes('anonymous portal user')) {
        const r = await damJson('POST', `${CORE}/access/principals?resourceId=${rid}&roleName=${encodeURIComponent(role)}`);
        if (!r.ok) fail(`library ${name}: cannot give ${role} to anonymous (${r.status}): ${r.text.slice(0, 200)}`);
      }
      const groups = missing.filter((s) => s !== 'anonymous portal user');
      if (groups.length) {
        const r = await damJson('POST', `${CORE}/access/permissions?resourceId=${rid}&roleName=${encodeURIComponent(role)}&type=virtual`,
          JSON.stringify({permissionList: groups.map((g) => ({distinguishedName: g}))}), {'Content-Type': 'application/json'});
        if (!r.ok) fail(`library ${name}: cannot give ${role} to ${groups.join(', ')} (${r.status}): ${r.text.slice(0, 200)}`);
      }
      const now = await damJson('GET', `${CORE}/dxmyrest/access/principals?resourceId=${rid}&roleName=${encodeURIComponent(role)}`);
      const still = subjects.filter((s) => !(now.json?.members || []).some((m) => principal(m.name) === principal(s)));
      if (still.length) fail(`library ${name} · ${role}: still missing ${still.join(', ')}`);
      log(`  library ${name} · ${role}: added ${missing.join(', ')}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Steps: all of them, or the ones of --only=theme,templates
// ---------------------------------------------------------------------------------------------------------------
const STEPS = {theme: installTheme, templates: installTemplates, themesetting: installThemeSetting, orbita: installOrbita, pages: installPages, access: installAccess};
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
for (const s of only) if (!STEPS[s]) fail(`unknown step "${s}" (steps: ${Object.keys(STEPS).join(', ')})`);
const run = only.length ? only : THEME ? Object.keys(STEPS) : ['pages'];
for (const [name, step] of Object.entries(STEPS)) if (run.includes(name)) await step();
if (manualSteps.length) {
  log(`\n== TO DO in the portal:`);
  for (const s of manualSteps) log(`  - ${s}`);
}
log(DRY ? '\nDry run finished: nothing was changed.' : '\nDone.');
