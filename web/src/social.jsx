// Avisos (campana de la cabecera) y conversación en cada solicitud.
import React, {useEffect, useRef, useState} from 'react';
import {Avatar, Boton, Cargando, Fallo, MARCAS, TIPOS_AUSENCIA, euros, fecha, rango, useDatos, useSuite} from './ui.jsx';
import {lang, locale, t, tPlural} from './i18n.js';
import {Icono} from './iconos.jsx';
import {IconoApp} from './marca.jsx';

/** Páginas de ÓRBITA en DX (nombres amigables). */
export const PAGINAS = {
  inicio: 'mi-intranet', fichaje: 'fichaje', vacaciones: 'vacaciones', gastos: 'gastos', aprobaciones: 'aprobaciones', kiosco: 'quiosco',
  comunicacion: 'comunicacion', encuestas: 'encuestas', personas: 'personas', documentos: 'documentos',
};
/** Dónde están las páginas en DX: lo dice la API (GET /config, valores pages.* del chart). */
export const RUTAS = {paginas: '/wps/myportal/Home/', quiosco: '/wps/myportal/Home/quiosco', sufijo: ''};
export const urlApp = (app) => (app === 'kiosco' ? RUTAS.quiosco : `${RUTAS.paginas}${PAGINAS[app] || app}${RUTAS.sufijo}`);
const ICONO_APP = {fichaje: 'reloj', vacaciones: 'sol', gastos: 'recibo', aprobaciones: 'aprobar', inicio: 'inicio', comunicacion: 'megafono',
  personas: 'personas', documentos: 'documento', encuestas: 'grafico'};
/** Pestaña a la que lleva un aviso, por su aplicación y su clase (Comunicación y Personas tienen pestañas con enlace). */
const PESTANA_AVISO = {
  comunicacion: {COMUNICADO: 'comunicados', CONSULTA: 'consultas', ENCUESTA: 'pulso'},
  personas: {RECONOCER: 'reconocimientos', PERSONA: 'organigrama'},
  encuestas: {ENCUESTA: 'mias', ACCION: 'plan'},
};
/** En Mis documentos la pestaña depende del aviso: la bandeja de RRHH, lo enviado a RRHH, lo publicado o los míos. */
const PESTANA_DOCUMENTO = {'documento.enviado': 'bandeja', 'documento.revisado': 'enviar', 'documento.rechazado': 'enviar', 'documento.recibi': 'gestion'};
const pestanaAviso = (a) => (a.app === 'documentos' ? PESTANA_DOCUMENTO[a.clave] || 'mios' : (PESTANA_AVISO[a.app] || {})[a.clase]);
/** Enlace de un aviso: la aplicación y, si tiene, su pestaña. */
export const urlAviso = (a) => `${urlApp(a.app)}${pestanaAviso(a) ? `#${pestanaAviso(a)}` : ''}`;
/** Motivos de un reconocimiento entre compañeros (Personas). */
export const VALORES_RECONOCIMIENTO = {
  EQUIPO: {nombre: 'Trabajo en equipo', icono: 'personas', color: '#0550dc'},
  CLIENTE: {nombre: 'Pasión por el cliente', icono: 'estrella', color: '#b45000'},
  IDEA: {nombre: 'Gran idea', icono: 'bombilla', color: '#6f5bd6'},
  AYUDA: {nombre: 'Siempre ayuda', icono: 'corazon', color: '#c2307a'},
  LOGRO: {nombre: 'Objetivo cumplido', icono: 'trofeo', color: '#1e7d32'},
};

/** Hace cuánto: «hace 5 min», «ayer», «3 nov». */
export function haceCuanto(isoFechaHora) {
  const d = new Date(isoFechaHora);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return t('ahora');
  if (min < 60) return t('hace {n} min', {n: min});
  if (min < 24 * 60) return t('hace {n} h', {n: Math.round(min / 60)});
  if (min < 48 * 60) return t('ayer');
  return d.toLocaleDateString(locale(), {day: 'numeric', month: 'short'});
}

/**
 * Texto de un aviso en el idioma de la interfaz. El servidor guarda el aviso en español (texto) y, desde la 3.0, una
 * clave con sus datos: en inglés se compone con la plantilla «aviso.<clave>» de en.js. Los avisos sin clave (los
 * anteriores y los de la demo) se muestran en español.
 */
export function textoAviso(a) {
  if (lang() === 'es' || !a.clave || !a.params) return a.texto;
  const p = {...a.params};
  if (p.total !== undefined && p.total !== null) p.total = euros(p.total);
  if (p.desde && p.hasta) p.rango = rango(p.desde, p.hasta);
  if (p.fecha) p.fecha = fecha(p.fecha, {day: 'numeric', month: 'short'});
  if (p.dias !== undefined) p.dias = tPlural(p.dias, 'día', 'días');
  if (p.tipo) p.tipo = (TIPOS_AUSENCIA[p.tipo] ? TIPOS_AUSENCIA[p.tipo].nombre : MARCAS[p.tipo] || p.tipo).toLowerCase();
  p.comentario = p.comentario ? `: “${p.comentario}”` : '.';
  if (p.valor && VALORES_RECONOCIMIENTO[p.valor]) p.valor = t(VALORES_RECONOCIMIENTO[p.valor].nombre);
  const clave = `aviso.${a.clave}`;
  const s = t(clave, p);
  return s === clave ? a.texto : s;
}

