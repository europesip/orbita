// Asistente de ÓRBITA: chat de IA dentro de la aplicación (panel lateral), con dos motores (valor assistant.backend):
//
//  orbita (por defecto)  el asistente propio de ÓRBITA: POST /orbita-api/v1/asistente. El servidor habla con LiteLLM
//                        solo con las herramientas de ÓRBITA, como el usuario de la sesión de DX. El prompt es pequeño
//                        (sin las herramientas de DX ni el prompt de IQ) y el modelo se elige en el chart.
//  iq                    el chat de HCL DX IQ, con el MCP de ÓRBITA registrado en el Integrator (ver abajo).
//
// DX IQ no tiene API REST de chat: su interfaz habla JSON-RPC 2.0 por WebSocket en /dx/api/iq/v1/ws (start_session,
// send_message, close_session), a través del HAProxy de DX y con la sesión del portal. Como ÓRBITA se sirve en el
// mismo dominio que DX, el navegador envía la sesión solo: IQ actúa con los permisos del usuario conectado.
// IQ usa las herramientas del MCP de ÓRBITA (suite/mcp) para responder sobre vacaciones, fichajes, gastos...
// Las herramientas de ÓRBITA actúan como el usuario del chat (el Integrator reenvía su sesión de DX al MCP); la
// primera pregunta de cada sesión lleva un contexto con su nombre, para que IQ le trate por su nombre.
import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {OrbitaIcono, PRODUCTO} from './marca.jsx';
import {useSuite} from './ui.jsx';

const SUGERENCIAS = {
  inicio: ['¿Cuántas vacaciones me quedan?', '¿Tengo vacaciones pendientes de aprobar?', 'Resume mi día'],
  vacaciones: ['¿Cuántos días de vacaciones me quedan?', '¿Qué solicitudes tengo pendientes?', 'Pídeme vacaciones del 9 al 11 de diciembre'],
  fichaje: ['¿He fichado hoy?', '¿Cuántas horas llevo esta semana?', '¿Cuántas vacaciones me quedan?'],
  gastos: ['¿Cuánto llevo gastado este año?', '¿Qué notas tengo pendientes de cobro?', '¿Cuántas vacaciones me quedan?'],
  aprobaciones: ['¿Qué tengo pendiente de aprobar?', '¿Quién de mi equipo falta los próximos días?', '¿Cuántas vacaciones me quedan?'],
};

