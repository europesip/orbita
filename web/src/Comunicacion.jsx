// Comunicación con RRHH: comunicados con acuse de lectura, consultas a RRHH (con respuestas sugeridas antes de
// preguntar) y preguntas frecuentes, que publica y atiende RRHH. Las encuestas (el antiguo pulso) están en su propia
// aplicación, Encuestas.
// Interfaz al estilo de una intranet corporativa (noticias de SharePoint, acuse de lectura de Viva Connections,
// formularios de Microsoft Forms) con los colores y la tipografía de HCL DX.
import React, {useEffect, useMemo, useState} from 'react';
import {
  Avatar, Boton, Campo, Cargando, Fallo, Insignia, Modal, Pestanas, Tarjeta, Vacio, fecha, iso, plural, useDatos, useSuite,
} from './ui.jsx';
import {Conversacion, haceCuanto, urlApp} from './social.jsx';
import {Icono} from './iconos.jsx';
import {locale, t} from './i18n.js';

const CATEGORIAS = {
  POLITICA: {nombre: 'Política', icono: 'escudo', color: '#002c56'},
  AVISO: {nombre: 'Aviso', icono: 'megafono', color: '#0b5fff'},
  EVENTO: {nombre: 'Evento', icono: 'evento', color: '#6f5bd6'},
  BENEFICIO: {nombre: 'Beneficio', icono: 'regalo', color: '#13838f'},
};
const TEMAS = {
  NOMINA: 'Nómina', CERTIFICADO: 'Certificados', DATOS: 'Datos personales', CONTRATO: 'Contrato y jornada', FORMACION: 'Formación', OTRA: 'Otra',
};
const ICONO_TEMA = {NOMINA: 'euro', CERTIFICADO: 'documento', DATOS: 'persona', CONTRATO: 'nota', FORMACION: 'bombilla', OTRA: 'ayuda'};
const ESTADO_CONSULTA = {
  ABIERTA: {nombre: 'Enviada', tono: 'ambar'}, EN_CURSO: {nombre: 'En curso', tono: 'azul'}, RESUELTA: {nombre: 'Resuelta', tono: 'verde'},
};
const ROLES = {EMPLEADO: 'Empleados', RESPONSABLE: 'Responsables', RRHH: 'RRHH', ADMINISTRACION: 'Administración'};
const PESTANAS = ['comunicados', 'consultas', 'pulso', 'preguntas'];
const categoria = (c) => CATEGORIAS[c] || CATEGORIAS.AVISO;

/** «Toda la plantilla», «Tecnología», «Responsables». */
function ambitoTexto(a) {
  if (!a || a === 'TODOS') return t('Toda la plantilla');
  if (a.startsWith('DEPARTAMENTO:')) return a.slice(13);
  if (a.startsWith('ROL:')) return t(ROLES[a.slice(4)] || a.slice(4));
  return a;
}

/** Selector de destinatarios: toda la plantilla, un departamento o un rol. */
function Destinatarios({valor, onCambiar, departamentos}) {
  return (
    <select className="si-select" value={valor} onChange={(e) => onCambiar(e.target.value)}>
      <option value="TODOS">{t('Toda la plantilla')}</option>
      <optgroup label={t('Departamento')}>
        {departamentos.map((d) => <option key={d} value={`DEPARTAMENTO:${d}`}>{d}</option>)}
      </optgroup>
      <optgroup label={t('Rol')}>
        {Object.keys(ROLES).map((r) => <option key={r} value={`ROL:${r}`}>{t(ROLES[r])}</option>)}
      </optgroup>
    </select>
  );
}

/** Título de sección con su acción a la derecha (como el título de un elemento web de SharePoint). */
const Seccion = ({titulo, accion, children}) => (
  <div className="si-seccion-cab"><h3>{titulo}</h3>{children}{accion}</div>
);

/** Barra de mensaje (información, éxito o aviso) con su icono. */
const Mensaje = ({tono = 'info', icono = 'info', children}) => (
  <div className={`si-mensaje-barra si-mb-${tono}`} role="status"><Icono n={icono} /><div>{children}</div></div>
);

/** Buscador con icono. */
const Buscador = ({valor, onCambiar, placeholder, autoFocus, grande}) => (
  <label className={`si-buscador${grande ? ' grande' : ''}`}>
    <Icono n="buscar" />
    <input type="search" value={valor} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onCambiar(e.target.value)} aria-label={placeholder} />
  </label>
);

/** Sin tildes ni mayúsculas, para filtrar. */
const plano = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const pestanaDelEnlace = () => {
  const h = (typeof window !== 'undefined' && window.location.hash || '').replace('#', '');
  return PESTANAS.includes(h) ? h : 'comunicados';
};

