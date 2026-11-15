// ÓRBITA · news of the landing page in HCL DX WCM (see after-push.sh). Runs in the DXClient container (/dxclient),
// after the push, as the DX administrator of the Job. Idempotent: what already exists is kept (also the changes the
// editors make to the templates).
//   node noticias.mjs <noticias.json> <assets dir>
//
//  1. WCM library news.library (title news.title): everybody reads it (User); news.editors (LDAP groups or users,
//     usually the HR / communication team) get Editor, which lets them publish from the ÓRBITA landing page and write
//     in Content Composer.
//  2. Site areas, one per section of the landing page (company, people, events, teams).
//  3. Five authoring templates with their presentation template: news item, short news item, event, welcome and team
//     achievement. Without a WCM workflow: the review happens in ÓRBITA (the WCM REST API does not let users move
//     content through a workflow in CF238), and the content is created already published.
//     Element names say how ÓRBITA's form shows them: Imagen* image, Fecha* date and time, Enlace* link, Diseno* the
//     design of the news item (clasico, portada, columnas, cartel, cita, revista, cine, titular, diagonal, cuenta,
//     celebracion), a rich text element is the body, a text
//     element is a long text and any other short text is a short text. Elements added in a new version of ÓRBITA are
//     added to templates that already exist (nothing is removed).
//  4. Demo news (news.demo, only when the library has no content): the images go to the DAM collection news.damCollection.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const [cfgFile, assetsDir] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'));
if (!cfg.enabled) { console.log('news: not set up (news.enabled=false)'); process.exit(0); }
const e = process.env;
const BASE = `${e.DX_PROTOCOL}://${e.DX_HOST}:${e.DX_PORT}`;
const CH = e.DX_CONTENT_HANDLER_PATH || '/wps/mycontenthandler';
const W = `${BASE}${CH}/wcmrest-v2`, W1 = `${BASE}${CH}/wcmrest`, CORE = `${BASE}/dx/api/core/v1`, DAM = `${BASE}/dx/api/dam/v1`;
const v1 = (t, id) => `${CH}/wcmrest/${t}/${id}`, v2 = (t, id) => `${CH}/wcmrest-v2/${t}/${id}`;
const log = (m) => console.log(`news: ${m}`);
const fail = (m) => { console.error(`news: ERROR ${m}`); process.exit(1); };

