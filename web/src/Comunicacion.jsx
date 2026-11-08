// Comunicación con RRHH: comunicados con acuse de lectura, consultas a RRHH (con respuestas sugeridas antes de
// preguntar), pulso (encuestas anónimas) y preguntas frecuentes. RRHH publica, atiende y ve resultados; los
// responsables ven los resultados del pulso de su departamento.
import React, {useEffect, useMemo, useState} from 'react';
import {
  Avatar, Boton, Campo, Cargando, Fallo, Insignia, Modal, Pestanas, Tarjeta, Vacio, fecha, iso, plural, useDatos, useSuite,
} from './ui.jsx';
import {BotonConversacion, Conversacion, haceCuanto} from './social.jsx';
import {locale, t} from './i18n.js';

const CATEGORIAS = {
  POLITICA: {nombre: 'Política', icono: '📜', color: 'var(--si-violeta)'},
  AVISO: {nombre: 'Aviso', icono: '📣', color: 'var(--si-azul)'},
  EVENTO: {nombre: 'Evento', icono: '🎉', color: 'var(--si-rosa)'},
  BENEFICIO: {nombre: 'Beneficio', icono: '🎁', color: 'var(--si-verde)'},
};
const TEMAS = {
  NOMINA: 'Nómina', CERTIFICADO: 'Certificados', DATOS: 'Datos personales', CONTRATO: 'Contrato y jornada', FORMACION: 'Formación', OTRA: 'Otra',
};
const ESTADO_CONSULTA = {
  ABIERTA: {nombre: 'Enviada', tono: 'ambar'}, EN_CURSO: {nombre: 'En curso', tono: 'azul'}, RESUELTA: {nombre: 'Resuelta', tono: 'verde'},
};
const ROLES = {EMPLEADO: 'Empleados', RESPONSABLE: 'Responsables', RRHH: 'RRHH', ADMINISTRACION: 'Administración'};
const PESTANAS = ['comunicados', 'consultas', 'pulso', 'preguntas'];

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
        {id: 'pulso', nombre: t('Pulso'), cuenta: res ? res.encuestasPendientes : 0},
        {id: 'preguntas', nombre: t('Preguntas frecuentes')},
      ]} />
      {pest === 'comunicados' && <Comunicados onCambio={recargarRes} />}
      {pest === 'consultas' && <Consultas onCambio={recargarRes} />}
      {pest === 'pulso' && <Pulso onCambio={recargarRes} />}
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
  // Primero lo que hay que confirmar (por fecha límite), después lo no leído
  const porConfirmar = (c) => c.confirmar && !c.confirmado;
  const pendientes = mios.filter((c) => !c.leido || porConfirmar(c))
    .sort((x, y) => (porConfirmar(y) - porConfirmar(x)) || (x.limite || '9').localeCompare(y.limite || '9'));
  const resto = d.comunicados.filter((c) => !pendientes.includes(c));
  const cambio = () => { recargar(); onCambio(); };
  return (
    <>
      {d.rrhh && (
        <div className="si-fila si-al-final">
          <Boton tipo="primario" icono="✚" onClick={() => setPublicar(true)}>{t('Publicar comunicado')}</Boton>
        </div>
      )}
      <Tarjeta titulo={pendientes.length ? plural(pendientes.length, 'comunicado pendiente', 'comunicados pendientes') : t('Pendientes')}>
        {pendientes.length
          ? <div className="si-comunicados">{pendientes.map((c) => <FichaComunicado key={c.id} c={c} rrhh={d.rrhh} onAbrir={setAbierto} onLecturas={setLecturas} />)}</div>
          : <Vacio icono="📭">{t('Estás al día: no tienes comunicados por leer ni por confirmar.')}</Vacio>}
      </Tarjeta>
      {resto.length > 0 && (
        <Tarjeta titulo={d.rrhh ? t('Todos los comunicados') : t('Leídos')}>
          <div className="si-comunicados">{resto.map((c) => <FichaComunicado key={c.id} c={c} rrhh={d.rrhh} onAbrir={setAbierto} onLecturas={setLecturas} />)}</div>
        </Tarjeta>
      )}
      {abierto && <VerComunicado id={abierto} onCerrar={() => { setAbierto(null); cambio(); }} />}
      {publicar && <PublicarComunicado departamentos={d.departamentos} onCerrar={() => setPublicar(false)} onHecho={cambio} />}
      {lecturas && <Lecturas id={lecturas} onCerrar={() => setLecturas(null)} onHecho={cambio} />}
    </>
  );
}

