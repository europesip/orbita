// Piezas comunes de ÓRBITA: llamada a la API, formatos (en el idioma de la interfaz) y componentes de interfaz.
import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {lang, locale, t} from './i18n.js';
import CONTRATO from '../../api/rutas.json';

export const Suite = createContext(null);
export const useSuite = () => useContext(Suite);

const RUTAS_API = Object.fromEntries(CONTRATO.rutas.map((r) => [r.op, r]));

/**
 * Cliente de la API REST de ÓRBITA (base: data-api, p. ej. /orbita-api/v1). api(op, parámetros) busca la ruta de la
 * operación en api/rutas.json (el mismo contrato que usa el servidor): los {parámetros} de la ruta van en la URL, el
 * resto en la consulta (GET y DELETE) o en un cuerpo JSON (POST y PUT). La sesión es la de DX: la cookie la envía el
 * navegador (mismo host). Lanza Error con el mensaje del servidor.
 */
export function crearApi(base) {
  return async (op, params = {}) => {
    const def = RUTAS_API[op];
    if (!def) throw new Error(t('Operación desconocida: {op}', {op}));
    const resto = {...params};
    const ruta = def.ruta.replace(/\{(\w+)\}/g, (_, k) => {
      const v = resto[k];
      delete resto[k];
      if (v === undefined || v === null || v === '') throw new Error(`Falta ${k} en ${op}`);
      return encodeURIComponent(v);
    });
    const conCuerpo = def.metodo === 'POST' || def.metodo === 'PUT';
    const limpio = Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined && v !== null));
    const consulta = !conCuerpo && Object.keys(limpio).length ? `?${new URLSearchParams(limpio)}` : '';
    const r = await fetch(`${base.replace(/\/+$/, '')}/${ruta}${consulta}`, {
      method: def.metodo, credentials: 'same-origin',
      headers: conCuerpo ? {'Content-Type': 'application/json', Accept: 'application/json', 'X-Orbita-Lang': lang()}
        : {Accept: 'application/json', 'X-Orbita-Lang': lang()},
      body: conCuerpo ? JSON.stringify(limpio) : undefined,
    });
    let j = null;
    try { j = await r.json(); } catch (e) { /* sin JSON */ }
    if (r.status === 401) throw new Error((j && j.error) || t('No hay sesión: vuelve a iniciar sesión en el portal.'));
    if (!r.ok || !j) throw new Error((j && j.error) || t('El servidor ha respondido {estado}.', {estado: r.status}));
    return j;
  };
}

/** Configuración de esta instalación (GET /config): páginas del portal, clave del quiosco, modo demo. */
export async function leerConfig(base) {
  const r = await fetch(`${base.replace(/\/+$/, '')}/config`, {credentials: 'same-origin', headers: {Accept: 'application/json', 'X-Orbita-Lang': lang()}});
  let j = null;
  try { j = await r.json(); } catch (e) { /* sin JSON */ }
  if (!r.ok || !j) throw new Error((j && j.error) || t('El servidor ha respondido {estado}.', {estado: r.status}));
  return j;
}

/** Carga datos con la API y permite recargarlos; devuelve [datos, error, recargar, fijar]. */
export function useDatos(op, params, deps) {
  const {api} = useSuite();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const vez = useRef(0);
  const recargar = useCallback(() => {
    const n = ++vez.current;
    return api(op, params).then((d) => { if (n === vez.current) { setDatos(d); setError(null); } return d; })
      .catch((e) => { if (n === vez.current) setError(e.message); });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { recargar(); }, [recargar]);
  return [datos, error, recargar, setDatos];
}

export function useReloj(ms = 1000) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return ahora;
}

// ---------- Formatos ----------
export const dosCifras = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;
export const deIso = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
export const hm = (min) => `${Math.floor(min / 60)}:${dosCifras(Math.abs(min) % 60)}`;
export const horas = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};
export const fecha = (s, o) => deIso(s).toLocaleDateString(locale(), o || {weekday: 'short', day: 'numeric', month: 'short'});
export const rango = (desde, hasta) => {
  if (desde === hasta) return fecha(desde, {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  const a = deIso(desde), b = deIso(hasta);
  const fin = b.toLocaleDateString(locale(), {day: 'numeric', month: 'long', year: 'numeric'});
  const ini = a.toLocaleDateString(locale(), a.getFullYear() === b.getFullYear()
    ? (a.getMonth() === b.getMonth() ? {day: 'numeric'} : {day: 'numeric', month: 'long'}) : {day: 'numeric', month: 'long', year: 'numeric'});
  return `${ini} – ${fin}`;
};
export const nombreMes = (anio, mes) => new Date(anio, mes - 1, 1).toLocaleDateString(locale(), {month: 'long', year: 'numeric'});
export const plural = (n, uno, varios) => `${n} ${t(n === 1 ? uno : varios)}`;

/** Nombre traducido en cada lectura (el idioma se fija al leer GET /config). */
export const traducido = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.defineProperty({...v}, 'nombre',
  {get: () => t(v.nombre), enumerable: true})]));
