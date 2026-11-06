// Avisos (campana de la cabecera) y conversación en cada solicitud.
import React, {useEffect, useRef, useState} from 'react';
import {Avatar, Boton, Cargando, Fallo, useDatos, useSuite} from './ui.jsx';

/** Páginas de ÓRBITA en DX (nombres amigables). */
export const PAGINAS = {
  inicio: 'mi-intranet', fichaje: 'fichaje', vacaciones: 'vacaciones', gastos: 'gastos', aprobaciones: 'aprobaciones', kiosco: 'quiosco',
};
/** Dónde están las páginas en DX: lo dice la API (GET /config, valores pages.* del chart). */
export const RUTAS = {paginas: '/wps/myportal/Home/', quiosco: '/wps/myportal/Home/quiosco', sufijo: ''};
export const urlApp = (app) => (app === 'kiosco' ? RUTAS.quiosco : `${RUTAS.paginas}${PAGINAS[app] || app}${RUTAS.sufijo}`);
const ICONO_APP = {fichaje: '⏱', vacaciones: '🌴', gastos: '🧾', aprobaciones: '✔', inicio: '🏠'};

/** Hace cuánto: «hace 5 min», «ayer», «3 nov». */
export function haceCuanto(isoFechaHora) {
  const d = new Date(isoFechaHora);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  if (min < 48 * 60) return 'ayer';
  return d.toLocaleDateString('es-ES', {day: 'numeric', month: 'short'});
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
    if (a.app !== app) window.location.href = urlApp(a.app);
    else setAbierta(false);
  };
  const leerTodo = async () => { try { const d = await api('avisos.leer'); setDatos(d); setN(d.noLeidos); } catch (e) { /* */ } };
  return (
    <div className="si-campana" ref={caja}>
      <button type="button" className="si-campana-boton" onClick={() => setAbierta(!abierta)} aria-label={`Avisos (${n} sin leer)`}>
        🔔{n > 0 && <span className="si-campana-n">{n > 9 ? '9+' : n}</span>}
      </button>
      {abierta && (
        <div className="si-avisos-panel">
          <header><strong>Avisos</strong>{n > 0 && <button type="button" className="si-enlace" onClick={leerTodo}>Marcar todo como leído</button>}</header>
          {!datos ? <Cargando /> : !datos.avisos.length ? <p className="si-tenue si-avisos-vacio">No tienes avisos.</p> : (
            <ul>
              {datos.avisos.map((a) => (
                <li key={a.id}>
                  <button type="button" className={a.leido ? '' : 'nuevo'} onClick={() => abrir(a)}>
                    <span className="si-aviso-icono">{ICONO_APP[a.app] || '•'}</span>
                    <span className="si-aviso-texto">{a.texto}<small>{haceCuanto(a.creado)}</small></span>
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
          {!lista.length && <p className="si-tenue si-sin-mensajes">Aún no hay comentarios. Pregunta o aclara lo que necesites sin rechazar la solicitud.</p>}
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
        <textarea className="si-input" rows={1} value={texto} placeholder="Escribe un comentario…" onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
        <Boton tipo="primario" disabled={enviando || !texto.trim()} onClick={enviar}>Enviar</Boton>
      </div>
    </div>
  );
}

/** Botón «💬 n» que despliega la conversación debajo. */
export function BotonConversacion({clase, objeto, cuenta = 0, abierta, onAlternar}) {
  return (
    <button type="button" className={`si-boton-chat${abierta ? ' activa' : ''}`} onClick={onAlternar}>
      💬 {cuenta ? `${cuenta} ${cuenta === 1 ? 'comentario' : 'comentarios'}` : 'Comentar'}
    </button>
  );
}
