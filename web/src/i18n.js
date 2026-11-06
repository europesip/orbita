// Idioma de ÓRBITA (español o inglés), como en Hello DX: primero el idioma del perfil de DX del usuario
// (preferredLanguage, lo devuelve GET /config), después el <html lang> de la página de DX y después el navegador.
// t('Texto en español', {dato}) devuelve el texto en el idioma de la interfaz; los textos en inglés están en en.js,
// con el texto en español como clave. Un texto sin traducción se muestra en español.
import EN from './en.js';

const IDIOMAS = ['es', 'en'];
const corto = (v) => (v || '').toString().trim().toLowerCase().slice(0, 2);

function detectar(perfil) {
  const candidatos = [perfil, typeof document !== 'undefined' && document.documentElement.lang,
    ...(typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]) : [])];
  for (const c of candidatos) if (IDIOMAS.includes(corto(c))) return corto(c);
  return 'en';
}

let idioma = detectar();

/** Fija el idioma con el del perfil de DX (si es es o en; si no, el de la página o el navegador). */
export function fijarIdioma(perfil) { idioma = detectar(perfil); return idioma; }
export const lang = () => idioma;
/** Locale para fechas y números. */
export const locale = () => (idioma === 'en' ? 'en-GB' : 'es-ES');

const poner = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (m, k) => (p[k] === undefined || p[k] === null ? m : p[k])) : s);

/**
 * El texto en el idioma de la interfaz; {nombre} se sustituye por p.nombre. Una clave «texto|contexto» distingue dos
 * usos del mismo texto en español (p. ej. «Volver|pausa»): en español se muestra lo que va antes de la barra.
 */
export function t(es, p) {
  const s = idioma === 'en' && EN[es] !== undefined ? EN[es] : es.split('|')[0];
  return poner(s, p);
}

/** "1 día" / "3 días" en el idioma de la interfaz. */
export const tPlural = (n, uno, varios) => `${n} ${t(n === 1 ? uno : varios)}`;