let cookie = '';
async function login() {
  const r = await fetch(`${CORE}/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username: e.DX_USERNAME, password: e.DX_PASSWORD})});
  if (!r.ok) fail(`DX login answered ${r.status}`);
  cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => !/=$/.test(c)).join('; ');
  // With OpenID Connect the REST login answers without an SSO cookie: portal login form (see tema.mjs)
  if (!/(^|; )(LtpaToken2|WAS_n[^=]*)=[^;]/.test(cookie) && cfg.formLogin !== false) {
    const root = CH.replace(/\/mycontenthandler$/, '');
    const f = await fetch(`${BASE}${root}/j_security_check`, {method: 'POST', redirect: 'manual',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({j_username: e.DX_USERNAME, j_password: e.DX_PASSWORD})});
    cookie = f.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => /^(LtpaToken2|WAS_n[^=]*)=[^;]/.test(c)).join('; ');
    if (!/(^|; )(LtpaToken2|WAS_n[^=]*)=[^;]/.test(cookie)) fail(`DX did not open a session (form login answered ${f.status})`);
  }
}

async function call(method, url, body, headers = {}) {
  const json = body !== undefined && !(body instanceof FormData);
  const r = await fetch(url, {method, headers: {Cookie: cookie, Accept: 'application/json', ...(json ? {'Content-Type': 'application/json'} : {}), ...headers},
    body: json ? JSON.stringify(body) : body});
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* no JSON */ }
  return {ok: r.ok, status: r.status, json: j, text};
}
const idDe = (r) => (r.json && (r.json.id || (r.json.entry && r.json.entry.id))) || null;
const corto = (r) => r.text.replace(/\s+/g, ' ').slice(0, 300);

// ---- Definitions -------------------------------------------------------------------------------------------------
const SECCIONES = [
  {name: 'empresa', title: 'Empresa'},
  {name: 'personas', title: 'Personas'},
  {name: 'eventos', title: 'Eventos'},
  {name: 'equipos', title: 'Equipos'},
];
const corta = (name, title, help) => ({name, title, type: 'ShortTextComponent', help});
const rica = (name, title) => ({name, title, type: 'RichTextComponent'});
// Design of the news item: ÓRBITA shows it with one of these layouts (empty: clasico)
const diseno = () => corta('Diseno', 'Diseño (clasico, portada, columnas, cartel, cita, revista, cine, titular, diagonal, cuenta o celebracion)');
const PLANTILLAS = [
  {name: 'noticia', title: 'Noticia', description: 'Noticia completa con imagen, entradilla y texto.', seccion: 'empresa',
    elements: [corta('Entradilla', 'Entradilla'), corta('Imagen', 'Imagen (dirección)'), rica('Cuerpo', 'Texto'), diseno()]},
  {name: 'breve', title: 'Noticia breve', description: 'Dos líneas y, si hace falta, un enlace.', seccion: 'empresa',
    elements: [corta('Entradilla', 'Entradilla'), corta('Enlace', 'Enlace (https://...)'), diseno()]},
  {name: 'evento', title: 'Evento', description: 'Un evento con fecha, lugar e imagen.', seccion: 'eventos',
    elements: [corta('Entradilla', 'Entradilla'), corta('Imagen', 'Imagen (dirección)'), corta('Fecha', 'Empieza (aaaa-mm-ddThh:mm)'),
      corta('FechaFin', 'Termina (aaaa-mm-ddThh:mm)'), corta('Lugar', 'Lugar'), rica('Cuerpo', 'Texto'), diseno()]},
  {name: 'bienvenida', title: 'Bienvenida', description: 'Presenta a una persona que se incorpora.', seccion: 'personas',
    elements: [corta('Entradilla', 'Entradilla'), corta('Imagen', 'Imagen (dirección)'), corta('Puesto', 'Puesto y equipo'), rica('Cuerpo', 'Texto'), diseno()]},
  {name: 'logro', title: 'Logro de equipo', description: 'Celebra un logro de un equipo.', seccion: 'equipos',
    elements: [corta('Entradilla', 'Entradilla'), corta('Imagen', 'Imagen (dirección)'), corta('Equipo', 'Equipo'), rica('Cuerpo', 'Texto'), diseno()]},
];
const datosVacios = (t) => (t === 'RichTextComponent' ? {type: 'text/html', value: ''} : {type: 'text/plain', value: ''});

// Presentation template: how WCM shows the content outside ÓRBITA (a Web Content Viewer, Content Composer preview)
const tag = (k) => `[Element context="current" type="content" key="${k}"]`;
function presentacion(p) {
  const tiene = (k) => p.elements.some((x) => x.name === k);
  const css = '<style>.orbita-nota{font-family:"IBM Plex Sans",Arial,sans-serif;max-width:760px;margin:0 auto;color:#161616}'
    + '.orbita-nota h1{font-weight:400;font-size:32px;line-height:1.2;margin:16px 0 8px}.orbita-nota .entradilla{font-size:19px;color:#525252;margin:0 0 16px}'
    + '.orbita-nota img{width:100%;border-radius:4px}.orbita-nota .datos{display:flex;gap:16px;color:#0f62fe;font-weight:600;margin:8px 0}'
    + '.orbita-nota .cuerpo{font-size:16px;line-height:1.6}</style>';
  return css + '<article class="orbita-nota">'
    + (tiene('Imagen') ? `<img src='${tag('Imagen')}' alt=''>` : '')
    + '<h1>[Property context="current" type="content" field="title"]</h1>'
    + (tiene('Entradilla') ? `<p class="entradilla">${tag('Entradilla')}</p>` : '')
    + (tiene('Fecha') || tiene('Lugar') || tiene('Equipo') || tiene('Puesto')
      ? `<p class="datos">${['Fecha', 'Lugar', 'Equipo', 'Puesto'].filter(tiene).map((k) => `<span>${tag(k)}</span>`).join('')}</p>` : '')
    + (tiene('Cuerpo') ? `<div class="cuerpo">${tag('Cuerpo')}</div>` : '')
    + (tiene('Enlace') ? `<p><a href='${tag('Enlace')}'>${tag('Enlace')}</a></p>` : '')
    + '</article>';
}

// ---- 1. Library and access ---------------------------------------------------------------------------------------
async function biblioteca() {
  const l = await call('GET', `${W}/libraries?limit=250`);
  if (!l.ok) fail(`cannot list the WCM libraries (${l.status}): ${corto(l)}`);
  let lib = (l.json['library-entries'] || []).find((x) => x.name === cfg.library);
  if (lib) return lib.id;
  const n = await call('POST', `${W}/libraries`, {title: cfg.title, name: cfg.library,
    data: {allowDeletion: false, enabled: true, language: cfg.language || 'es', includeDefaultItems: false}});
  if (!n.ok) fail(`cannot create the WCM library "${cfg.library}" (${n.status}): ${corto(n)}`);
  log(`WCM library "${cfg.title}" created`);
  return idDe(n);
}

async function permisos(L) {
  const lc = await call('GET', `${CORE}/dxmyrest/webcontent/libraries/${L}`);
  const href = lc.json && lc.json.links && lc.json.links.accessControl && lc.json.links.accessControl.href;
  if (!href) fail(`cannot read the access control of the library (${lc.status})`);
  const rid = encodeURIComponent(new URLSearchParams(href.split('?')[1]).get('resourceId'));
  // Granting a role again answers an error that is ignored
  const dar = async (rol, dn, tipo) => {
    const r = await call('POST', `${CORE}/access/permissions?resourceId=${rid}&roleName=${rol}&type=${tipo}`, {permissionList: [{distinguishedName: dn}]});
    if (!r.ok && r.status !== 409) log(`warning: ${rol} for ${dn} answered ${r.status}`);
  };
  await dar('User', 'all authenticated portal users', 'virtual');
  for (const dn of cfg.editors || []) await dar('Editor', dn, /^(cn|ou)=/i.test(dn) ? 'group' : 'user');
  log(`access: everybody reads${(cfg.editors || []).length ? `, editors: ${cfg.editors.join('; ')}` : ' (no editors in news.editors: only DX administrators publish)'}`);
}

// ---- 2. Site areas -----------------------------------------------------------------------------------------------
async function secciones(L) {
  const r = await call('GET', `${W}/site-areas?libraryID=${L}&limit=250`);
  const hay = new Map((((r.json && (r.json['site-area-entries'] || r.json['site-areas'] || r.json.contents)) || [])).map((x) => [x.name, x.id]));
  for (const s of SECCIONES) {
    if (hay.has(s.name)) continue;
    const n = await call('POST', `${W}/site-areas`, {title: {lang: 'es', value: s.title}, name: s.name, type: 'SiteArea', libraryID: L, parentID: L});
    if (!n.ok) fail(`cannot create the site area "${s.name}" (${n.status}): ${corto(n)}`);
    hay.set(s.name, idDe(n));
    log(`site area "${s.title}" created`);
  }
  return hay;
}

// ---- 3. Templates ------------------------------------------------------------------------------------------------
async function plantillas(L) {
  const r = await call('GET', `${W}/content-templates?libraryID=${L}&limit=250`);
  const hay = new Map(((r.json && r.json['content-templates']) || []).map((x) => [x.name, x.id]));
  for (const p of PLANTILLAS) {
    if (hay.has(p.name)) {
      // Existing template: add the elements of this version that it does not have yet (an editor may have added more)
      const g = await call('GET', `${W}/content-templates/${hay.get(p.name)}`);
      const faltan = g.ok ? p.elements.filter((x) => !(g.json.data || {})[x.name]) : [];
      if (faltan.length) {
        const body = g.json;
        body.data = {...(body.data || {}), ...Object.fromEntries(faltan.map((x) => [x.name, {name: x.name, title: {lang: 'es', value: x.title}, type: x.type, data: datosVacios(x.type)}]))};
        const u = await call('PUT', `${W}/content-templates/${hay.get(p.name)}`, body);
        log(u.ok ? `template "${p.title}": added ${faltan.map((x) => x.name).join(', ')}` : `warning: cannot update the template "${p.name}" (${u.status}): ${corto(u)}`);
      }
      continue;
    }
    const data = Object.fromEntries(p.elements.map((x) => [x.name, {name: x.name, title: {lang: 'es', value: x.title}, type: x.type, data: datosVacios(x.type)}]));
    const at = await call('POST', `${W}/content-templates`, {title: {lang: 'es', value: p.title}, name: p.name, type: 'ContentTemplate', libraryID: L,
      description: {lang: 'es', value: p.description}, data});
    if (!at.ok) fail(`cannot create the authoring template "${p.name}" (${at.status}): ${corto(at)}`);
    const id = idDe(at);
    const pt = await call('POST', `${W}/PresentationTemplate`, {entry: {title: {lang: 'es', value: p.title}, name: `${p.name}-presentacion`,
      type: 'PresentationTemplate', link: [{rel: 'library', href: v2('libraries', L)}], content: {type: 'text/html', value: presentacion(p)}}});
    if (!pt.ok) log(`warning: presentation template of "${p.name}" answered ${pt.status}: ${corto(pt)}`);
    // No WCM workflow (created already published) and, if WCM accepts it, its default presentation template
    const g = await call('GET', `${W}/content-templates/${id}`);
    const body = g.json;
    const sinFlujo = {'workflow-control': {option: [{name: 'ENABLE_WORKFLOW', enabled: false}, {name: 'HIDE_WORKFLOW_SECTION', enabled: true}]}};
    body.contentProperties = {...(body.contentProperties || {}), ...sinFlujo,
      ...(idDe(pt) ? {link: [{rel: 'default-presentation', href: v2('PresentationTemplate', idDe(pt))}]} : {})};
    let u = await call('PUT', `${W}/content-templates/${id}`, body);
    if (!u.ok) {
      body.contentProperties = {...(g.json.contentProperties || {}), ...sinFlujo};
      u = await call('PUT', `${W}/content-templates/${id}`, body);
    }
    if (!u.ok) fail(`cannot disable the WCM workflow of "${p.name}" (${u.status}): ${corto(u)}`);
    hay.set(p.name, id);
    log(`template "${p.title}" created`);
  }
  return hay;
}

// ---- 4. Demo news ------------------------------------------------------------------------------------------------
async function coleccion(nombre) {
  const r = await call('GET', `${DAM}/collections?query=${encodeURIComponent(nombre)}&limit=100`);
  let c = r.ok && (r.json.contents || []).find((x) => x.name === nombre);
  if (!c) {
    const n = await call('POST', `${DAM}/collections`, {name: nombre, description: 'ÓRBITA: images of the demo news of the landing page.'});
    if (!n.ok) fail(`cannot create the DAM collection "${nombre}" (${n.status}): ${corto(n)}`);
    c = n.json;
  }
  const rid = encodeURIComponent(c.accessreferenceid);
  await call('POST', `${CORE}/access/permissions?resourceId=${rid}&roleName=User&type=virtual`, {permissionList: [{distinguishedName: 'all authenticated portal users'}]});
  return c.id;
}

async function imagenDam(cid, fichero) {
  const items = await call('GET', `${DAM}/collections/${cid}/items?limit=200`);
  let item = items.ok && (items.json.contents || []).find((x) => x.name === fichero);
  if (!item) {
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(join(assetsDir, fichero))], {type: 'image/jpeg'}), fichero);
    fd.append('name', fichero);
    const r = await call('POST', `${DAM}/collections/${cid}/items`, fd);
    if (!r.ok || !r.json || !r.json.mediaInfo) fail(`cannot upload ${fichero} to the DAM (${r.status}): ${corto(r)}`);
    item = r.json.mediaInfo;
  }
  for (let i = 0; i < 60; i++) {
    const r = await call('GET', `${DAM}/collections/${cid}/items/${item.id}/renditions`);
    const o = r.ok && (r.json.contents || []).find((x) => x.renditionType === 'Original' && x.binaryUrl);
    if (o) return `/dx/api/dam/v1${o.binaryUrl}`;
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  return fail(`the DAM did not create the original rendition of ${fichero}`);
}

const enDias = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString().slice(0, 16); };
function demos(img) {
  return [
    {plantilla: 'noticia', seccion: 'empresa', titulo: 'Abrimos la nueva cafetería de la planta 2',
      campos: {Diseno: 'portada', Entradilla: 'Más espacio, café de especialidad y una zona para reuniones informales.', Imagen: img.cafeteria,
        Cuerpo: '<p>Desde el lunes la planta 2 tiene <strong>cafetería nueva</strong>: el doble de mesas, enchufes en todas ellas y una zona tranquila para reuniones rápidas.</p><p>El café de especialidad es gratuito de 8:00 a 10:00. Gracias al equipo de Servicios Generales por el trabajo de estas semanas.</p>'}},
    {plantilla: 'evento', seccion: 'eventos', titulo: 'Comida de Navidad 2026',
      campos: {Diseno: 'cuenta', Entradilla: 'Nos vemos para celebrar el año: comida, música y el sorteo de siempre.', Imagen: img.evento, Fecha: enDias(30, 14), FechaFin: enDias(30, 18),
        Lugar: 'Restaurante La Terraza, Madrid', Cuerpo: '<p>Este año la comida de Navidad es en <strong>La Terraza</strong>. Habrá menú vegetariano y sin gluten.</p><p>Apúntate antes del día 15 para reservar tu plaza.</p>'}},
    {plantilla: 'bienvenida', seccion: 'personas', titulo: 'Damos la bienvenida a Pablo',
      campos: {Diseno: 'celebracion', Entradilla: 'Pablo se incorpora al equipo de Soporte en Tecnología.', Imagen: img.bienvenida, Puesto: 'Técnico de soporte · Tecnología',
        Cuerpo: '<p>Pablo viene de cinco años en soporte de sistemas y le encantan los teclados mecánicos. Si tienes una incidencia, ya sabes a quién saludar.</p>'}},
    {plantilla: 'logro', seccion: 'equipos', titulo: 'Ventas cierra el mejor trimestre de su historia',
      campos: {Diseno: 'cine', Entradilla: 'Un 18 % por encima del objetivo y tres clientes nuevos en Valencia.', Imagen: img.logro, Equipo: 'Ventas',
        Cuerpo: '<p>Enhorabuena a todo el equipo de Ventas: el trimestre se cierra un <strong>18 % por encima</strong> del objetivo.</p><ul><li>Tres clientes nuevos en Valencia.</li><li>La renovación del contrato marco con nuestro mayor cliente.</li></ul>'}},
    {plantilla: 'noticia', seccion: 'empresa', titulo: 'ÓRBITA ya tiene portada',
      campos: {Diseno: 'revista', Entradilla: 'Noticias, comunicados, eventos y celebraciones en un solo sitio. Y cualquiera puede proponer una noticia.', Imagen: img.empresa,
        Cuerpo: '<p>Desde hoy la intranet tiene <strong>portada</strong>. Las noticias se publican en HCL DX y se proponen desde ÓRBITA con una plantilla: RRHH las revisa antes de publicarlas.</p>'}},
    {plantilla: 'breve', seccion: 'empresa', titulo: 'El viernes cerramos a las 15:00',
      campos: {Diseno: 'titular', Entradilla: 'Por el puente, la oficina cierra el viernes a las 15:00. ¡Buen fin de semana largo!', Enlace: ''}},
  ];
}

async function demo(L, secc, ats) {
  if (!cfg.demo) return;
  const c = await call('GET', `${W}/contents?libraryID=${L}&limit=1`);
  if (c.ok && Number(c.json.total || 0) > 0) { log('demo news: the library already has content'); return; }
  const cid = await coleccion(cfg.damCollection);
  const img = {};
  for (const n of ['cafeteria', 'evento', 'bienvenida', 'logro', 'empresa']) img[n] = await imagenDam(cid, `${n}.jpg`);
  let n = 0;
  for (const d of demos(img)) {
    const p = PLANTILLAS.find((x) => x.name === d.plantilla);
    const data = Object.fromEntries(p.elements.map((x) => [x.name, {name: x.name, type: x.type,
      data: {...datosVacios(x.type), value: d.campos[x.name] || ''}}]));
    const r = await call('POST', `${W}/contents`, {title: {lang: 'es', value: d.titulo}, name: d.titulo.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      type: 'Content', libraryID: L, parentID: secc.get(d.seccion), templateID: ats.get(d.plantilla), data});
    if (!r.ok) { log(`warning: demo news "${d.titulo}" answered ${r.status}: ${corto(r)}`); continue; }
    n++;
  }
  log(`${n} demo news published`);
}

await login();
const L = await biblioteca();
await permisos(L);
const secc = await secciones(L);
const ats = await plantillas(L);
await demo(L, secc, ats);
log(`ready: library "${cfg.title}" (${cfg.library}), ${secc.size} sections, ${ats.size} templates`);
