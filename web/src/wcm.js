// ÓRBITA · Cliente de HCL DX WCM (API REST v2) para la portada. Va con la sesión de DX de quien mira (mismo host): cada
// persona ve lo que WCM le deja ver y solo quien tiene permiso de editor en la biblioteca puede publicar.
//
// La biblioteca, sus secciones (áreas de sitio) y sus plantillas las crea el chart (files/noticias.mjs). Los nombres de
// los elementos de una plantilla dicen cómo se rellenan en el formulario de ÓRBITA (ver tipoDe).

export const WCM = '/wps/mycontenthandler/wcmrest-v2';

async function pedir(metodo, ruta, cuerpo) {
  const r = await fetch(WCM + ruta, {method: metodo, credentials: 'same-origin',
    headers: {Accept: 'application/json', ...(cuerpo ? {'Content-Type': 'application/json'} : {})}, body: cuerpo ? JSON.stringify(cuerpo) : undefined});
  let j = null;
  try { j = await r.json(); } catch (e) { /* sin JSON */ }
  if (!r.ok) {
    const m = j && j.errors && j.errors.message && j.errors.message[0];
    const e = new Error((m && m.text) || `WCM ${r.status}`);
    e.estado = r.status;
    throw e;
  }
  return j;
}

const valor = (x) => (x && typeof x === 'object' ? x.value : x) || '';

/** Biblioteca por su nombre; null si no existe o no se puede ver. */
export async function biblioteca(nombre) {
  const j = await pedir('GET', '/libraries?limit=250');
  const b = (j['library-entries'] || []).find((x) => x.name === nombre);
  return b ? {id: b.id, titulo: valor(b.title)} : null;
}

/** Secciones (áreas de sitio de la biblioteca): [{id, nombre, titulo}]. */
export async function secciones(lib) {
  const j = await pedir('GET', `/site-areas?libraryID=${lib}&limit=250`);
  return (j['site-areas'] || []).map((s) => ({id: s.id, nombre: s.name, titulo: valor(s.title)}));
}

/** Plantillas de autor: [{id, nombre, titulo, descripcion, elementos: [{nombre, titulo, tipoWcm, tipo}]}]. */
export async function plantillas(lib) {
  const j = await pedir('GET', `/content-templates?libraryID=${lib}&limit=250`);
  return (j['content-templates'] || []).map((p) => ({
    id: p.id, nombre: p.name, titulo: valor(p.title), descripcion: valor(p.description),
    elementos: Object.values(p.data || {}).map((e) => ({nombre: e.name, titulo: valor(e.title) || e.name, tipoWcm: e.type, tipo: tipoDe(e.name, e.type)})),
  }));
}

/** Cómo se rellena un elemento: por su tipo de WCM y, en los textos cortos, por el principio de su nombre. */
export function tipoDe(nombre, tipoWcm) {
  if (tipoWcm === 'RichTextComponent') return 'rico';
  if (tipoWcm === 'TextComponent') return 'largo';
  if (tipoWcm !== 'ShortTextComponent') return null;           // otros tipos: no se rellenan desde ÓRBITA
  if (/^imagen/i.test(nombre)) return 'imagen';
  if (/^fecha/i.test(nombre)) return 'fecha';
  if (/^enlace/i.test(nombre)) return 'enlace';
  return 'texto';
}

const fechaWcm = (s) => { const d = s ? new Date(s) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; };

/** Noticias publicadas de la biblioteca, de la más reciente a la más antigua. */
export async function noticias(lib, plantillasPorId, seccionesPorId) {
  const j = await pedir('GET', `/contents?libraryID=${lib}&limit=200`);
  return (j['content-entries'] || []).filter((c) => !c.status || c.status === 'PUBLISHED').map((c) => {
    const campos = {};
    for (const [k, e] of Object.entries(c.data || {})) campos[k] = valor(e && e.data);
    const p = plantillasPorId[c.templateID], s = seccionesPorId[c.parentID];
    return {id: c.id, titulo: valor(c.title), plantilla: p ? p.nombre : null, seccion: s ? s.nombre : null,
      fecha: fechaWcm(c.published) || fechaWcm(c.created) || fechaWcm(c.lastModified), campos};
  }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

/** Publica una noticia (solo quien es editor en WCM): devuelve el id del contenido creado. */
export async function publicar({lib, seccion, plantilla, titulo, campos}) {
  const data = {};
  for (const e of plantilla.elementos) {
    if (!e.tipo) continue;
    const v = (campos[e.nombre] && campos[e.nombre].valor) || '';
    data[e.nombre] = {name: e.nombre, type: e.tipoWcm, data: {type: e.tipoWcm === 'RichTextComponent' ? 'text/html' : 'text/plain', value: v}};
  }
  const nombre = `${titulo.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'noticia'}-${Date.now().toString(36)}`;
  const j = await pedir('POST', '/contents', {title: {lang: 'es', value: titulo}, name: nombre, type: 'Content', libraryID: lib,
    parentID: seccion, templateID: plantilla.id, data});
  return j.id;
}

/** Retira una noticia publicada (solo editores). */
export const retirar = (id) => pedir('DELETE', `/contents/${id}`);

// ---------------------------------------------------------------------------------------------------------------
// Texto enriquecido: la misma lista blanca que el servidor (Html.java). Las noticias escritas en Content Composer no
// pasan por ÓRBITA, así que también se limpian al mostrarlas.
const PERMITIDAS = new Set(['P', 'BR', 'STRONG', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'A', 'HR']);
const EQUIV = {B: 'STRONG', I: 'EM', STRIKE: 'S', DEL: 'S', H1: 'H2', H5: 'H4', H6: 'H4'};
const FUERA = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'SELECT', 'HEAD', 'TITLE']);

export function enlaceSeguro(v) {
  const l = String(v || '').trim().toLowerCase().replace(/[\s\x00-\x1f]/g, '');
  return l.startsWith('https://') || l.startsWith('http://') || l.startsWith('mailto:') || (l.startsWith('/') && !l.startsWith('//'));
}

export function limpiarHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const salida = document.createElement('div');
  const copiar = (origen, destino) => {
    for (const n of Array.from(origen.childNodes)) {
      if (n.nodeType === 3) { destino.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1 || FUERA.has(n.tagName)) continue;
      const tag = EQUIV[n.tagName] || n.tagName;
      if (!PERMITIDAS.has(tag)) { copiar(n, destino); continue; }
      if (tag === 'A' && !enlaceSeguro(n.getAttribute('href'))) { copiar(n, destino); continue; }
      const e = document.createElement(tag);
      if (tag === 'A') { e.setAttribute('href', n.getAttribute('href').trim()); e.setAttribute('rel', 'noopener noreferrer'); e.setAttribute('target', '_blank'); }
      copiar(n, e);
      destino.appendChild(e);
    }
  };
  copiar(doc.body, salida);
  return salida.innerHTML;
}

export const textoPlano = (html) => new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