export const TIPOS_AUSENCIA = traducido({
  VACACIONES: {nombre: 'Vacaciones', color: 'var(--si-azul)'},
  ASUNTOS_PROPIOS: {nombre: 'Asuntos propios', color: 'var(--si-violeta)'},
  PERMISO: {nombre: 'Permiso retribuido', color: 'var(--si-turquesa)'},
  BAJA: {nombre: 'Baja médica', color: 'var(--si-rosa)'},
});
export const ESTADOS = traducido({
  BORRADOR: {nombre: 'Borrador', tono: 'gris'},
  ENVIADA: {nombre: 'Pendiente de aprobar', tono: 'ambar'},
  PENDIENTE: {nombre: 'Pendiente', tono: 'ambar'},
  APROBADA: {nombre: 'Aprobada', tono: 'verde'},
  PAGADA: {nombre: 'Pagada', tono: 'azul'},
  RECHAZADA: {nombre: 'Rechazada', tono: 'rojo'},
  CANCELADA: {nombre: 'Cancelada', tono: 'gris'},
});

/** Importe en céntimos → "1.234,56 €" (es) o "€1,234.56" (en). */
export const euros = (cent) => new Intl.NumberFormat(locale(), {style: 'currency', currency: 'EUR'}).format((cent || 0) / 100);
/** Importe en euros sin céntimos ("1.235 €" / "€1,235"), para gráficos y totales grandes. */
export const eurosRedondo = (cent) => new Intl.NumberFormat(locale(), {style: 'currency', currency: 'EUR', maximumFractionDigits: 0})
  .format(Math.round((cent || 0) / 100));
/** Texto de un campo de importe → céntimos (como el servidor: 12,30 · 1.234,56 · 12.30 · 1,234.56). */
export function centimosDe(texto) {
  let s = String(texto || '').replace(/[€\s]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return Math.round(parseFloat(s || '0') * 100) || 0;
}
/** Céntimos → texto para un campo de importe ("12,30" en español, "12.30" en inglés). */
export const importeTexto = (cent) => (cent ? (cent / 100).toFixed(2).replace('.', lang() === 'en' ? '.' : ',') : '');

export const ICONOS_GASTO = {COMIDA: '🍽', HOTEL: '🏨', TRANSPORTE: '🚆', KILOMETRAJE: '🚗', PARKING: '🅿', OTROS: '📦'};

/** Ver el ticket de una línea de gasto (imagen o PDF) en una ventana. */
export function VerTicket({linea, onCerrar}) {
  const [tk, error] = useDatos('gastos.ticket', {id: linea}, [linea]);
  const src = tk && `data:${tk.tipo};base64,${tk.datos}`;
  return (
    <Modal titulo={tk ? tk.nombre : t('Ticket')} onCerrar={onCerrar}
      pie={tk && <><a className="si-boton" href={src} download={tk.nombre}>⤓ {t('Descargar')}</a><Boton onClick={onCerrar}>{t('Cerrar')}</Boton></>}>
      {error && <Fallo>{error}</Fallo>}
      {!tk ? <Cargando /> : tk.tipo === 'application/pdf'
        ? <object className="si-ticket-pdf" data={src} type="application/pdf"><p>{t('Descarga el PDF para verlo.')}</p></object>
        : <img className="si-ticket-img" src={src} alt={tk.nombre} />}
    </Modal>
  );
}
const MARCAS_ES = {ENTRADA: 'Entrada', PAUSA: 'Pausa', REANUDAR: 'Reanudar', SALIDA: 'Salida'};
export const MARCAS = {};
for (const k of Object.keys(MARCAS_ES)) Object.defineProperty(MARCAS, k, {get: () => t(MARCAS_ES[k]), enumerable: true});

/** Días laborables entre dos fechas ISO (igual que el servidor: sin fines de semana ni festivos). */
export function laborables(desde, hasta, festivos) {
  if (!desde || !hasta || hasta < desde) return 0;
  const f = new Set(festivos.map((x) => x.fecha));
  let n = 0;
  for (let d = deIso(desde); iso(d) <= hasta; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6 && !f.has(iso(d))) n++;
  }
  return n;
}

