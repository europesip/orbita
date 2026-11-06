// Ajustes de cada instancia de una aplicación de ÓRBITA en una página de DX (preferencias de la Script Application).
//
// DX crea para cada Script Application de la página un objeto global ns_<instancia>_spHelper (módulo wp_client_ext
// del tema) con getPortletPreferences() y setPortletPreferences(datos): los datos son un JSON que DX guarda en la
// preferencia com.ibm.portal.scriptpreference de esa instancia. La app conoce su instancia por data-ns (DX cambia el
// marcador de espacio de nombres del HTML por ns_..._). Los ajustes los cambia quien edita la página, en el modo
// edición del tema (<body class="edit-mode">); los valores del chart (ui.*) son los de partida.
//
// Ajustes: {cabecera: {titulo, inicio, asistente, avisos, usuario}, pie, idioma: 'es' | 'en'} (lo que no está, del chart).
import {t} from './i18n.js';

/** El spHelper de la instancia de este contenedor .si-app, o null fuera de DX (vista previa, pruebas). */
export function ayudante(raiz) {
  const ns = raiz && raiz.dataset ? raiz.dataset.ns : '';
  if (ns && /^ns_\w+_$/.test(ns) && window[`${ns}spHelper`]) return window[`${ns}spHelper`];
  // Sin data-ns sustituido: si en la página hay un solo spHelper, es el de esta aplicación
  const todos = Object.keys(window).filter((k) => /^ns_\w+_spHelper$/.test(k));
  return todos.length === 1 ? window[todos[0]] : null;
}

/** El idioma del perfil de DX y el de la página, según el spHelper ('' si no lo dice). */
export function idiomasDx(h) {
  return h ? {usuario: h.userLanguage || '', pagina: h.renderingLocale || ''} : {usuario: '', pagina: ''};
}

// Las promesas del tema (i$.Promise) solo tienen then: se pasan a promesas normales
const promesa = (p) => new Promise((ok, mal) => p.then(ok, mal));

/** Ajustes guardados de la instancia ({} si no hay, o fuera de DX). */
export async function leerAjustes(h) {
  if (!h) return {};
  try {
    const d = await promesa(h.getPortletPreferences());
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch (e) {
    return {};
  }
}

/** Guarda los ajustes de la instancia (lanza Error si DX no los acepta). */
export async function guardarAjustes(h, ajustes) {
  if (!h) throw new Error(t('Los ajustes solo se pueden guardar en una página de DX.'));
  try {
    await promesa(h.setPortletPreferences(ajustes));
  } catch (e) {
    const texto = (e && (e.message || e.errorMessage)) || String(e);
    // EJPEK0020E / 403: el usuario edita la página pero no tiene permiso sobre los ajustes compartidos de la aplicación
    if (/\b403\b|EJPEK0020E/.test(texto)) throw new Error(t('No tienes permiso para cambiar los ajustes de esta aplicación: hace falta el rol Editor (o superior) sobre ella en DX.'));
    throw new Error(texto);
  }
}

/** true si la página está en modo edición (y se vigila: el tema lo cambia sin recargar en algunos casos). */
export const enEdicion = () => document.body.classList.contains('edit-mode');
export function vigilarEdicion(cambio) {
  const o = new MutationObserver(() => cambio(enEdicion()));
  o.observe(document.body, {attributes: true, attributeFilter: ['class']});
  return () => o.disconnect();
}
