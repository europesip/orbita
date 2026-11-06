// Idioma de ÓRBITA (español o inglés), como en Hello DX: primero el idioma del perfil de DX del usuario
// (preferredLanguage, lo devuelven GET /config y el spHelper de DX), después el idioma con el que DX pinta la página
// (renderingLocale del spHelper o <html lang>) y después el navegador. Quien edita la página puede fijarlo por
// instancia (preferencias.js).
// t('Texto en español', {dato}) devuelve el texto en el idioma de la interfaz; los textos en inglés están en en.js,
// con el texto en español como clave. Un texto sin traducción se muestra en español.
import EN from './en.js';

const IDIOMAS = ['es', 'en'];
const corto = (v) => (v || '').toString().trim().toLowerCase().slice(0, 2);

function detectar(...primero) {
  const candidatos = [...primero, typeof document !== 'undefined' && document.documentElement.lang,
    ...(typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]) : [])];
  for (const c of candidatos) if (IDIOMAS.includes(corto(c))) return corto(c);
  return 'en';
}

let idioma = detectar();

/**
 * Fija el idioma: el primero que sea es o en de los que se pasan (ajuste de la instancia, perfil de DX, idioma con el
 * que DX pinta la página) y, si no, el <html lang> o el navegador.
 */
export function fijarIdioma(...primero) { idioma = detectar(...primero); return idioma; }
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