// ---------- Componentes ----------
const COLORES = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#db2777', '#7c3aed', '#2563eb', '#dc2626'];
export function Avatar({nombre, tam = 36}) {
  const ini = nombre.split(' ').map((p) => p[0]).slice(0, 2).join('');
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return <span className="si-avatar" style={{width: tam, height: tam, fontSize: tam * 0.38, background: COLORES[h % COLORES.length], color: '#fff'}}>{ini}</span>;
}

export const Insignia = ({tono = 'gris', children}) => <span className={`si-insignia si-${tono}`}>{children}</span>;

export function Boton({tipo = 'secundario', icono, children, ...p}) {
  return <button type="button" className={`si-boton si-boton-${tipo}`} {...p}>{icono && <span className="si-icono">{icono}</span>}{children}</button>;
}

export function Tarjeta({titulo, accion, children, className = ''}) {
  return (
    <section className={`si-tarjeta ${className}`}>
      {(titulo || accion) && <header className="si-tarjeta-cab"><h3>{titulo}</h3>{accion}</header>}
      {children}
    </section>
  );
}

export function Pestanas({pestanas, activa, onCambiar}) {
  return (
    <nav className="si-pestanas" role="tablist">
      {pestanas.filter(Boolean).map((p) => (
        <button key={p.id} type="button" role="tab" aria-selected={activa === p.id} className={activa === p.id ? 'activa' : ''}
          onClick={() => onCambiar(p.id)}>
          {p.nombre}{p.cuenta ? <span className="si-cuenta">{p.cuenta}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export function Modal({titulo, onCerrar, children, pie, ancho}) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onCerrar]);
  // En <body>: un contenedor del tema de DX rompe position: fixed dentro de la página
  return createPortal(
    <div className="si-app">
      <div className="si-modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
        <div className={`si-modal${ancho ? ' si-modal-ancho' : ''}`} role="dialog" aria-label={titulo}>
          <header><h3>{titulo}</h3><button type="button" className="si-cerrar" onClick={onCerrar} aria-label={t('Cerrar')}>×</button></header>
          <div className="si-modal-cuerpo">{children}</div>
          {pie && <footer>{pie}</footer>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const Campo = ({etiqueta, ayuda, children}) => (
  <label className="si-campo"><span>{etiqueta}</span>{children}{ayuda && <small>{ayuda}</small>}</label>
);

export function SelectorMes({anio, mes, onCambiar}) {
  const mover = (n) => { const d = new Date(anio, mes - 1 + n, 1); onCambiar(d.getFullYear(), d.getMonth() + 1); };
  return (
    <div className="si-selector-mes">
      <button type="button" onClick={() => mover(-1)} aria-label={t('Mes anterior')}>‹</button>
      <span>{nombreMes(anio, mes)}</span>
      <button type="button" onClick={() => mover(1)} aria-label={t('Mes siguiente')}>›</button>
    </div>
  );
}

export const Vacio = ({icono = '✓', children}) => <div className="si-vacio"><span>{icono}</span><p>{children}</p></div>;
export const Cargando = () => <p className="si-cargando">{t('Cargando…')}</p>;
export const Fallo = ({children}) => <p className="si-error">{children}</p>;

/** Mensajes breves en la esquina (avisos de éxito o error). */
export function useAvisos() {
  const [avisos, setAvisos] = useState([]);
  const avisar = useCallback((texto, tono = 'verde') => {
    const id = Math.random();
    setAvisos((a) => [...a, {id, texto, tono}]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tono === 'rojo' ? 7000 : 3500);
  }, []);
  const vista = createPortal(
    <div className="si-avisos">{avisos.map((a) => <div key={a.id} className={`si-aviso si-${a.tono}`}>{a.texto}</div>)}</div>,
    document.body,
  );
  return [avisar, vista];
}

/** Descarga un texto como fichero (CSV del registro de jornada). */
export function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], {type: tipo}));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