export function Comunicacion() {
  const [pest, setPest] = useState(pestanaDelEnlace);
  const [res, , recargarRes] = useDatos('comunicacion.resumen', {}, []);
  // Los avisos de la campana enlazan a #comunicados, #consultas o #pulso
  useEffect(() => {
    const cambio = () => setPest(pestanaDelEnlace());
    window.addEventListener('hashchange', cambio);
    return () => window.removeEventListener('hashchange', cambio);
  }, []);
  const cambiar = (p) => { setPest(p); if (window.history.replaceState) window.history.replaceState(null, '', `#${p}`); };
  return (
    <>
      <Pestanas activa={pest} onCambiar={cambiar} pestanas={[
        {id: 'comunicados', nombre: t('Comunicados'), cuenta: res ? Math.max(res.comunicadosPorConfirmar, res.comunicadosPorLeer) : 0},
        {id: 'consultas', nombre: t('Consultas a RRHH'), cuenta: res ? (res.rrhh ? res.consultasSinAtender : 0) : 0},
        {id: 'pulso', nombre: t('Encuestas'), cuenta: res ? res.encuestasPendientes : 0},
        {id: 'preguntas', nombre: t('Preguntas frecuentes')},
      ]} />
      {pest === 'comunicados' && <Comunicados onCambio={recargarRes} />}
      {pest === 'consultas' && <Consultas onCambio={recargarRes} />}
      {pest === 'pulso' && <Pulso />}
      {pest === 'preguntas' && <Preguntas />}
    </>
  );
}

// =========================================================================================== Comunicados