export function Campana({inicial, app}) {
  const {api} = useSuite();
  const [n, setN] = useState(inicial || 0);
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState(null);
  const caja = useRef(null);
  const cargar = () => api('avisos.lista').then((d) => { setDatos(d); setN(d.noLeidos); }).catch(() => {});
  useEffect(() => { const t = setInterval(cargar, 60000); return () => clearInterval(t); }, []); // eslint-disable-line
  useEffect(() => {
    if (!abierta) return undefined;
    cargar();
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierta(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierta]); // eslint-disable-line
  const abrir = async (a) => {
    try { const d = await api('avisos.leer', {id: a.id}); setDatos(d); setN(d.noLeidos); } catch (e) { /* sin conexión */ }
    if (a.app !== app) window.location.href = urlAviso(a);
    else { if (PESTANA_AVISO[a.app] || a.app === 'documentos') window.location.hash = pestanaAviso(a) || ''; setAbierta(false); }
  };
  const leerTodo = async () => { try { const d = await api('avisos.leer'); setDatos(d); setN(d.noLeidos); } catch (e) { /* */ } };
  return (
    <div className="si-campana" ref={caja}>
      <button type="button" className="si-campana-boton" onClick={() => setAbierta(!abierta)} aria-label={t('Avisos ({n} sin leer)', {n})}>
        <Icono n="campana" />{n > 0 && <span className="si-campana-n">{n > 9 ? '9+' : n}</span>}
      </button>
      {abierta && (
        <div className="si-avisos-panel">
          <header><strong>{t('Avisos')}</strong>{n > 0 && <button type="button" className="si-enlace" onClick={leerTodo}>{t('Marcar todo como leído')}</button>}</header>
          {!datos ? <Cargando /> : !datos.avisos.length ? <p className="si-tenue si-avisos-vacio">{t('No tienes avisos.')}</p> : (
            <ul>
              {datos.avisos.map((a) => (
                <li key={a.id}>
                  <button type="button" className={a.leido ? '' : 'nuevo'} onClick={() => abrir(a)}>
                    <span className="si-aviso-icono">{ICONO_APP[a.app] ? <IconoApp app={a.app} tam={28} /> : <Icono n="campana" />}</span>
                    <span className="si-aviso-texto">{textoAviso(a)}<small>{haceCuanto(a.creado)}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Hilo de comentarios de una solicitud (clase: AUSENCIA, CORRECCION, NOTA, VIAJE). */
export function Conversacion({clase, objeto, onCuenta, compacta}) {
  const {api, avisar} = useSuite();
  const [lista, error, , fijar] = useDatos('com.lista', {clase, objeto}, [clase, objeto]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fin = useRef(null);
  useEffect(() => { if (fin.current && lista && lista.length) fin.current.scrollIntoView({block: 'nearest'}); }, [lista]);
  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const l = await api('com.enviar', {clase, objeto, texto});
      fijar(l);
      setTexto('');
      if (onCuenta) onCuenta(l.length);
    } catch (e) { avisar(e.message, 'rojo'); } finally { setEnviando(false); }
  };
  return (
    <div className={`si-conversacion${compacta ? ' compacta' : ''}`}>
      {error && <Fallo>{error}</Fallo>}
      {!lista ? <Cargando /> : (
        <div className="si-mensajes">
          {!lista.length && <p className="si-tenue si-sin-mensajes">{t('Aún no hay comentarios. Pregunta o aclara lo que necesites sin rechazar la solicitud.')}</p>}
          {lista.map((m) => (
            <div key={m.id} className={`si-mensaje${m.yo ? ' mio' : ''}`}>
              {!m.yo && <Avatar nombre={m.nombre} tam={26} />}
              <div className="si-burbuja">
                {!m.yo && <strong>{m.nombre}</strong>}
                <p>{m.texto}</p>
                <small>{haceCuanto(m.creado)}</small>
              </div>
            </div>
          ))}
          <div ref={fin} />
        </div>
      )}
      <div className="si-escribir">
        <textarea className="si-input" rows={1} value={texto} placeholder={t('Escribe un comentario…')} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
        <Boton tipo="primario" disabled={enviando || !texto.trim()} onClick={enviar}>{t('Enviar')}</Boton>
      </div>
    </div>
  );
}

/** Botón «comentarios (n)» que despliega la conversación debajo. */
export function BotonConversacion({clase, objeto, cuenta = 0, abierta, onAlternar}) {
  return (
    <button type="button" className={`si-boton-chat${abierta ? ' activa' : ''}`} onClick={onAlternar}>
      <Icono n="chat" /> {cuenta ? tPlural(cuenta, 'comentario', 'comentarios') : t('Comentar')}
    </button>
  );
}