/** Botón de la cabecera + panel. */
export function Asistente({app, yo}) {
  const {config} = useSuite();
  const [abierto, setAbierto] = useState(false);
  const modo = (config && config.asistente) || 'iq';
  if (modo === 'none') return null;
  return (
    <>
      <button type="button" className="si-iq-boton" onClick={() => setAbierto(true)} title={`Pregúntale a ${PRODUCTO}${modo === 'iq' ? ' (HCL DX IQ)' : ''}`}>
        <span aria-hidden="true">✨</span><span className="si-iq-boton-texto">Pregúntale a {PRODUCTO}</span>
      </button>
      {abierto && <Panel app={app} yo={yo} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

// --- Asistente propio de ÓRBITA -----------------------------------------------------------------------------------------

/** Cliente del asistente de ÓRBITA (POST <base>/asistente): la conversación se guarda aquí y se envía entera. */
function crearOrbita(base) {
  let historia = [];
  return {
    sinSesion: () => false,
    async preguntar(texto, progreso, idiomaRespuesta = 'es') {
      historia = [...historia, {rol: 'user', texto}];
      const r = await fetch(`${base.replace(/\/+$/, '')}/asistente`, {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({mensajes: historia, idioma: idiomaRespuesta}),
      });
      let j = null;
      try { j = await r.json(); } catch (e) { /* sin JSON */ }
      if (!r.ok || !j) { historia = historia.slice(0, -1); throw new Error((j && j.error) || `El asistente ha respondido ${r.status}.`); }
      (j.herramientas || []).forEach((h) => progreso && progreso(h));
      historia = [...historia, {rol: 'assistant', texto: j.respuesta}];
      return j.respuesta;
    },
    cerrar() { historia = []; },
  };
}

// --- Conexión con DX IQ ----------------------------------------------------------------------------------------------

/** Cliente mínimo del WebSocket de DX IQ: una sesión, una pregunta cada vez. */
function crearIq() {
  let ws = null, sesion = null, siguienteId = 1, pendiente = null;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/dx/api/iq/v1/ws`;

  function conectar() {
    return new Promise((resolver, rechazar) => {
      ws = new WebSocket(url);
      ws.onopen = () => {
        const id = siguienteId++;
        pendiente = {inicio: id, resolver, rechazar};
        ws.send(JSON.stringify({jsonrpc: '2.0', id, method: 'start_session', params: {}}));
      };
      ws.onmessage = (e) => recibir(JSON.parse(e.data));
      ws.onerror = () => fallo('No se ha podido conectar con el asistente (DX IQ).');
      ws.onclose = () => { if (pendiente) fallo('Se ha cerrado la conexión con el asistente.'); ws = null; sesion = null; };
    });
  }

  function fallo(texto) {
    const p = pendiente; pendiente = null;
    if (p) p.rechazar(new Error(texto));
  }

  function recibir(m) {
    const p = pendiente;
    if (!p) return;
    const r = m.result || {};
    if (p.inicio !== undefined) {                       // respuesta a start_session
      if (m.id !== p.inicio) return;
      if (m.error || !r.id) return fallo('El asistente no ha podido iniciar la conversación.');
      sesion = r.id; pendiente = null; p.resolver(true);
      return;
    }
    if (m.error || r.businessError) {
      return fallo((m.error && m.error.message) || (r.businessError && (r.businessError.message || JSON.stringify(r.businessError)))
        || 'El asistente ha devuelto un error.');
    }
    if (r.answer) { pendiente = null; p.resolver(r.answer); return; }
    const meta = r.metadata || {};                      // progreso: herramientas que está usando
    if (p.progreso && (meta.toolName || meta.label)) p.progreso(meta.toolName || meta.label);
  }

  return {
    /** true si la próxima pregunta abre sesión nueva (y debe llevar el contexto). */
    sinSesion: () => !sesion,
    async preguntar(texto, progreso, idiomaRespuesta = 'es') {
      if (!ws || ws.readyState !== WebSocket.OPEN || !sesion) await conectar();
      return new Promise((resolver, rechazar) => {
        pendiente = {resolver, rechazar, progreso};
        ws.send(JSON.stringify({jsonrpc: '2.0', id: siguienteId++, method: 'send_message',
          params: {id: sesion, payload: {question: texto, language: idiomaRespuesta}}}));
      });
    },
    cerrar() {
      try {
        if (ws && ws.readyState === WebSocket.OPEN && sesion) {
          ws.send(JSON.stringify({jsonrpc: '2.0', id: siguienteId++, method: 'close_session', params: {id: sesion}}));
        }
        if (ws) ws.close();
      } catch (e) { /* ya cerrado */ }
      ws = null; sesion = null; pendiente = null;
    },
  };
}

/** "74c38aed_vacaciones_saldo" (IQ antepone un prefijo a cada herramienta) -> "Consultando vacaciones saldo…" */
function textoProgreso(h) {
  const limpio = String(h).replace(/^[0-9a-f]{6,}_/i, '').replace(/_/g, ' ').trim();
  return limpio ? `Consultando ${limpio}…` : 'Pensando…';
}

function contexto(yo) {
  return `Contexto (no lo menciones en la respuesta): soy ${yo.nombre}, empleado de ${PRODUCTO}. Las herramientas de `
    + `${PRODUCTO} ya saben quién soy por mi sesión. Responde en el idioma en que está escrita mi pregunta.\n\nPregunta: `;
}

/**
 * Idioma de la respuesta: el de la pregunta (se puede preguntar a ÓRBITA en español o en inglés). Si el texto no lo
 * deja claro, el de la página de DX (<html lang>) o el del navegador.
 */
const PALABRAS = {
  es: /\b(qué|que|cuánt[oa]s?|cuál|cómo|quién|dónde|cuándo|mis?|tengo|me|el|la|los|las|de|del|para|por|hoy|ficha|pídeme|vacaciones|gastos?|aprueba)\b|[¿¡ñáéíóú]/gi,
  en: /\b(what|how|who|which|when|where|my|me|do|does|did|have|has|the|of|for|today|clock|book|holidays?|expenses?|approve|team|left)\b/gi,
};
export function idioma(texto) {
  const es = (String(texto).match(PALABRAS.es) || []).length, en = (String(texto).match(PALABRAS.en) || []).length;
  if (es !== en) return es > en ? 'es' : 'en';
  const pagina = (document.documentElement.lang || navigator.language || 'es').slice(0, 2).toLowerCase();
  return pagina === 'en' ? 'en' : 'es';
}

// --- Panel -----------------------------------------------------------------------------------------------------------

function Panel({app, yo, onCerrar}) {
  const {config, base} = useSuite();
  const modo = (config && config.asistente) || 'iq';
  const iq = useRef(null);
  if (!iq.current) iq.current = modo === 'orbita' ? crearOrbita(base) : crearIq();
  const [mensajes, setMensajes] = useState([]);       // {de: 'yo'|'iq'|'error', texto}
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState('');
  const lista = useRef(null), entrada = useRef(null);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', k);
    entrada.current && entrada.current.focus();
    return () => { document.removeEventListener('keydown', k); iq.current.cerrar(); };
  }, [onCerrar]);
  useEffect(() => { if (lista.current) lista.current.scrollTop = lista.current.scrollHeight; }, [mensajes, progreso]);

  async function enviar(pregunta) {
    const q = (pregunta || '').trim();
    if (!q || ocupado) return;
    setTexto(''); setOcupado(true); setProgreso('Pensando…');
    setMensajes((m) => [...m, {de: 'yo', texto: q}]);
    try {
      const completa = iq.current.sinSesion() ? contexto(yo) + q : q;
      const respuesta = await iq.current.preguntar(completa, (h) => setProgreso(textoProgreso(h)), idioma(q));
      setMensajes((m) => [...m, {de: 'iq', texto: respuesta}]);
    } catch (e) {
      setMensajes((m) => [...m, {de: 'error', texto: e.message}]);
    } finally {
      setOcupado(false); setProgreso('');
      entrada.current && entrada.current.focus();
    }
  }

  function nueva() {
    iq.current.cerrar(); setMensajes([]); setProgreso(''); setOcupado(false);
  }

  return createPortal(
    <div className="si-app">
      <div className="si-iq-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
        <aside className="si-iq-panel" role="dialog" aria-label={`Asistente de ${PRODUCTO}`}>
          <header className="si-iq-cab">
            <OrbitaIcono tam={34} />
            <div><strong>Asistente {PRODUCTO}</strong><span>{modo === 'iq' ? 'con HCL DX IQ · ' : ''}{yo.nombre}</span></div>
            {mensajes.length > 0 && <button type="button" className="si-iq-nueva" onClick={nueva} disabled={ocupado}>Nueva</button>}
            <button type="button" className="si-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
          </header>
          <div className="si-iq-lista" ref={lista}>
            {mensajes.length === 0 && (
              <div className="si-iq-bienvenida">
                <p>Hola, {yo.nombre.split(' ')[0]}. Pregúntame por tus vacaciones, tus fichajes, tus gastos o lo que tengas pendiente.</p>
                <div className="si-iq-sugerencias">
                  {(SUGERENCIAS[app] || SUGERENCIAS.inicio).map((s) => (
                    <button type="button" key={s} onClick={() => enviar(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={`si-iq-msg si-iq-${m.de}`}>
                {m.de === 'iq' ? <Markdown texto={m.texto} /> : <p>{m.texto}</p>}
              </div>
            ))}
            {progreso && <div className="si-iq-progreso"><span className="si-iq-puntos" aria-hidden="true"><i /><i /><i /></span>{progreso}</div>}
          </div>
          <form className="si-iq-pie" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
            <textarea ref={entrada} rows={2} value={texto} placeholder="Escribe tu pregunta…" disabled={ocupado}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} />
            <button type="submit" disabled={ocupado || !texto.trim()} aria-label="Enviar">➤</button>
          </form>
          <small className="si-iq-aviso">Respuestas generadas con IA. Revisa los datos antes de confirmar una solicitud.</small>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

// --- Markdown -> elementos React (sin HTML: nada de lo que responda la IA se inyecta como código) -------------------

function Markdown({texto}) {
  const lineas = String(texto || '').replace(/\r\n/g, '\n').split('\n');
  const bloques = [];
  let i = 0;
  const esTabla = (l) => /^\s*\|.*\|\s*$/.test(l);
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) { i++; continue; }
    if (/^\s*```/.test(l)) {                                   // bloque de código
      const codigo = [];
      for (i++; i < lineas.length && !/^\s*```/.test(lineas[i]); i++) codigo.push(lineas[i]);
      i++;
      bloques.push(<pre key={bloques.length}><code>{codigo.join('\n')}</code></pre>);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      const Nivel = h[1].length <= 2 ? 'h4' : 'h5';
      bloques.push(<Nivel key={bloques.length}>{enLinea(h[2])}</Nivel>);
      i++; continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { bloques.push(<hr key={bloques.length} />); i++; continue; }
    if (esTabla(l)) {
      const filas = [];
      for (; i < lineas.length && esTabla(lineas[i]); i++) filas.push(lineas[i]);
      const celdas = (f) => f.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const separador = (f) => /^\s*\|?\s*:?-{2,}/.test(f);
      const cab = filas.length > 1 && separador(filas[1]) ? celdas(filas[0]) : null;
      const cuerpo = filas.slice(cab ? 2 : 0).filter((f) => !separador(f)).map(celdas);
      bloques.push(
        <div className="si-iq-tabla" key={bloques.length}><table>
          {cab && <thead><tr>{cab.map((c, k) => <th key={k}>{enLinea(c)}</th>)}</tr></thead>}
          <tbody>{cuerpo.map((f, r) => <tr key={r}>{f.map((c, k) => <td key={k}>{enLinea(c)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    if (/^\s*>/.test(l)) {
      const cita = [];
      for (; i < lineas.length && /^\s*>/.test(lineas[i]); i++) cita.push(lineas[i].replace(/^\s*>\s?/, ''));
      bloques.push(<blockquote key={bloques.length}>{enLinea(cita.join(' '))}</blockquote>);
      continue;
    }
    const lista = /^\s*([-*+]|\d+[.)])\s+/;
    if (lista.test(l)) {
      const ordenada = /^\s*\d/.test(l);
      const items = [];
      for (; i < lineas.length && lista.test(lineas[i]); i++) items.push(lineas[i].replace(lista, ''));
      const Lista = ordenada ? 'ol' : 'ul';
      bloques.push(<Lista key={bloques.length}>{items.map((t, k) => <li key={k}>{enLinea(t)}</li>)}</Lista>);
      continue;
    }
    const parrafo = [];
    for (; i < lineas.length && lineas[i].trim() && !/^(#{1,6}\s|\s*```|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lineas[i]) && !esTabla(lineas[i]); i++) {
      parrafo.push(lineas[i]);
    }
    if (!parrafo.length) { parrafo.push(l); i++; }
    bloques.push(<p key={bloques.length}>{enLinea(parrafo.join(' '))}</p>);
  }
  return <div className="si-iq-md">{bloques}</div>;
}

/** Negrita, cursiva, código y enlaces (solo http(s) y rutas del propio sitio). */
function enLinea(s) {
  const partes = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_)/g;
  let ultimo = 0, m, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > ultimo) partes.push(s.slice(ultimo, m.index));
    if (m[2] || m[3]) partes.push(<strong key={k++}>{enLinea(m[2] || m[3])}</strong>);
    else if (m[4]) partes.push(<code key={k++}>{m[4]}</code>);
    else if (m[5]) {
      const seguro = /^(https?:\/\/|\/)/i.test(m[6]);
      partes.push(seguro ? <a key={k++} href={m[6]} target="_blank" rel="noopener noreferrer">{m[5]}</a> : m[5]);
    } else partes.push(<em key={k++}>{m[7] || m[8]}</em>);
    ultimo = re.lastIndex;
  }
  if (ultimo < s.length) partes.push(s.slice(ultimo));
  return partes;
}