function Comunicados({onCambio}) {
  const [d, error, recargar] = useDatos('comunicados.lista', {}, []);
  const [abierto, setAbierto] = useState(null);
  const [publicar, setPublicar] = useState(false);
  const [lecturas, setLecturas] = useState(null);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const mios = d.comunicados.filter((c) => c.paraMi);
  // Primero lo que hay que confirmar (por fecha límite), después lo no leído y después el resto
  const porConfirmar = (c) => c.paraMi && c.confirmar && !c.confirmado;
  const pendientes = mios.filter((c) => !c.leido || porConfirmar(c))
    .sort((x, y) => (porConfirmar(y) - porConfirmar(x)) || (x.limite || '9').localeCompare(y.limite || '9'));
  const orden = [...pendientes, ...d.comunicados.filter((c) => !pendientes.includes(c))];
  const tareas = mios.filter(porConfirmar);
  const destacados = orden.slice(0, 4);
  const mas = orden.slice(4);
  const cambio = () => { recargar(); onCambio(); };
  const props = {rrhh: d.rrhh, onAbrir: setAbierto, onLecturas: setLecturas};
  return (
    <>
      <Seccion titulo={t('Noticias de RRHH')}
        accion={d.rrhh && <Boton tipo="primario" icono="mas" onClick={() => setPublicar(true)}>{t('Publicar comunicado')}</Boton>} />
      {tareas.length > 0 && (
        <section className="si-tareas" aria-label={t('Pendiente de confirmar')}>
          <header><Icono n="firmar" /><strong>{plural(tareas.length, 'comunicado requiere tu confirmación', 'comunicados requieren tu confirmación')}</strong></header>
          <ul>
            {tareas.map((c) => (
              <li key={c.id}>
                <span className="si-crece">
                  <strong>{c.titulo}</strong>
                  <small>{c.limite ? t('Confirmar antes del {fecha}', {fecha: fecha(c.limite, {day: 'numeric', month: 'long'})}) : t('Pide confirmación')}</small>
                </span>
                <Boton onClick={() => setAbierto(c.id)}>{t('Leer y confirmar')}</Boton>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!d.rrhh && mios.length > 0 && !pendientes.length && (
        <Mensaje tono="ok" icono="checkCirculo">{t('Estás al día: no tienes comunicados por leer ni por confirmar.')}</Mensaje>
      )}
      {!orden.length ? <Tarjeta><Vacio icono="bandeja">{t('Aún no hay comunicados.')}</Vacio></Tarjeta> : (
        <div className={`si-noticias${destacados.length > 1 ? '' : ' sola'}`}>
          <Noticia c={destacados[0]} forma="grande" {...props} />
          {destacados.length > 1 && <div className="si-noticias-lado">{destacados.slice(1).map((c) => <Noticia key={c.id} c={c} forma="lado" {...props} />)}</div>}
        </div>
      )}
      {mas.length > 0 && (
        <>
          <Seccion titulo={t('Más comunicados')} />
          <div className="si-noticias-lista">{mas.map((c) => <Noticia key={c.id} c={c} forma="lista" {...props} />)}</div>
        </>
      )}
      {abierto && <VerComunicado id={abierto} onCerrar={() => { setAbierto(null); cambio(); }} />}
      {publicar && <PublicarComunicado departamentos={d.departamentos} onCerrar={() => setPublicar(false)} onHecho={cambio} />}
      {lecturas && <Lecturas id={lecturas} onCerrar={() => setLecturas(null)} onHecho={cambio} />}
    </>
  );
}

/** Portada de un comunicado: el color y el icono de su categoría (los comunicados no llevan imagen). */
const Portada = ({cat}) => <span className="si-portada" style={{'--c': cat.color}} aria-hidden="true"><Icono n={cat.icono} /></span>;

/** Estado del comunicado para quien lo lee: nuevo, por confirmar (con fecha límite) o confirmado. */
function EstadoComunicado({c}) {
  if (!c.paraMi) return null;
  return (
    <>
      {!c.leido && <span className="si-nuevo">{t('Nuevo')}</span>}
      {c.confirmar && !c.confirmado && <Insignia tono="ambar"><Icono n="firmar" />
        {c.limite ? t('Confirmar antes del {fecha}', {fecha: fecha(c.limite, {day: 'numeric', month: 'short'})}) : t('Pide confirmación')}</Insignia>}
      {c.confirmado && <Insignia tono="verde"><Icono n="check" />{t('Confirmado')}</Insignia>}
    </>
  );
}

/** Una noticia: grande (destacada), lado (columna derecha) o lista (con extracto). Toda la ficha abre el comunicado. */
function Noticia({c, forma, rrhh, onAbrir, onLecturas}) {
  const cat = categoria(c.categoria);
  const est = c.estadisticas;
  const objetivo = est ? (c.confirmar ? est.confirmados : est.leidos) : 0;
  return (
    <article className={`si-noticia si-noticia-${forma}${c.paraMi && !c.leido ? ' si-no-leido' : ''}`}>
      <Portada cat={cat} />
      <div className="si-noticia-cuerpo">
        <span className="si-eyebrow">{t(cat.nombre)}</span>
        <button type="button" className="si-noticia-titulo si-comunicado-abrir" onClick={() => onAbrir(c.id)}>{c.titulo}</button>
        {forma !== 'lado' && <p className="si-noticia-extracto">{c.extracto}</p>}
        <div className="si-noticia-meta">
          {forma !== 'lado' && <Avatar nombre={c.autor} tam={22} />}
          <span>{c.autor} · {haceCuanto(c.publicado)}{rrhh ? ` · ${ambitoTexto(c.ambito)}` : ''}</span>
        </div>
        <div className="si-fila si-noticia-estado"><EstadoComunicado c={c} /></div>
        {rrhh && est && (
          <div className="si-alcance">
            <div className="si-barra"><div style={{width: `${est.destinatarios ? (100 * objetivo) / est.destinatarios : 0}%`}} /></div>
            <small>{t(c.confirmar ? '{n} de {total} han confirmado' : '{n} de {total} lo han leído', {n: objetivo, total: est.destinatarios})}</small>
            <button type="button" className="si-enlace" onClick={() => onLecturas(c.id)}>{t('Ver quién')}<Icono n="derecha" /></button>
          </div>
        )}
      </div>
    </article>
  );
}

function VerComunicado({id, onCerrar}) {
  const {api, avisar} = useSuite();
  const [c, error, , fijar] = useDatos('comunicados.detalle', {id}, [id]);
  const [enviando, setEnviando] = useState(false);
  const confirmar = async () => {
    setEnviando(true);
    try { const r = await api('comunicados.confirmar', {id}); fijar(r); avisar(r.mensaje); } catch (e) { avisar(e.message, 'rojo'); }
    setEnviando(false);
  };
  const cat = c && categoria(c.categoria);
  return (
    <Modal ancho titulo={t('Comunicado')} onCerrar={onCerrar} pie={<Boton onClick={onCerrar}>{t('Cerrar')}</Boton>}>
      {error && <Fallo>{error}</Fallo>}
      {!c ? <Cargando /> : (
        <article className="si-articulo si-comunicado-detalle">
          <div className="si-articulo-portada" style={{'--c': cat.color}}><Icono n={cat.icono} /></div>
          <span className="si-eyebrow">{t(cat.nombre)}</span>
          <h2>{c.titulo}</h2>
          <div className="si-articulo-autor">
            <Avatar nombre={c.autor} tam={36} />
            <div>
              <strong>{c.autor}</strong>
              <small>{fecha(c.publicado.slice(0, 10), {day: 'numeric', month: 'long', year: 'numeric'})} · <Icono n="personas" /> {ambitoTexto(c.ambito)}</small>
            </div>
          </div>
          <div className="si-comunicado-texto">{c.texto}</div>
          {c.enlace && <p><a className="si-boton" href={c.enlace} target="_blank" rel="noopener noreferrer"><Icono n="enlace" /> {t('Documento relacionado')}</a></p>}
          {c.confirmar && (c.confirmado
            ? <Mensaje tono="ok" icono="checkCirculo">{t('Confirmaste la lectura el {fecha}.', {fecha: fecha(c.confirmadoEl.slice(0, 10), {day: 'numeric', month: 'long'})})}</Mensaje>
            : c.paraMi && (
              <div className="si-acuse">
                <Icono n="firmar" />
                <div className="si-crece">
                  <strong>{t('Confirmación de lectura')}</strong>
                  <p>{t('RRHH pide que confirmes que lo has leído')}{c.limite ? ` ${t('antes del {fecha}', {fecha: fecha(c.limite, {day: 'numeric', month: 'long'})})}` : ''}.</p>
                </div>
                <Boton tipo="primario" disabled={enviando} onClick={confirmar}>{t('He leído y acepto')}</Boton>
              </div>
            ))}
        </article>
      )}
    </Modal>
  );
}

function PublicarComunicado({departamentos, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const [f, setF] = useState({titulo: '', categoria: 'AVISO', ambito: 'TODOS', texto: '', enlace: '', confirmar: false, limite: ''});
  const [enviando, setEnviando] = useState(false);
  const cambiar = (k) => (e) => setF({...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value});
  const publicar = async () => {
    setEnviando(true);
    try { const r = await api('comunicados.publicar', {...f, limite: f.confirmar ? f.limite : ''}); avisar(r.mensaje); onHecho(); onCerrar(); } catch (e) { avisar(e.message, 'rojo'); setEnviando(false); }
  };
  return (
    <Modal ancho titulo={t('Publicar comunicado')} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton>
        <Boton tipo="primario" disabled={enviando || !f.titulo.trim() || !f.texto.trim()} onClick={publicar}>{t('Publicar')}</Boton></>}>
      <Campo etiqueta={t('Título')}><input className="si-input" value={f.titulo} maxLength={160} onChange={cambiar('titulo')} autoFocus /></Campo>
      <div className="si-rejilla-2">
        <Campo etiqueta={t('Tipo')}>
          <select className="si-select" value={f.categoria} onChange={cambiar('categoria')}>
            {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{t(v.nombre)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={t('Para')}><Destinatarios valor={f.ambito} onCambiar={(v) => setF({...f, ambito: v})} departamentos={departamentos} /></Campo>
      </div>
      <Campo etiqueta={t('Texto')}><textarea className="si-input" rows={8} value={f.texto} maxLength={8000} onChange={cambiar('texto')} /></Campo>
      <Campo etiqueta={t('Enlace (opcional)')} ayuda={t('Un documento del DAM, una página del portal o una web: https://… o /…')}>
        <input className="si-input" value={f.enlace} onChange={cambiar('enlace')} placeholder="https://" />
      </Campo>
      <label className="si-casilla"><input type="checkbox" checked={f.confirmar} onChange={cambiar('confirmar')} /> {t('Pedir acuse de lectura («He leído y acepto»)')}</label>
      {f.confirmar && (
        <Campo etiqueta={t('Fecha límite para confirmar (opcional)')}>
          <input className="si-input" type="date" min={iso(new Date())} value={f.limite} onChange={cambiar('limite')} />
        </Campo>
      )}
      <Mensaje icono="campana">{t('Cada destinatario recibirá un aviso en la campana.')}</Mensaje>
    </Modal>
  );
}

function Lecturas({id, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const [d, error] = useDatos('comunicados.lecturas', {id}, [id]);
  const [enviando, setEnviando] = useState(false);
  const accion = async (op, cerrar) => {
    setEnviando(true);
    try { const r = await api(op, {id}); avisar(r.mensaje); onHecho(); if (cerrar) onCerrar(); } catch (e) { avisar(e.message, 'rojo'); }
    setEnviando(false);
  };
  const pct = (n) => (d && d.estadisticas.destinatarios ? Math.round((100 * n) / d.estadisticas.destinatarios) : 0);
  return (
    <Modal ancho titulo={d ? d.titulo : t('Lecturas')} onCerrar={onCerrar}
      pie={d && <>
        <Boton tipo="peligro" icono="archivar" disabled={enviando} onClick={() => accion('comunicados.archivar', true)}>{t('Archivar')}</Boton>
        <Boton icono="campana" disabled={enviando} onClick={() => accion('comunicados.recordar')}>{t('Enviar recordatorio a quien falta')}</Boton>
        <Boton onClick={onCerrar}>{t('Cerrar')}</Boton>
      </>}>
      {error && <Fallo>{error}</Fallo>}
      {!d ? <Cargando /> : (
        <>
          <div className="si-cifras">
            <div><span>{t('Destinatarios')}</span><strong>{d.estadisticas.destinatarios}</strong><small>{ambitoTexto(d.ambito)}</small></div>
            <div><span>{t('Leído')}</span><strong>{d.estadisticas.leidos}</strong><small>{pct(d.estadisticas.leidos)} %</small></div>
            {d.confirmar && <div><span>{t('Confirmado')}</span><strong>{d.estadisticas.confirmados}</strong><small>{pct(d.estadisticas.confirmados)} %</small></div>}
          </div>
          <div className="si-tabla-envoltura">
            <table className="si-tabla">
              <thead><tr><th>{t('Persona')}</th><th>{t('Departamento')}</th><th>{t('Leído')}</th>{d.confirmar && <th>{t('Confirmado')}</th>}</tr></thead>
              <tbody>
                {d.personas.map((p) => (
                  <tr key={p.persona.usuario}>
                    <td><span className="si-fila"><Avatar nombre={p.persona.nombre} tam={24} />{p.persona.nombre}</span></td>
                    <td>{p.persona.departamento}</td>
                    <td>{p.leido ? haceCuanto(p.leido) : <span className="si-tenue">—</span>}</td>
                    {d.confirmar && <td>{p.confirmado ? <Insignia tono="verde"><Icono n="check" />{haceCuanto(p.confirmado)}</Insignia> : <Insignia tono="ambar">{t('Pendiente')}</Insignia>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// =========================================================================================== Consultas a RRHH

function Consultas({onCambio}) {
  const [d, error, recargar] = useDatos('consultas.lista', {}, []);
  const [elegida, setVista] = useState(null);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const cambio = () => { recargar(); onCambio(); };
  // RRHH empieza en su bandeja; el resto, en sus consultas
  const vista = elegida || (d.rrhh ? 'bandeja' : 'mias');
  const bandeja = vista === 'bandeja';
  const lista = bandeja ? d.bandeja : d.mias;
  const sinAtender = d.rrhh ? d.bandeja.filter((c) => c.estado === 'ABIERTA').length : 0;
  return (
    <>
      <NuevaConsulta onHecho={cambio} />
      <Seccion titulo={bandeja ? t('Bandeja de RRHH') : t('Mis consultas')}
        accion={d.rrhh && (
          <div className="si-segmentos" role="tablist">
            <button type="button" role="tab" aria-selected={!bandeja} className={!bandeja ? 'activa' : ''} onClick={() => setVista('mias')}>{t('Mis consultas')} <span>{d.mias.length}</span></button>
            <button type="button" role="tab" aria-selected={bandeja} className={bandeja ? 'activa' : ''} onClick={() => setVista('bandeja')}>{t('Bandeja de RRHH')} <span>{sinAtender || d.bandeja.length}</span></button>
          </div>
        )} />
      <div className="si-tarjeta si-tarjeta-lista">
        {lista.length ? (
          <div className="si-tabla-envoltura">
            <table className="si-tabla si-casos si-consultas">
              <thead>
                <tr>
                  {bandeja && <th>{t('Persona')}</th>}
                  <th>{t('Asunto')}</th><th>{t('Tema')}</th><th>{t('Estado')}</th><th>{t('Actualizada')}</th><th><span className="si-oculto">{t('Comentarios')}</span></th>
                </tr>
              </thead>
              <tbody>{lista.map((c) => <FilaConsulta key={c.id} c={c} rrhh={d.rrhh} bandeja={bandeja} onHecho={cambio} />)}</tbody>
            </table>
          </div>
        ) : <Vacio icono="chat">{bandeja ? t('No hay consultas de la plantilla.') : t('No has hecho consultas a RRHH.')}</Vacio>}
      </div>
    </>
  );
}

/**
 * «¿En qué podemos ayudarte?»: primero se busca en las preguntas frecuentes y en los comunicados de RRHH; si no hay
 * respuesta, se escribe la consulta (y se siguen sugiriendo respuestas mientras se escribe).
 */
function NuevaConsulta({onHecho}) {
  const {api, avisar} = useSuite();
  const [busqueda, setBusqueda] = useState('');
  const [f, setF] = useState({categoria: 'NOMINA', asunto: '', texto: ''});
  const [abierto, setAbierto] = useState(false);
  const [sug, setSug] = useState(null);
  const [verComunicado, setVerComunicado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const q = (abierto ? `${f.asunto} ${f.texto}` : busqueda).trim();
  useEffect(() => {
    if (q.length < (abierto ? 6 : 3)) { setSug(null); return undefined; }
    const temporizador = setTimeout(() => { api('consultas.buscar', {q}).then(setSug).catch(() => setSug(null)); }, 400);
    return () => clearTimeout(temporizador);
  }, [q, abierto]); // eslint-disable-line react-hooks/exhaustive-deps
  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await api('consultas.crear', f); avisar(r.mensaje);
      setF({categoria: f.categoria, asunto: '', texto: ''}); setBusqueda(''); setAbierto(false); onHecho();
    } catch (e) { avisar(e.message, 'rojo'); }
    setEnviando(false);
  };
  const escribir = () => { setF({...f, asunto: f.asunto || busqueda.trim().slice(0, 160)}); setAbierto(true); };
  const hay = sug && (sug.preguntas.length || sug.comunicados.length);
  const respuestas = hay && (
    <div className="si-respuestas">
      {sug.preguntas.map((p) => (
        <details key={`p${p.id}`} className="si-faq">
          <summary><Icono n="ayuda" /><span className="si-crece">{p.pregunta}</span><Icono n="abajo" className="si-chevron" /></summary>
          <p>{p.respuesta}</p>
        </details>
      ))}
      {sug.comunicados.map((c) => {
        const cat = categoria(c.categoria);
        return (
          <button key={`c${c.id}`} type="button" className="si-sugerencia-comunicado" onClick={() => setVerComunicado(c.id)}>
            <span className="si-mini-portada" style={{'--c': cat.color}}><Icono n={cat.icono} /></span>
            <span className="si-crece"><strong>{c.titulo}</strong><small>{c.extracto}</small></span>
            <Icono n="derecha" />
          </button>
        );
      })}
    </div>
  );
  return (
    <section className="si-ayuda">
      {!abierto ? (
        <>
          <div className="si-ayuda-cab">
            <h3>{t('¿En qué podemos ayudarte?')}</h3>
            <p>{t('Busca primero en las preguntas frecuentes y en los comunicados de RRHH: muchas dudas ya tienen respuesta.')}</p>
            <Buscador grande valor={busqueda} onCambiar={setBusqueda} placeholder={t('Por ejemplo: certificado de empresa, cuenta bancaria, IRPF…')} />
          </div>
          {hay ? <div className="si-ayuda-resultados"><h4>{t('Respuestas encontradas')}</h4>{respuestas}</div>
            : sug && <p className="si-ayuda-resultados si-tenue">{t('No hemos encontrado nada parecido.')}</p>}
          <div className="si-ayuda-pie">
            <span><Icono n="candado" /> {t('Nómina, certificados, datos personales, contrato, formación… Solo la veréis tú y RRHH: tu responsable no.')}</span>
            <Boton tipo="primario" icono="chat" onClick={escribir}>{t('Nueva consulta')}</Boton>
          </div>
        </>
      ) : (
        <>
          <div className="si-ayuda-cab"><h3>{t('Nueva consulta a RRHH')}</h3></div>
          <div className="si-consulta-nueva">
            <div>
              <div className="si-rejilla-2">
                <Campo etiqueta={t('Tema')}>
                  <select className="si-select" value={f.categoria} onChange={(e) => setF({...f, categoria: e.target.value})}>
                    {Object.entries(TEMAS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
                  </select>
                </Campo>
                <Campo etiqueta={t('Asunto')}><input className="si-input" value={f.asunto} maxLength={160} autoFocus onChange={(e) => setF({...f, asunto: e.target.value})} /></Campo>
              </div>
              <Campo etiqueta={t('Tu consulta')}><textarea className="si-input" rows={5} value={f.texto} maxLength={2000} onChange={(e) => setF({...f, texto: e.target.value})} /></Campo>
              <p className="si-tenue si-privado"><Icono n="candado" /> {t('Solo la veréis tú y RRHH: tu responsable no.')}</p>
              <div className="si-fila si-al-final">
                <Boton onClick={() => setAbierto(false)}>{t('Cancelar')}</Boton>
                <Boton tipo="primario" icono="enviar" disabled={enviando || !f.asunto.trim() || !f.texto.trim()} onClick={enviar}>{t('Enviar a RRHH')}</Boton>
              </div>
            </div>
            <aside className="si-sugerencias">
              <h4><Icono n="bombilla" /> {t('¿Te sirve alguna de estas respuestas?')}</h4>
              {!hay ? <p className="si-tenue">{t('Mientras escribes, buscamos la respuesta en las preguntas frecuentes y en los comunicados de RRHH.')}</p> : (
                <>{respuestas}<p className="si-tenue">{t('Si ya tienes la respuesta, no hace falta que envíes la consulta.')}</p></>
              )}
            </aside>
          </div>
        </>
      )}
      {verComunicado && <VerComunicado id={verComunicado} onCerrar={() => setVerComunicado(null)} />}
    </section>
  );
}

function Estrellas({valor, onElegir}) {
  return (
    <span className="si-estrellas" role="radiogroup" aria-label={t('Valoración')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} aria-label={String(n)} className={valor >= n ? 'activa' : ''}
          disabled={!onElegir} onClick={() => onElegir && onElegir(n)}><Icono n="estrella" relleno={valor >= n} /></button>
      ))}
    </span>
  );
}

/** Una consulta como fila de la lista; al pulsarla se despliega debajo con la conversación y las acciones. */
function FilaConsulta({c, rrhh, bandeja, onHecho}) {
  const {api, avisar} = useSuite();
  const [abierta, setAbierta] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [cuenta, setCuenta] = useState(c.comentarios || 0);
  const [resolviendo, setResolviendo] = useState(false);
  const [respuesta, setRespuesta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const est = ESTADO_CONSULTA[c.estado];
  const alternar = async () => {
    if (!abierta && !detalle) { try { setDetalle(await api('consultas.detalle', {id: c.id})); } catch (e) { avisar(e.message, 'rojo'); } }
    setAbierta(!abierta);
  };
  const accion = async (op, params) => {
    setEnviando(true);
    try { const r = await api(op, {id: c.id, ...params}); avisar(r.mensaje); setDetalle(r); setResolviendo(false); onHecho(); } catch (e) { avisar(e.message, 'rojo'); }
    setEnviando(false);
  };
  const columnas = bandeja ? 6 : 5;
  return (
    <>
      <tr className={`si-caso si-consulta-${c.estado.toLowerCase()}${abierta ? ' abierta' : ''}`} onClick={alternar}>
        {bandeja && <td><span className="si-fila si-nowrap"><Avatar nombre={c.persona.nombre} tam={26} />{c.persona.nombre}</span></td>}
        <td className="si-caso-asunto">
          <button type="button" className="si-consulta-cab" aria-expanded={abierta} onClick={(e) => { e.stopPropagation(); alternar(); }}>
            <Icono n={abierta ? 'abajo' : 'derecha'} className="si-chevron" />{c.asunto}
          </button>
          {c.atiende && <small>{t('Atiende {nombre}', {nombre: c.atiende})}</small>}
        </td>
        <td className="si-nowrap"><span className="si-tema"><Icono n={ICONO_TEMA[c.categoria] || 'ayuda'} />{t(TEMAS[c.categoria])}</span></td>
        <td><Insignia tono={est.tono}>{t(bandeja && c.estado === 'ABIERTA' ? 'Sin atender' : est.nombre)}</Insignia></td>
        <td className="si-nowrap si-tenue">{haceCuanto(c.actualizado)}</td>
        <td className="si-nowrap si-tenue">{cuenta > 0 && <><Icono n="chat" /> {cuenta}</>}</td>
      </tr>
      {abierta && detalle && (
        <tr className="si-caso-detalle">
          <td colSpan={columnas}>
            <div className="si-consulta-cuerpo">
              <q>{detalle.texto}</q>
              <Conversacion clase="CONSULTA" objeto={c.id} compacta onCuenta={(n) => { setCuenta(n); onHecho(); }} />
              {resolviendo && (
                <div className="si-rechazo">
                  <textarea className="si-input" rows={2} autoFocus value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
                    placeholder={t('Respuesta final para la persona (opcional)')} />
                  <div className="si-fila si-al-final">
                    <Boton onClick={() => setResolviendo(false)}>{t('Volver')}</Boton>
                    <Boton tipo="exito" icono="check" disabled={enviando} onClick={() => accion('consultas.estado', {estado: 'RESUELTA', respuesta})}>{t('Marcar como resuelta')}</Boton>
                  </div>
                </div>
              )}
              {!resolviendo && (
                <footer className="si-fila si-al-final">
                  {detalle.mia && detalle.estado === 'RESUELTA' && (
                    <span className="si-fila">
                      <small className="si-tenue">{detalle.valoracion ? t('Tu valoración') : t('¿Te ha ayudado RRHH?')}</small>
                      <Estrellas valor={detalle.valoracion || 0} onElegir={(v) => accion('consultas.valorar', {valoracion: v})} />
                      <Boton icono="recargar" disabled={enviando} onClick={() => accion('consultas.estado', {estado: 'REABRIR'})}>{t('Reabrir')}</Boton>
                    </span>
                  )}
                  {rrhh && !detalle.mia && detalle.estado === 'ABIERTA' && <Boton icono="persona" disabled={enviando} onClick={() => accion('consultas.estado', {estado: 'EN_CURSO'})}>{t('Me la quedo')}</Boton>}
                  {rrhh && !detalle.mia && detalle.estado !== 'RESUELTA' && <Boton tipo="exito" icono="check" disabled={enviando} onClick={() => setResolviendo(true)}>{t('Resolver')}</Boton>}
                  {rrhh && !detalle.mia && detalle.valoracion && <span className="si-fila"><small className="si-tenue">{t('Valoración')}</small><Estrellas valor={detalle.valoracion} /></span>}
                </footer>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// =========================================================================================== Encuestas

/** Las encuestas (el antiguo «pulso») tienen ahora su propia aplicación: esta pestaña lleva a ella. */
function Pulso() {
  return (
    <section className="si-do-publicar">
      <div>
        <h3>{t('Las encuestas tienen ahora su propia aplicación')}</h3>
        <p className="si-tenue">{t('Responde las encuestas de clima, mira los resultados y sigue el plan de acción en Encuestas.')}</p>
      </div>
      <a className="si-boton si-boton-primario" href={urlApp('encuestas')}><span className="si-icono"><Icono n="grafico" /></span>{t('Ir a Encuestas')}</a>
    </section>
  );
}

// =========================================================================================== Preguntas frecuentes

function Preguntas() {
  const {api, avisar} = useSuite();
  const [d, error, , fijar] = useDatos('faq.lista', {}, []);
  const [res] = useDatos('comunicacion.resumen', {}, []);
  const [editando, setEditando] = useState(null);
  const [filtro, setFiltro] = useState('');
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const rrhh = res && res.rrhh;
  const f = plano(filtro.trim());
  const visibles = f ? d.preguntas.filter((p) => plano(`${p.pregunta} ${p.respuesta}`).includes(f)) : d.preguntas;
  const grupos = Object.keys(TEMAS).map((k) => [k, visibles.filter((p) => p.categoria === k)]).filter(([, l]) => l.length);
  const guardar = async () => {
    try { const r = await api('faq.guardar', editando); fijar(r); avisar(r.mensaje); setEditando(null); } catch (e) { avisar(e.message, 'rojo'); }
  };
  const borrar = async (id) => {
    try { const r = await api('faq.borrar', {id}); fijar(r); avisar(r.mensaje); } catch (e) { avisar(e.message, 'rojo'); }
  };
  return (
    <>
      <Seccion titulo={t('Preguntas frecuentes')}
        accion={rrhh && <Boton tipo="primario" icono="mas" onClick={() => setEditando({categoria: 'NOMINA', pregunta: '', respuesta: ''})}>{t('Nueva pregunta')}</Boton>} />
      {d.preguntas.length > 0 && <Buscador valor={filtro} onCambiar={setFiltro} placeholder={t('Buscar en las preguntas frecuentes')} />}
      {!d.preguntas.length ? <Tarjeta><Vacio icono="ayuda">{t('Aún no hay preguntas frecuentes.')}</Vacio></Tarjeta>
        : !grupos.length ? <Tarjeta><Vacio icono="buscar">{t('Ninguna pregunta contiene «{texto}».', {texto: filtro.trim()})}</Vacio></Tarjeta>
          : grupos.map(([k, l]) => (
            <section key={k} className="si-tarjeta si-faq-grupo">
              <h4 className="si-faq-tema"><span className="si-mini-portada" style={{'--c': 'var(--si-acento)'}}><Icono n={ICONO_TEMA[k]} /></span>{t(TEMAS[k])}<small>{l.length}</small></h4>
              {l.map((p) => (
                <details key={p.id} className="si-faq" open={!!f}>
                  <summary><span className="si-crece">{p.pregunta}</span><Icono n="abajo" className="si-chevron" /></summary>
                  <p>{p.respuesta}</p>
                  {rrhh && <div className="si-fila si-al-final">
                    <button type="button" className="si-enlace" onClick={() => setEditando({...p})}><Icono n="lapiz" />{t('Editar')}</button>
                    <button type="button" className="si-enlace si-negativo" onClick={() => borrar(p.id)}><Icono n="papelera" />{t('Borrar')}</button>
                  </div>}
                </details>
              ))}
            </section>
          ))}
      {editando && (
        <Modal titulo={editando.id ? t('Editar pregunta frecuente') : t('Nueva pregunta frecuente')} onCerrar={() => setEditando(null)}
          pie={<><Boton onClick={() => setEditando(null)}>{t('Cancelar')}</Boton><Boton tipo="primario" disabled={!editando.pregunta.trim() || !editando.respuesta.trim()} onClick={guardar}>{t('Guardar')}</Boton></>}>
          <Campo etiqueta={t('Tema')}>
            <select className="si-select" value={editando.categoria} onChange={(e) => setEditando({...editando, categoria: e.target.value})}>
              {Object.entries(TEMAS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
            </select>
          </Campo>
          <Campo etiqueta={t('Pregunta')}><input className="si-input" value={editando.pregunta} maxLength={300} onChange={(e) => setEditando({...editando, pregunta: e.target.value})} /></Campo>
          <Campo etiqueta={t('Respuesta')}><textarea className="si-input" rows={5} value={editando.respuesta} maxLength={2000} onChange={(e) => setEditando({...editando, respuesta: e.target.value})} /></Campo>
        </Modal>
      )}
    </>
  );
}