function FichaComunicado({c, rrhh, onAbrir, onLecturas}) {
  const cat = CATEGORIAS[c.categoria] || CATEGORIAS.AVISO;
  const est = c.estadisticas;
  const objetivo = est ? (c.confirmar ? est.confirmados : est.leidos) : 0;
  return (
    <article className={`si-comunicado${c.paraMi && !c.leido ? ' si-no-leido' : ''}`} style={{'--c': cat.color}}>
      <button type="button" className="si-comunicado-abrir" onClick={() => onAbrir(c.id)}>
        <span className="si-comunicado-icono" aria-hidden="true">{cat.icono}</span>
        <span className="si-comunicado-cuerpo">
          <span className="si-fila">
            <Insignia tono="gris">{t(cat.nombre)}</Insignia>
            {c.paraMi && !c.leido && <Insignia tono="azul">{t('Nuevo')}</Insignia>}
            {c.paraMi && c.confirmar && !c.confirmado && <Insignia tono="ambar">
              ✍ {c.limite ? t('Confirmar antes del {fecha}', {fecha: fecha(c.limite, {day: 'numeric', month: 'short'})}) : t('Pide confirmación')}</Insignia>}
            {c.paraMi && c.confirmado && <Insignia tono="verde">✓ {t('Confirmado')}</Insignia>}
            {rrhh && <Insignia tono="gris">👥 {ambitoTexto(c.ambito)}</Insignia>}
          </span>
          <strong>{c.titulo}</strong>
          <small>{c.extracto}</small>
          <small className="si-tenue">{c.autor} · {haceCuanto(c.publicado)}</small>
        </span>
      </button>
      {rrhh && est && (
        <div className="si-comunicado-pie">
          <div className="si-barra" title={t('{n} de {total}', {n: objetivo, total: est.destinatarios})}>
            <div style={{width: `${est.destinatarios ? (100 * objetivo) / est.destinatarios : 0}%`}} />
          </div>
          <small>{t(c.confirmar ? '{n} de {total} han confirmado' : '{n} de {total} lo han leído', {n: objetivo, total: est.destinatarios})}</small>
          <button type="button" className="si-enlace" onClick={() => onLecturas(c.id)}>{t('Ver quién')} ›</button>
        </div>
      )}
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
  const cat = c && (CATEGORIAS[c.categoria] || CATEGORIAS.AVISO);
  return (
    <Modal ancho titulo={c ? c.titulo : t('Comunicado')} onCerrar={onCerrar}
      pie={c && <>
        {c.paraMi && c.confirmar && !c.confirmado && <Boton tipo="exito" disabled={enviando} onClick={confirmar}>✍ {t('He leído y acepto')}</Boton>}
        <Boton onClick={onCerrar}>{t('Cerrar')}</Boton>
      </>}>
      {error && <Fallo>{error}</Fallo>}
      {!c ? <Cargando /> : (
        <div className="si-comunicado-detalle">
          <p className="si-fila">
            <Insignia tono="gris">{cat.icono} {t(cat.nombre)}</Insignia>
            <span className="si-tenue">{c.autor} · {fecha(c.publicado.slice(0, 10), {day: 'numeric', month: 'long', year: 'numeric'})} · 👥 {ambitoTexto(c.ambito)}</span>
          </p>
          <div className="si-comunicado-texto">{c.texto}</div>
          {c.enlace && <p><a className="si-enlace" href={c.enlace} target="_blank" rel="noopener noreferrer">🔗 {t('Documento relacionado')}</a></p>}
          {c.confirmar && (c.confirmado
            ? <p className="si-banner si-banner-azul">✓ {t('Confirmaste la lectura el {fecha}.', {fecha: fecha(c.confirmadoEl.slice(0, 10), {day: 'numeric', month: 'long'})})}</p>
            : c.paraMi && <p className="si-banner si-banner-ambar">✍ {t('RRHH pide que confirmes que lo has leído')}{c.limite ? ` ${t('antes del {fecha}', {fecha: fecha(c.limite, {day: 'numeric', month: 'long'})})}` : ''}.</p>)}
        </div>
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
            {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v.icono} {t(v.nombre)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={t('Para')}><Destinatarios valor={f.ambito} onCambiar={(v) => setF({...f, ambito: v})} departamentos={departamentos} /></Campo>
      </div>
      <Campo etiqueta={t('Texto')}><textarea className="si-input" rows={8} value={f.texto} maxLength={8000} onChange={cambiar('texto')} /></Campo>
      <Campo etiqueta={t('Enlace (opcional)')} ayuda={t('Un documento del DAM, una página del portal o una web: https://… o /…')}>
        <input className="si-input" value={f.enlace} onChange={cambiar('enlace')} placeholder="https://" />
      </Campo>
      <label className="si-fila"><input type="checkbox" checked={f.confirmar} onChange={cambiar('confirmar')} /> {t('Pedir acuse de lectura («He leído y acepto»)')}</label>
      {f.confirmar && (
        <Campo etiqueta={t('Fecha límite para confirmar (opcional)')}>
          <input className="si-input" type="date" min={iso(new Date())} value={f.limite} onChange={cambiar('limite')} />
        </Campo>
      )}
      <p className="si-tenue">{t('Cada destinatario recibirá un aviso en la campana.')}</p>
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
  return (
    <Modal ancho titulo={d ? d.titulo : t('Lecturas')} onCerrar={onCerrar}
      pie={d && <>
        <Boton tipo="peligro" disabled={enviando} onClick={() => accion('comunicados.archivar', true)}>{t('Archivar')}</Boton>
        <Boton disabled={enviando} onClick={() => accion('comunicados.recordar')}>🔔 {t('Enviar recordatorio a quien falta')}</Boton>
        <Boton onClick={onCerrar}>{t('Cerrar')}</Boton>
      </>}>
      {error && <Fallo>{error}</Fallo>}
      {!d ? <Cargando /> : (
        <>
          <p className="si-fila">
            <Insignia tono="gris">👥 {ambitoTexto(d.ambito)} · {d.estadisticas.destinatarios}</Insignia>
            <Insignia tono="azul">{t('{n} lo han leído', {n: d.estadisticas.leidos})}</Insignia>
            {d.confirmar && <Insignia tono="verde">{t('{n} han confirmado', {n: d.estadisticas.confirmados})}</Insignia>}
          </p>
          <div className="si-tabla-envoltura">
            <table className="si-tabla">
              <thead><tr><th>{t('Persona')}</th><th>{t('Departamento')}</th><th>{t('Leído')}</th>{d.confirmar && <th>{t('Confirmado')}</th>}</tr></thead>
              <tbody>
                {d.personas.map((p) => (
                  <tr key={p.persona.usuario}>
                    <td><span className="si-fila"><Avatar nombre={p.persona.nombre} tam={24} />{p.persona.nombre}</span></td>
                    <td>{p.persona.departamento}</td>
                    <td>{p.leido ? haceCuanto(p.leido) : <span className="si-tenue">—</span>}</td>
                    {d.confirmar && <td>{p.confirmado ? <Insignia tono="verde">✓ {haceCuanto(p.confirmado)}</Insignia> : <Insignia tono="ambar">{t('Pendiente')}</Insignia>}</td>}
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
  const [vista, setVista] = useState('mias');
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const cambio = () => { recargar(); onCambio(); };
  const lista = vista === 'bandeja' ? d.bandeja : d.mias;
  const sinAtender = d.rrhh ? d.bandeja.filter((c) => c.estado === 'ABIERTA').length : 0;
  return (
    <>
      <NuevaConsulta onHecho={cambio} />
      <Tarjeta titulo={vista === 'bandeja' ? t('Bandeja de RRHH') : t('Mis consultas')}
        accion={d.rrhh && <div className="si-filtros">
          <button type="button" className={vista === 'mias' ? 'activa' : ''} onClick={() => setVista('mias')}>{t('Mis consultas')} <span>{d.mias.length}</span></button>
          <button type="button" className={vista === 'bandeja' ? 'activa' : ''} onClick={() => setVista('bandeja')}>{t('Bandeja de RRHH')} <span>{sinAtender || d.bandeja.length}</span></button>
        </div>}>
        {lista.length
          ? <div className="si-consultas">{lista.map((c) => <FichaConsulta key={c.id} c={c} rrhh={d.rrhh} bandeja={vista === 'bandeja'} onHecho={cambio} />)}</div>
          : <Vacio icono="💬">{vista === 'bandeja' ? t('No hay consultas de la plantilla.') : t('No has hecho consultas a RRHH.')}</Vacio>}
      </Tarjeta>
    </>
  );
}

/** Formulario de consulta con respuestas sugeridas mientras se escribe (preguntas frecuentes y comunicados). */
function NuevaConsulta({onHecho}) {
  const {api, avisar} = useSuite();
  const [f, setF] = useState({categoria: 'NOMINA', asunto: '', texto: ''});
  const [abierto, setAbierto] = useState(false);
  const [sug, setSug] = useState(null);
  const [verComunicado, setVerComunicado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const q = `${f.asunto} ${f.texto}`.trim();
  useEffect(() => {
    if (q.length < 6) { setSug(null); return undefined; }
    const temporizador = setTimeout(() => { api('consultas.buscar', {q}).then(setSug).catch(() => setSug(null)); }, 450);
    return () => clearTimeout(temporizador);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const enviar = async () => {
    setEnviando(true);
    try { const r = await api('consultas.crear', f); avisar(r.mensaje); setF({categoria: f.categoria, asunto: '', texto: ''}); setAbierto(false); onHecho(); } catch (e) { avisar(e.message, 'rojo'); }
    setEnviando(false);
  };
  if (!abierto) {
    return (
      <Tarjeta className="si-consulta-nueva-cerrada">
        <div className="si-fila">
          <span className="si-comunicado-icono" aria-hidden="true">💬</span>
          <div className="si-crece"><strong>{t('¿Tienes una duda para RRHH?')}</strong><br />
            <small className="si-tenue">{t('Nómina, certificados, datos personales, contrato, formación… Solo la veréis tú y RRHH: tu responsable no.')}</small></div>
          <Boton tipo="primario" onClick={() => setAbierto(true)}>{t('Nueva consulta')}</Boton>
        </div>
      </Tarjeta>
    );
  }
  const hay = sug && (sug.preguntas.length || sug.comunicados.length);
  return (
    <Tarjeta titulo={t('Nueva consulta a RRHH')}>
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
          <Campo etiqueta={t('Tu consulta')}><textarea className="si-input" rows={4} value={f.texto} maxLength={2000} onChange={(e) => setF({...f, texto: e.target.value})} /></Campo>
          <p className="si-tenue">🔒 {t('Solo la veréis tú y RRHH: tu responsable no.')}</p>
          <div className="si-fila si-al-final">
            <Boton onClick={() => setAbierto(false)}>{t('Cancelar')}</Boton>
            <Boton tipo="primario" disabled={enviando || !f.asunto.trim() || !f.texto.trim()} onClick={enviar}>{t('Enviar a RRHH')}</Boton>
          </div>
        </div>
        <aside className="si-sugerencias">
          <h4>💡 {t('¿Te sirve alguna de estas respuestas?')}</h4>
          {!hay ? <p className="si-tenue">{t('Mientras escribes, buscamos la respuesta en las preguntas frecuentes y en los comunicados de RRHH.')}</p> : (
            <>
              {sug.preguntas.map((p) => (
                <details key={`p${p.id}`} className="si-faq"><summary>{p.pregunta}</summary><p>{p.respuesta}</p></details>
              ))}
              {sug.comunicados.map((c) => (
                <button key={`c${c.id}`} type="button" className="si-sugerencia-comunicado" onClick={() => setVerComunicado(c.id)}>
                  {(CATEGORIAS[c.categoria] || CATEGORIAS.AVISO).icono} <strong>{c.titulo}</strong><small>{c.extracto}</small>
                </button>
              ))}
              <p className="si-tenue">{t('Si ya tienes la respuesta, no hace falta que envíes la consulta.')}</p>
            </>
          )}
        </aside>
      </div>
      {verComunicado && <VerComunicado id={verComunicado} onCerrar={() => setVerComunicado(null)} />}
    </Tarjeta>
  );
}

function Estrellas({valor, onElegir}) {
  return (
    <span className="si-estrellas" role="radiogroup" aria-label={t('Valoración')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} className={valor >= n ? 'activa' : ''}
          disabled={!onElegir} onClick={() => onElegir && onElegir(n)}>★</button>
      ))}
    </span>
  );
}

function FichaConsulta({c, rrhh, bandeja, onHecho}) {
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
  return (
    <article className={`si-consulta si-consulta-${c.estado.toLowerCase()}`}>
      <button type="button" className="si-consulta-cab" onClick={alternar} aria-expanded={abierta}>
        {bandeja && <Avatar nombre={c.persona.nombre} tam={32} />}
        <span className="si-crece">
          <strong>{c.asunto}</strong>
          <small>{bandeja ? `${c.persona.nombre} · ` : ''}{t(TEMAS[c.categoria])} · {haceCuanto(c.actualizado)}{c.atiende ? ` · ${t('Atiende {nombre}', {nombre: c.atiende})}` : ''}</small>
        </span>
        {cuenta > 0 && <span className="si-tenue">💬 {cuenta}</span>}
        <Insignia tono={est.tono}>{t(bandeja && c.estado === 'ABIERTA' ? 'Sin atender' : est.nombre)}</Insignia>
        <span className="si-chevron">{abierta ? '▾' : '▸'}</span>
      </button>
      {abierta && detalle && (
        <div className="si-consulta-cuerpo">
          <q>{detalle.texto}</q>
          <Conversacion clase="CONSULTA" objeto={c.id} compacta onCuenta={(n) => { setCuenta(n); onHecho(); }} />
          {resolviendo && (
            <div className="si-rechazo">
              <textarea className="si-input" rows={2} autoFocus value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
                placeholder={t('Respuesta final para la persona (opcional)')} />
              <div className="si-fila">
                <Boton onClick={() => setResolviendo(false)}>{t('Volver')}</Boton>
                <Boton tipo="exito" disabled={enviando} onClick={() => accion('consultas.estado', {estado: 'RESUELTA', respuesta})}>{t('Marcar como resuelta')}</Boton>
              </div>
            </div>
          )}
          {!resolviendo && (
            <footer className="si-fila si-al-final">
              {detalle.mia && detalle.estado === 'RESUELTA' && (
                <span className="si-fila">
                  <small className="si-tenue">{detalle.valoracion ? t('Tu valoración') : t('¿Te ha ayudado RRHH?')}</small>
                  <Estrellas valor={detalle.valoracion || 0} onElegir={(v) => accion('consultas.valorar', {valoracion: v})} />
                  <Boton disabled={enviando} onClick={() => accion('consultas.estado', {estado: 'REABRIR'})}>{t('Reabrir')}</Boton>
                </span>
              )}
              {rrhh && !detalle.mia && detalle.estado === 'ABIERTA' && <Boton disabled={enviando} onClick={() => accion('consultas.estado', {estado: 'EN_CURSO'})}>{t('Me la quedo')}</Boton>}
              {rrhh && !detalle.mia && detalle.estado !== 'RESUELTA' && <Boton tipo="exito" disabled={enviando} onClick={() => setResolviendo(true)}>{t('Resolver')}</Boton>}
              {rrhh && !detalle.mia && detalle.valoracion && <span className="si-fila"><small className="si-tenue">{t('Valoración')}</small><Estrellas valor={detalle.valoracion} /></span>}
            </footer>
          )}
        </div>
      )}
    </article>
  );
}

// =========================================================================================== Pulso

function Pulso({onCambio}) {
  const [d, error, recargar] = useDatos('pulso.lista', {}, []);
  const [resultados, setResultados] = useState(null);
  const [crear, setCrear] = useState(false);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const cambio = () => { recargar(); onCambio(); };
  const pendientes = d.encuestas.filter((e) => e.paraMi && e.estado === 'ABIERTA' && !e.respondida);
  const resto = d.encuestas.filter((e) => !pendientes.includes(e));
  return (
    <>
      <p className="si-banner si-banner-azul">🔒 {t('El pulso es anónimo: guardamos que has respondido, pero no qué has respondido. Los resultados solo se muestran si responde un mínimo de personas.')}</p>
      {d.rrhh && <div className="si-fila si-al-final"><Boton tipo="primario" icono="✚" onClick={() => setCrear(true)}>{t('Nueva encuesta')}</Boton></div>}
      {pendientes.map((e) => <Responder key={e.id} id={e.id} onHecho={cambio} />)}
      <Tarjeta titulo={t('Encuestas')}>
        {!resto.length && !pendientes.length ? <Vacio icono="📊">{t('Aún no hay encuestas.')}</Vacio> : !resto.length ? <Vacio>{t('Has respondido a todas.')}</Vacio> : (
          <ul className="si-lista si-encuestas">
            {resto.map((e) => (
              <li key={e.id}>
                <span className="si-comunicado-icono" aria-hidden="true">📊</span>
                <span className="si-crece">
                  <strong>{e.titulo}</strong>
                  <small>{e.estado === 'ABIERTA' ? t('Abierta hasta el {fecha}', {fecha: e.cierre ? fecha(e.cierre, {day: 'numeric', month: 'long'}) : '—'}) : t('Cerrada')}
                    {' · '}{ambitoTexto(e.ambito)}{(d.rrhh || e.resultados) ? ` · ${t('{n} de {total} han respondido', {n: e.participantes, total: e.destinatarios})}` : ''}</small>
                </span>
                {e.paraMi && e.respondida && <Insignia tono="verde">✓ {t('Respondida')}</Insignia>}
                <Insignia tono={e.estado === 'ABIERTA' ? 'azul' : 'gris'}>{t(e.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada')}</Insignia>
                {e.resultados && <Boton onClick={() => setResultados(e.id)}>{t('Resultados')}</Boton>}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      {resultados && <Resultados id={resultados} rrhh={d.rrhh} onCerrar={() => setResultados(null)} onHecho={cambio} />}
      {crear && <CrearEncuesta departamentos={d.departamentos} minimo={d.minimo} onCerrar={() => setCrear(false)} onHecho={cambio} />}
    </>
  );
}

function Escala({tipo, valor, onElegir}) {
  const n = tipo === 'ENPS' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
  return (
    <div className={`si-escala${tipo === 'ENPS' ? ' si-escala-enps' : ''}`}>
      <div className="si-escala-botones">
        {n.map((v) => <button key={v} type="button" className={valor === v ? 'activa' : ''} onClick={() => onElegir(v)} aria-pressed={valor === v}>{v}</button>)}
      </div>
      <div className="si-escala-extremos"><small>{t(tipo === 'ENPS' ? 'Nada probable' : 'Poco')}</small><small>{t(tipo === 'ENPS' ? 'Muy probable' : 'Mucho')}</small></div>
    </div>
  );
}

function Responder({id, onHecho}) {
  const {api, avisar} = useSuite();
  const [e, error] = useDatos('pulso.detalle', {id}, [id]);
  const [r, setR] = useState({});
  const [enviando, setEnviando] = useState(false);
  if (error) return <Fallo>{error}</Fallo>;
  if (!e) return <Cargando />;
  const faltan = e.lista.filter((q) => q.tipo !== 'TEXTO' && r[q.id] === undefined).length;
  const enviar = async () => {
    setEnviando(true);
    try { const x = await api('pulso.responder', {id, respuestas: JSON.stringify(r)}); avisar(x.mensaje); onHecho(); } catch (err) { avisar(err.message, 'rojo'); setEnviando(false); }
  };
  return (
    <Tarjeta className="si-pulso" titulo={<>📊 {e.titulo}</>} accion={e.cierre && <small className="si-tenue">{t('Abierta hasta el {fecha}', {fecha: fecha(e.cierre, {day: 'numeric', month: 'long'})})}</small>}>
      {e.descripcion && <p className="si-tenue">{e.descripcion}</p>}
      <ol className="si-pulso-preguntas">
        {e.lista.map((q) => (
          <li key={q.id}>
            <p>{q.texto}</p>
            {q.tipo === 'TEXTO'
              ? <><textarea className="si-input" rows={2} maxLength={1000} value={r[q.id] || ''} onChange={(ev) => setR({...r, [q.id]: ev.target.value})} />
                <small className="si-tenue">{t('No incluyas datos que permitan saber quién eres.')}</small></>
              : <Escala tipo={q.tipo} valor={r[q.id]} onElegir={(v) => setR({...r, [q.id]: v})} />}
          </li>
        ))}
      </ol>
      <div className="si-fila si-al-final">
        {faltan > 0 && <small className="si-tenue">{plural(faltan, 'pregunta por responder', 'preguntas por responder')}</small>}
        <Boton tipo="primario" disabled={enviando || faltan > 0} onClick={enviar}>🔒 {t('Enviar de forma anónima')}</Boton>
      </div>
    </Tarjeta>
  );
}

/** Media de una pregunta de escala (barra de 1 a 5) o eNPS (−100 a +100, con promotores, pasivos y detractores). */
function Medida({p, q}) {
  if (q.tipo === 'ENPS') {
    const tot = (p.promotores || 0) + (p.pasivos || 0) + (p.detractores || 0) || 1;
    return (
      <div className="si-enps">
        <span className={`si-enps-valor ${p.enps > 0 ? 'si-positivo' : p.enps < 0 ? 'si-negativo' : ''}`}>{p.enps > 0 ? '+' : ''}{p.enps}</span>
        <div className="si-crece">
          <div className="si-enps-barra">
            <span style={{width: `${(100 * p.detractores) / tot}%`, background: 'var(--si-rojo)'}} title={t('Detractores')} />
            <span style={{width: `${(100 * p.pasivos) / tot}%`, background: '#d1d5db'}} title={t('Pasivos')} />
            <span style={{width: `${(100 * p.promotores) / tot}%`, background: 'var(--si-verde)'}} title={t('Promotores')} />
          </div>
          <small className="si-tenue">{t('Promotores: {p} · Pasivos: {n} · Detractores: {d}', {p: p.promotores, n: p.pasivos, d: p.detractores})}</small>
        </div>
      </div>
    );
  }
  return (
    <div className="si-media">
      <strong>{p.media === null ? '—' : p.media.toLocaleString(locale())}</strong><small>/5</small>
      <div className="si-barra si-crece"><div style={{width: `${p.media ? ((p.media - 1) / 4) * 100 : 0}%`}} /></div>
      <span className="si-distribucion" title={t('Respuestas de 1 a 5')}>
        {p.distribucion.map((n, i) => <i key={i} style={{height: `${4 + (n / Math.max(1, ...p.distribucion)) * 22}px`}} title={`${i + 1}: ${n}`} />)}
      </span>
    </div>
  );
}

function Resultados({id, rrhh, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const [d, error] = useDatos('pulso.resultados', {id}, [id]);
  const preguntas = useMemo(() => (d ? Object.fromEntries(d.preguntas.map((q) => [q.id, q])) : {}), [d]);
  const cerrar = async () => {
    try { const r = await api('pulso.cerrar', {id}); avisar(r.mensaje); onHecho(); onCerrar(); } catch (e) { avisar(e.message, 'rojo'); }
  };
  const numericas = d ? d.preguntas.filter((q) => q.tipo !== 'TEXTO') : [];
  return (
    <Modal ancho titulo={d ? d.encuesta.titulo : t('Resultados')} onCerrar={onCerrar}
      pie={<>{rrhh && d && d.encuesta.estado === 'ABIERTA' && <Boton tipo="peligro" onClick={cerrar}>{t('Cerrar la encuesta')}</Boton>}<Boton onClick={onCerrar}>{t('Cerrar')}</Boton></>}>
      {error && <Fallo>{error}</Fallo>}
      {!d ? <Cargando /> : (
        <div className="si-resultados">
          <p className="si-fila">
            <Insignia tono="azul">{t('{n} de {total} han respondido', {n: d.encuesta.participantes, total: d.encuesta.destinatarios})}</Insignia>
            <Insignia tono="gris">🔒 {t('Mínimo para ver resultados: {n}', {n: d.minimo})}</Insignia>
          </p>
          {d.total && (
            d.total.suficientes ? (
              <>
                <h4>{t('Toda la encuesta')}</h4>
                <ul className="si-lista si-resultado-preguntas">
                  {d.total.preguntas.filter((p) => p.tipo !== 'TEXTO').map((p) => (
                    <li key={p.id}><span>{preguntas[p.id].texto}</span><Medida p={p} q={preguntas[p.id]} /></li>
                  ))}
                </ul>
              </>
            ) : <p className="si-banner si-banner-ambar">🔒 {t('Aún no hay suficientes respuestas para mostrar resultados.')}</p>
          )}
          <h4>{t('Por departamento')}</h4>
          <div className="si-tabla-envoltura">
            <table className="si-tabla">
              <thead><tr><th>{t('Departamento')}</th>{numericas.map((q, i) => <th key={q.id} title={q.texto}>{q.tipo === 'ENPS' ? 'eNPS' : `P${i + 1}`}</th>)}</tr></thead>
              <tbody>
                {d.departamentos.map((b) => (
                  <tr key={b.departamento}>
                    <td>{b.departamento}</td>
                    {b.suficientes
                      ? numericas.map((q) => { const p = b.preguntas.find((x) => x.id === q.id); return <td key={q.id}>{q.tipo === 'ENPS' ? `${p.enps > 0 ? '+' : ''}${p.enps}` : p.media.toLocaleString(locale())}</td>; })
                      : <td colSpan={numericas.length} className="si-tenue">🔒 {t('Menos de {n} respuestas: oculto para proteger el anonimato', {n: d.minimo})}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small className="si-tenue">{numericas.filter((q) => q.tipo !== 'ENPS').map((q, i) => `P${i + 1}: ${q.texto}`).join(' · ')}</small>
          {d.total && d.total.suficientes && d.total.preguntas.filter((p) => p.tipo === 'TEXTO').map((p) => (
            <div key={p.id}>
              <h4>{preguntas[p.id].texto}</h4>
              {p.comentarios.length ? <ul className="si-comentarios-pulso">{p.comentarios.map((c, i) => <li key={i}>“{c}”</li>)}</ul> : <p className="si-tenue">{t('Sin comentarios.')}</p>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

const PLANTILLA = [
  {tipo: 'ESCALA', texto: '¿Cómo de equilibrada está tu carga de trabajo?'},
  {tipo: 'ESCALA', texto: '¿Sientes que tu responsable te escucha?'},
  {tipo: 'ESCALA', texto: '¿Tienes lo que necesitas para hacer bien tu trabajo?'},
  {tipo: 'ENPS', texto: 'Del 0 al 10, ¿recomendarías la empresa a un amigo para trabajar?'},
  {tipo: 'TEXTO', texto: '¿Algo que quieras contarnos? (opcional)'},
];
const TIPOS_PREGUNTA = {ESCALA: 'Escala de 1 a 5', ENPS: 'eNPS (0 a 10)', TEXTO: 'Texto libre'};

function CrearEncuesta({departamentos, minimo, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const [f, setF] = useState({titulo: '', descripcion: t('Cinco preguntas, un minuto. Es anónima: nadie, tampoco RRHH, ve qué ha respondido cada persona.'),
    ambito: 'TODOS', minimo: 5, cierre: ''});
  const [qs, setQs] = useState(() => PLANTILLA.map((q) => ({...q, texto: t(q.texto)})));
  const [enviando, setEnviando] = useState(false);
  const crear = async () => {
    setEnviando(true);
    try {
      const r = await api('pulso.crear', {...f, preguntas: JSON.stringify(qs.filter((q) => q.texto.trim()))});
      avisar(r.mensaje); onHecho(); onCerrar();
    } catch (e) { avisar(e.message, 'rojo'); setEnviando(false); }
  };
  const cambiarQ = (i, k, v) => setQs(qs.map((q, j) => (j === i ? {...q, [k]: v} : q)));
  return (
    <Modal ancho titulo={t('Nueva encuesta de pulso')} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton><Boton tipo="primario" disabled={enviando || !f.titulo.trim() || !qs.length} onClick={crear}>{t('Abrir la encuesta')}</Boton></>}>
      <Campo etiqueta={t('Título')}><input className="si-input" value={f.titulo} maxLength={160} autoFocus onChange={(e) => setF({...f, titulo: e.target.value})} placeholder={t('Pulso de diciembre')} /></Campo>
      <Campo etiqueta={t('Descripción')}><input className="si-input" value={f.descripcion} maxLength={500} onChange={(e) => setF({...f, descripcion: e.target.value})} /></Campo>
      <div className="si-rejilla-2">
        <Campo etiqueta={t('Para')}><Destinatarios valor={f.ambito} onCambiar={(v) => setF({...f, ambito: v})} departamentos={departamentos} /></Campo>
        <Campo etiqueta={t('Cierre (opcional)')}><input className="si-input" type="date" min={iso(new Date())} value={f.cierre} onChange={(e) => setF({...f, cierre: e.target.value})} /></Campo>
      </div>
      <Campo etiqueta={t('Mínimo de respuestas para ver resultados')} ayuda={t('Protege el anonimato: con menos respuestas, el total o un departamento no se muestran. Mínimo {n}.', {n: minimo})}>
        <input className="si-input" type="number" min={minimo} max={50} value={f.minimo} onChange={(e) => setF({...f, minimo: e.target.value})} />
      </Campo>
      <h4>{t('Preguntas')}</h4>
      <ol className="si-editor-preguntas">
        {qs.map((q, i) => (
          <li key={i} className="si-fila">
            <select className="si-select" value={q.tipo} onChange={(e) => cambiarQ(i, 'tipo', e.target.value)}>
              {Object.entries(TIPOS_PREGUNTA).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
            </select>
            <input className="si-input si-crece" value={q.texto} maxLength={300} onChange={(e) => cambiarQ(i, 'texto', e.target.value)} />
            <button type="button" className="si-cerrar" aria-label={t('Quitar')} onClick={() => setQs(qs.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
      </ol>
      {qs.length < 10 && <Boton icono="✚" onClick={() => setQs([...qs, {tipo: 'ESCALA', texto: ''}])}>{t('Añadir pregunta')}</Boton>}
    </Modal>
  );
}

// =========================================================================================== Preguntas frecuentes

function Preguntas() {
  const {api, avisar} = useSuite();
  const [d, error, , fijar] = useDatos('faq.lista', {}, []);
  const [res] = useDatos('comunicacion.resumen', {}, []);
  const [editando, setEditando] = useState(null);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const rrhh = res && res.rrhh;
  const grupos = Object.keys(TEMAS).map((k) => [k, d.preguntas.filter((p) => p.categoria === k)]).filter(([, l]) => l.length);
  const guardar = async () => {
    try { const r = await api('faq.guardar', editando); fijar(r); avisar(r.mensaje); setEditando(null); } catch (e) { avisar(e.message, 'rojo'); }
  };
  const borrar = async (id) => {
    try { const r = await api('faq.borrar', {id}); fijar(r); avisar(r.mensaje); } catch (e) { avisar(e.message, 'rojo'); }
  };
  return (
    <>
      {rrhh && <div className="si-fila si-al-final"><Boton tipo="primario" icono="✚" onClick={() => setEditando({categoria: 'NOMINA', pregunta: '', respuesta: ''})}>{t('Nueva pregunta')}</Boton></div>}
      {!grupos.length ? <Tarjeta><Vacio icono="❔">{t('Aún no hay preguntas frecuentes.')}</Vacio></Tarjeta> : grupos.map(([k, l]) => (
        <Tarjeta key={k} titulo={t(TEMAS[k])}>
          {l.map((p) => (
            <details key={p.id} className="si-faq">
              <summary>{p.pregunta}</summary>
              <p>{p.respuesta}</p>
              {rrhh && <div className="si-fila si-al-final">
                <button type="button" className="si-enlace" onClick={() => setEditando({...p})}>{t('Editar')}</button>
                <button type="button" className="si-enlace si-negativo" onClick={() => borrar(p.id)}>{t('Borrar')}</button>
              </div>}
            </details>
          ))}
        </Tarjeta>
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
