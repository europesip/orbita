// ÓRBITA · Portada: noticias de la empresa (contenido de HCL DX WCM), comunicados de RRHH, próximos eventos y festivos,
// celebraciones, reconocimientos, la encuesta pendiente y los accesos a las aplicaciones.
//
// Las noticias se leen de WCM con la sesión de quien mira. Cualquiera propone una noticia con una plantilla de WCM; la
// revisa RRHH en ÓRBITA y, al aprobarla, el navegador de quien revisa la publica en WCM con sus permisos de editor.
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Avatar, Boton, Campo, Cargando, Fallo, Insignia, Modal, Pestanas, Tarjeta, Vacio, fecha, useDatos, useSuite} from './ui.jsx';
import {haceCuanto, urlApp} from './social.jsx';
import {FilaCelebracion} from './Personas.jsx';
import {Icono} from './iconos.jsx';
import {IconoApp} from './marca.jsx';
import {locale, t} from './i18n.js';
import * as wcm from './wcm.js';

const PESTANAS = ['portada', 'propuestas', 'revision'];
const pestanaDelEnlace = () => {
  const h = (typeof window !== 'undefined' && window.location.hash || '').replace('#', '');
  return PESTANAS.includes(h) ? h : 'portada';
};
/** Sección por defecto de cada plantilla (las de una plantilla nueva: la primera). */
const SECCION_DE = {noticia: 'empresa', breve: 'empresa', evento: 'eventos', bienvenida: 'personas', logro: 'equipos'};
const ICONO_PLANTILLA = {noticia: 'documento', breve: 'megafono', evento: 'evento', bienvenida: 'entrar', logro: 'trofeo'};
/** Diseños de una noticia: cómo se ve en la portada y al abrirla (elemento Diseno de la plantilla de WCM). */
const DISENOS = [
  {id: 'clasico', nombre: 'Clásico', descripcion: 'Imagen arriba, titular y texto.'},
  {id: 'portada', nombre: 'Imagen a toda página', descripcion: 'La imagen ocupa todo y el titular va encima.'},
  {id: 'columnas', nombre: 'Dos columnas', descripcion: 'Imagen a un lado y texto al otro.'},
  {id: 'cartel', nombre: 'Cartel', descripcion: 'Bloque de color con el titular grande y los datos destacados.'},
  {id: 'cita', nombre: 'Destacado', descripcion: 'La entradilla grande, como una cita.'},
];
const DISENO_DE = {noticia: 'clasico', breve: 'cartel', evento: 'cartel', bienvenida: 'cita', logro: 'columnas'};
const disenoDe = (campos) => { const d = valorDe(campos.Diseno); return DISENOS.some((x) => x.id === d) ? d : 'clasico'; };
const ESTADO = {
  BORRADOR: {tono: 'gris', nombre: 'Borrador'}, REVISION: {tono: 'azul', nombre: 'En revisión'}, DEVUELTA: {tono: 'ambar', nombre: 'Devuelta'},
  PUBLICADA: {tono: 'verde', nombre: 'Publicada'}, RECHAZADA: {tono: 'rojo', nombre: 'No se publica'},
};
const valorDe = (x) => (x && typeof x === 'object' ? x.valor : x) || '';
const fechaHora = (s) => new Date(s).toLocaleString(locale(), {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

/** Biblioteca de WCM: secciones, plantillas y noticias publicadas. */
function useNoticias(nombre) {
  const [s, setS] = useState({estado: 'cargando'});
  const cargar = useCallback(async () => {
    try {
      const lib = await wcm.biblioteca(nombre);
      if (!lib) { setS({estado: 'sin'}); return; }
      const [secciones, plantillas] = await Promise.all([wcm.secciones(lib.id), wcm.plantillas(lib.id)]);
      const pId = Object.fromEntries(plantillas.map((p) => [p.id, p])), sId = Object.fromEntries(secciones.map((x) => [x.id, x]));
      const noticias = await wcm.noticias(lib.id, pId, sId);
      setS({estado: 'ok', lib: lib.id, secciones, plantillas, noticias});
    } catch (e) { setS({estado: 'error', error: e.message}); }
  }, [nombre]);
  useEffect(() => { cargar(); }, [cargar]);
  return [s, cargar];
}

// =========================================================================================== Aplicación

export function Portada({yo}) {
  const {config} = useSuite();
  const nombre = (config && config.noticias && config.noticias.biblioteca) || 'orbita-noticias';
  const [w, recargarW] = useNoticias(nombre);
  const [r, errorR, recargarR] = useDatos('portada.resumen', {}, []);
  const [pest, setPest] = useState(pestanaDelEnlace);
  const [leer, setLeer] = useState(null);
  const [editar, setEditar] = useState(null);       // {propuesta} o {} para una nueva
  const [version, setVersion] = useState(0);         // sube al guardar: las listas se vuelven a cargar
  useEffect(() => {
    const cambio = () => setPest(pestanaDelEnlace());
    window.addEventListener('hashchange', cambio);
    return () => window.removeEventListener('hashchange', cambio);
  }, []);
  const cambiar = (p) => { setPest(p); if (window.history.replaceState) window.history.replaceState(null, '', `#${p}`); };
  const rrhh = r && r.rrhh;
  const listo = w.estado === 'ok';
  const proponer = () => setEditar({});
  const tras = () => { recargarR(); setVersion((v) => v + 1); };
  return (
    <div className="si-po">
      <Pestanas activa={pest} onCambiar={cambiar} pestanas={[
        {id: 'portada', nombre: t('Portada')},
        {id: 'propuestas', nombre: t('Mis propuestas')},
        rrhh && {id: 'revision', nombre: t('Revisión'), cuenta: r.porRevisar},
      ]} />
      {pest === 'portada' && <Inicio w={w} r={r} errorR={errorR} onLeer={setLeer} onProponer={listo ? proponer : null} config={config} rrhh={rrhh} />}
      {pest === 'propuestas' && <MisPropuestas key={version} w={w} onEditar={(p) => setEditar({propuesta: p})} onProponer={listo ? proponer : null} onCambio={tras} />}
      {pest === 'revision' && rrhh && <Revision key={version} w={w} config={config} onCambio={() => { tras(); recargarW(); }} onEditar={(p) => setEditar({propuesta: p})} />}
      {leer && <Lector n={leer} w={w} onCerrar={() => setLeer(null)} />}
      {editar && listo && <Editor w={w} propuesta={editar.propuesta} yo={yo} onCerrar={() => setEditar(null)}
        onGuardado={() => { setEditar(null); tras(); if (pest === 'portada') cambiar('propuestas'); }} />}
    </div>
  );
}

// =========================================================================================== Portada

function Inicio({w, r, errorR, onLeer, onProponer, config, rrhh}) {
  const [seccion, setSeccion] = useState('');
  const noticias = w.estado === 'ok' ? w.noticias : [];
  const filtradas = seccion ? noticias.filter((n) => n.seccion === seccion) : noticias;
  const [destacada, ...resto] = filtradas;
  const ahora = new Date().toISOString().slice(0, 16);
  const eventos = noticias.filter((n) => valorDe(n.campos.Fecha) && valorDe(n.campos.FechaFin || n.campos.Fecha) >= ahora)
    .sort((a, b) => valorDe(a.campos.Fecha).localeCompare(valorDe(b.campos.Fecha))).slice(0, 4);
  return (
    <div className="si-po-rejilla">
      <div className="si-po-principal">
        <div className="si-po-cabeza">
          <div>
            <h2>{t('Noticias')}</h2>
            {w.estado === 'ok' && w.secciones.length > 1 && (
              <div className="si-po-chips" role="group" aria-label={t('Secciones')}>
                <button type="button" className={!seccion ? 'activa' : ''} onClick={() => setSeccion('')}>{t('Todas')}</button>
                {w.secciones.map((s) => <button key={s.id} type="button" className={seccion === s.nombre ? 'activa' : ''} onClick={() => setSeccion(s.nombre)}>{t(s.titulo)}</button>)}
              </div>
            )}
          </div>
          {onProponer && <Boton tipo="primario" icono="lapiz" onClick={onProponer}>{t('Proponer una noticia')}</Boton>}
        </div>
        {w.estado === 'cargando' && <Cargando />}
        {w.estado === 'error' && <Fallo>{t('No se pueden leer las noticias de WCM: {error}', {error: w.error})}</Fallo>}
        {w.estado === 'sin' && <Vacio icono="megafono">{t('Todavía no hay biblioteca de noticias en WCM: la crea la instalación de ÓRBITA (news.enabled).')}</Vacio>}
        {w.estado === 'ok' && !filtradas.length && <Vacio icono="megafono">{t('Aún no hay noticias en esta sección.')}</Vacio>}
        {destacada && <Tarjeta className="si-po-destacada"><TarjetaNoticia n={destacada} w={w} grande onLeer={onLeer} /></Tarjeta>}
        {resto.length > 0 && <div className="si-po-lista">{resto.map((n) => <Tarjeta key={n.id}><TarjetaNoticia n={n} w={w} onLeer={onLeer} /></Tarjeta>)}</div>}
        {rrhh && config && config.noticias && config.noticias.contentComposer && (
          <p className="si-tenue si-po-cc">{t('¿Prefieres el editor de DX?')} <a href={config.noticias.contentComposer} target="_blank" rel="noopener noreferrer">{t('Escribir en Content Composer')}</a></p>
        )}
      </div>
      <aside className="si-po-lado">
        {errorR && <Fallo>{errorR}</Fallo>}
        {r && <Comunicados r={r} />}
        {r && r.comunicacion && r.comunicacion.encuestasPendientes > 0 && (
          <a className="si-po-aviso" href={urlApp('encuestas')}>
            <IconoApp app="encuestas" tam={36} />
            <span><strong>{t('Tienes una encuesta por responder')}</strong><small>{t('Es anónima y se responde en unos minutos.')}</small></span>
          </a>
        )}
        <Tarjeta titulo={t('Próximamente')}>
          {!eventos.length && !(r && r.festivos.length) ? <p className="si-tenue si-po-hueco">{t('No hay eventos ni festivos próximos.')}</p> : (
            <ul className="si-po-agenda">
              {eventos.map((n) => (
                <li key={n.id}><button type="button" onClick={() => onLeer(n)}>
                  <Dia iso={valorDe(n.campos.Fecha)} />
                  <span><strong>{n.titulo}</strong><small>{[fechaHora(valorDe(n.campos.Fecha)).split(',').slice(-1)[0].trim(), valorDe(n.campos.Lugar)].filter(Boolean).join(' · ')}</small></span>
                </button></li>
              ))}
              {r && r.festivos.map((f) => (
                <li key={f.fecha}><span className="si-po-fila"><Dia iso={f.fecha} festivo /><span><strong>{f.nombre}</strong><small>{t('Festivo')}</small></span></span></li>
              ))}
            </ul>
          )}
        </Tarjeta>
        {r && (r.celebraciones.length > 0 || r.reconocimientos.length > 0) && (
          <Tarjeta titulo={t('Personas')} accion={<a className="si-enlace" href={urlApp('personas')}>{t('Ver todo')}</a>}>
            {r.celebraciones.length > 0 && <ul className="si-pe-celebraciones si-po-cel">{r.celebraciones.slice(0, 5).map((c) => (
              <li key={`${c.tipo}-${c.usuario}`}><FilaCelebracion c={c} href={`${urlApp('personas')}#persona=${encodeURIComponent(c.usuario)}`} /></li>
            ))}</ul>}
            {r.reconocimientos.length > 0 && (
              <ul className="si-po-gracias">{r.reconocimientos.map((x) => (
                <li key={x.id}><Avatar nombre={x.para.nombre} usuario={x.para.usuario} tam={30} />
                  <span><strong>{t('{de} → {para}', {de: x.de.nombre, para: x.para.nombre})}</strong><small>«{x.texto}» · {haceCuanto(x.creado)}</small></span></li>
              ))}</ul>
            )}
          </Tarjeta>
        )}
      </aside>
      <nav className="si-accesos si-po-accesos">
        {[['inicio', 'Mi intranet', 'Tu día de un vistazo'], ['fichaje', 'Fichaje', 'Registro de jornada'], ['vacaciones', 'Vacaciones', 'Ausencias y calendario'],
          ['gastos', 'Gastos y viajes', 'Notas y tickets'], ['comunicacion', 'Comunicación', 'Comunicados y consultas'], ['personas', 'Personas', 'Directorio y organigrama'],
          ['documentos', 'Mis documentos', 'Nóminas y certificados'], ['encuestas', 'Encuestas', 'Clima y plan de acción']].map(([app, tit, s]) => (
          <a key={app} href={urlApp(app)} className="si-acceso"><span><IconoApp app={app} tam={40} /></span><strong>{t(tit)}</strong><small>{t(s)}</small></a>
        ))}
      </nav>
    </div>
  );
}

function Dia({iso, festivo}) {
  const d = new Date(iso.length === 10 ? `${iso}T12:00` : iso);
  return (
    <span className={`si-po-dia${festivo ? ' si-po-dia-festivo' : ''}`}>
      <small>{d.toLocaleDateString(locale(), {month: 'short'}).replace('.', '')}</small><strong>{d.getDate()}</strong>
    </span>
  );
}

function Comunicados({r}) {
  const l = r.comunicados || [];
  return (
    <Tarjeta titulo={t('Comunicados de RRHH')} accion={<a className="si-enlace" href={`${urlApp('comunicacion')}#comunicados`}>{t('Ver todos')}</a>}>
      {!l.length ? <p className="si-tenue si-po-hueco">{t('No hay comunicados.')}</p> : (
        <ul className="si-po-comunicados">
          {l.map((c) => (
            <li key={c.id}><a href={`${urlApp('comunicacion')}#comunicados`}>
              <span><strong>{c.titulo}</strong><small>{haceCuanto(c.publicado)}</small></span>
              {c.confirmar && !c.confirmado ? <Insignia tono="ambar">{t('Por confirmar')}</Insignia> : !c.leido && <Insignia tono="azul">{t('Nuevo')}</Insignia>}
            </a></li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

const nombreSeccion = (w, n) => { const s = w.estado === 'ok' && w.secciones.find((x) => x.nombre === n); return s ? t(s.titulo) : null; };

function TarjetaNoticia({n, w, grande, onLeer}) {
  const img = valorDe(n.campos.Imagen), entradilla = valorDe(n.campos.Entradilla);
  const evento = valorDe(n.campos.Fecha), d = disenoDe(n.campos);
  return (
    <button type="button" className={`si-po-noticia si-po-t-${d}${grande ? ' si-po-grande' : ''}${img ? '' : ' si-po-sin-imagen'}`} onClick={() => onLeer(n)}>
      {img && <span className="si-po-imagen"><img src={img} alt="" loading="lazy" /></span>}
      <span className="si-po-texto">
        <span className="si-po-meta">{nombreSeccion(w, n.seccion) && <span className="si-po-seccion">{nombreSeccion(w, n.seccion)}</span>}
          {evento ? <span><Icono n="evento" /> {fechaHora(evento)}</span> : n.fecha && <span>{haceCuanto(n.fecha)}</span>}</span>
        <strong>{n.titulo}</strong>
        {entradilla && <span className="si-po-entradilla">{entradilla}</span>}
      </span>
    </button>
  );
}

/** Una noticia completa (publicada o en propuesta). */
function Articulo({titulo, seccion, fecha: cuando, campos, w}) {
  const v = (k) => valorDe(campos[k]);
  const cuerpo = useMemo(() => wcm.limpiarHtml(v('Cuerpo')), [campos]); // eslint-disable-line react-hooks/exhaustive-deps
  const enlace = v('Enlace');
  const datos = [
    v('Fecha') && [`${fechaHora(v('Fecha'))}${v('FechaFin') ? ` – ${fechaHora(v('FechaFin'))}` : ''}`, 'evento'],
    v('Lugar') && [v('Lugar'), 'ubicacion'], v('Equipo') && [v('Equipo'), 'personas'], v('Puesto') && [v('Puesto'), 'persona'],
  ].filter(Boolean);
  const d = disenoDe(campos), img = v('Imagen');
  const meta = (
    <p className="si-po-meta">{seccion && nombreSeccion(w, seccion) && <span className="si-po-seccion">{nombreSeccion(w, seccion)}</span>}
      {cuando && <span>{fecha(cuando.slice(0, 10), {day: 'numeric', month: 'long', year: 'numeric'})}</span>}</p>
  );
  const cabeza = <>{meta}<h1>{titulo}</h1></>;
  const entradilla = v('Entradilla') && <p className="si-po-entradilla">{v('Entradilla')}</p>;
  const lista = datos.length > 0 && <p className="si-po-datos">{datos.map(([txt, i]) => <span key={i}><Icono n={i} /> {txt}</span>)}</p>;
  const resto = <>
    {cuerpo && <div className="si-po-cuerpo" dangerouslySetInnerHTML={{__html: cuerpo}} />}
    {enlace && wcm.enlaceSeguro(enlace) && <p><a className="si-boton si-boton-secundario" href={enlace} target="_blank" rel="noopener noreferrer"><span className="si-icono"><Icono n="externo" /></span>{t('Abrir el enlace')}</a></p>}
  </>;
  const foto = img && <img className="si-po-portadilla" src={img} alt="" />;
  let dentro;
  switch (d) {
    case 'portada':
      dentro = <>
        <div className={`si-po-hero${img ? '' : ' si-po-hero-sin'}`} style={img ? {backgroundImage: `url("${img.replace(/"/g, '%22')}")`} : undefined}>
          <div>{cabeza}{entradilla}</div>
        </div>
        {lista}{resto}
      </>;
      break;
    case 'columnas':
      dentro = <div className="si-po-cols">{img ? <div className="si-po-cols-img">{foto}</div> : null}<div>{cabeza}{entradilla}{lista}{resto}</div></div>;
      break;
    case 'cartel':
      dentro = <>
        <div className="si-po-cartel">{cabeza}{lista}{entradilla}</div>
        {foto}{resto}
      </>;
      break;
    case 'cita':
      dentro = <>
        {cabeza}
        {v('Entradilla') && <blockquote className="si-po-cita">{v('Entradilla')}</blockquote>}
        {(img || datos.length > 0) && <div className="si-po-cita-pie">{img && <img src={img} alt="" />}{lista}</div>}
        {resto}
      </>;
      break;
    default:
      dentro = <>{foto}{cabeza}{entradilla}{lista}{resto}</>;
  }
  return <article className={`si-po-articulo si-po-d-${d}`}>{dentro}</article>;
}

function Lector({n, w, onCerrar}) {
  return <Modal titulo={t('Noticia')} onCerrar={onCerrar} ancho><Articulo titulo={n.titulo} seccion={n.seccion} fecha={n.fecha} campos={n.campos} w={w} /></Modal>;
}

// =========================================================================================== Mis propuestas

function MisPropuestas({w, onEditar, onProponer, onCambio}) {
  const [d, error, recargar] = useDatos('noticias.propuestas', {ambito: 'mias'}, []);
  const {api, avisar} = useSuite();
  const borrar = async (p) => {
    if (!window.confirm(t('¿Borrar la propuesta «{titulo}»?', {titulo: p.titulo}))) return;
    try { const r = await api('noticias.borrar', {id: p.id}); avisar(r.mensaje); recargar(); onCambio(); } catch (e) { avisar(e.message, 'rojo'); }
  };
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  return (
    <Tarjeta titulo={t('Mis propuestas de noticia')} accion={onProponer && <Boton tipo="primario" icono="lapiz" onClick={onProponer}>{t('Proponer una noticia')}</Boton>}>
      <p className="si-tenue">{t('Escribe una noticia con una plantilla y envíala: RRHH la revisa y la publica en la portada. Te avisaremos cuando se publique o si hay que cambiar algo.')}</p>
      {!d.propuestas.length ? <Vacio icono="lapiz">{t('Aún no has propuesto ninguna noticia.')}</Vacio> : (
        <ul className="si-po-propuestas">
          {d.propuestas.map((p) => <FilaPropuesta key={p.id} p={p} w={w} accion={
            <>
              {p.editable && <Boton icono="lapiz" onClick={() => onEditar(p)}>{p.estado === 'DEVUELTA' ? t('Corregir') : t('Seguir escribiendo')}</Boton>}
              {['BORRADOR', 'DEVUELTA', 'RECHAZADA'].includes(p.estado) && <Boton icono="papelera" onClick={() => borrar(p)}>{t('Borrar')}</Boton>}
            </>
          } />)}
        </ul>
      )}
    </Tarjeta>
  );
}

function FilaPropuesta({p, w, accion, conAutor}) {
  const e = ESTADO[p.estado];
  const pl = w.estado === 'ok' && w.plantillas.find((x) => x.nombre === p.plantilla);
  return (
    <li className="si-po-propuesta">
      {p.imagen ? <img src={p.imagen} alt="" /> : <span className="si-po-sin"><Icono n={ICONO_PLANTILLA[p.plantilla] || 'documento'} /></span>}
      <span className="si-crece">
        <strong>{p.titulo}</strong>
        <small>{[pl ? t(pl.titulo) : p.plantilla, conAutor && p.autor.nombre, haceCuanto(p.actualizada)].filter(Boolean).join(' · ')}</small>
        {p.comentario && <small className="si-po-comentario"><Icono n="chat" /> {p.comentario}</small>}
      </span>
      <Insignia tono={e.tono}>{t(e.nombre)}</Insignia>
      <span className="si-fila">{accion}</span>
    </li>
  );
}

// =========================================================================================== Revisión (RRHH)

function Revision({w, config, onCambio, onEditar}) {
  const [d, error, recargar] = useDatos('noticias.propuestas', {ambito: 'revision'}, []);
  const [abierta, setAbierta] = useState(null);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const pendientes = d.propuestas.filter((p) => p.estado === 'REVISION'), hechas = d.propuestas.filter((p) => p.estado !== 'REVISION');
  return (
    <>
      <Tarjeta titulo={t('Propuestas por revisar')}>
        <p className="si-tenue">{t('Revisa cada propuesta: publícala en WCM, devuélvela a su autora con un comentario o recházala. Puedes corregir el texto antes de publicarla.')}</p>
        {!pendientes.length ? <Vacio>{t('No hay propuestas pendientes.')}</Vacio> : (
          <ul className="si-po-propuestas">{pendientes.map((p) => <FilaPropuesta key={p.id} p={p} w={w} conAutor
            accion={<Boton tipo="primario" onClick={() => setAbierta(p.id)}>{t('Revisar')}</Boton>} />)}</ul>
        )}
      </Tarjeta>
      {hechas.length > 0 && (
        <Tarjeta titulo={t('Revisadas en los últimos 60 días')}>
          <ul className="si-po-propuestas">{hechas.map((p) => <FilaPropuesta key={p.id} p={p} w={w} conAutor />)}</ul>
        </Tarjeta>
      )}
      {config && config.noticias && <p className="si-tenue si-po-cc">{t('Las noticias publicadas se gestionan en WCM.')} <a href={config.noticias.contentComposer} target="_blank" rel="noopener noreferrer">{t('Abrir Content Composer')}</a></p>}
      {abierta && <Revisar id={abierta} w={w} onCerrar={() => setAbierta(null)} onEditar={(p) => { setAbierta(null); onEditar(p); }}
        onHecho={() => { setAbierta(null); recargar(); onCambio(); }} />}
    </>
  );
}

function Revisar({id, w, onCerrar, onHecho, onEditar}) {
  const {api, avisar} = useSuite();
  const [d, error] = useDatos('noticias.propuesta', {id}, [id]);
  const [comentario, setComentario] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const p = d && d.propuesta;
  const plantilla = p && w.estado === 'ok' && w.plantillas.find((x) => x.nombre === p.plantilla);
  const seccion = p && w.estado === 'ok' && (w.secciones.find((x) => x.nombre === p.seccion) || w.secciones[0]);
  const publicar = async () => {
    setOcupado(true);
    try {
      if (!plantilla) throw new Error(t('La plantilla «{p}» ya no existe en WCM.', {p: p.plantilla}));
      const wcmId = await wcm.publicar({lib: w.lib, seccion: seccion.id, plantilla, titulo: p.titulo, campos: p.campos});
      const r = await api('noticias.publicada', {id: p.id, wcmId});
      avisar(r.mensaje);
      onHecho();
    } catch (e) {
      avisar(e.estado === 403 ? t('No tienes permiso de editor en la biblioteca de noticias de WCM: pide a un administrador de DX que te añada (news.editors).') : e.message, 'rojo');
      setOcupado(false);
    }
  };
  const decidir = async (op) => {
    setOcupado(true);
    try { const r = await api(op, {id: p.id, comentario}); avisar(r.mensaje); onHecho(); } catch (e) { avisar(e.message, 'rojo'); setOcupado(false); }
  };
  return (
    <Modal titulo={t('Revisar la propuesta')} onCerrar={onCerrar} ancho pie={p && <>
      <Boton icono="lapiz" disabled={ocupado} onClick={() => onEditar(p)}>{t('Corregir')}</Boton>
      <span className="si-crece" />
      <Boton disabled={ocupado || !comentario.trim()} onClick={() => decidir('noticias.rechazar')}>{t('No publicar')}</Boton>
      <Boton disabled={ocupado || !comentario.trim()} onClick={() => decidir('noticias.devolver')}>{t('Devolver para cambiarla')}</Boton>
      <Boton tipo="primario" icono="megafono" disabled={ocupado} onClick={publicar}>{t('Publicar en la portada')}</Boton>
    </>}>
      {error && <Fallo>{error}</Fallo>}
      {!p ? !error && <Cargando /> : (
        <>
          <p className="si-tenue">{t('Propuesta de {autor} · {plantilla} · enviada {cuando}', {autor: p.autor.nombre, plantilla: plantilla ? t(plantilla.titulo) : p.plantilla, cuando: haceCuanto(p.enviada)})}</p>
          <div className="si-po-vista"><Articulo titulo={p.titulo} seccion={p.seccion} campos={p.campos} w={w} /></div>
          <Campo etiqueta={t('Comentario para la autora')} ayuda={t('Obligatorio para devolverla o no publicarla.')}>
            <textarea className="si-input" rows={2} maxLength={1000} value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </Campo>
        </>
      )}
    </Modal>
  );
}

// =========================================================================================== Escribir una propuesta

function Editor({w, propuesta, onCerrar, onGuardado}) {
  const {api, avisar} = useSuite();
  const [p, setP] = useState(propuesta ? null : {});
  useEffect(() => {
    if (!propuesta) return;
    api('noticias.propuesta', {id: propuesta.id}).then((r) => setP(r.propuesta)).catch((e) => avisar(e.message, 'rojo'));
  }, [propuesta]); // eslint-disable-line react-hooks/exhaustive-deps
  const [plantilla, setPlantilla] = useState(null);
  useEffect(() => { if (p && p.plantilla) setPlantilla(w.plantillas.find((x) => x.nombre === p.plantilla) || null); }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return <Modal titulo={t('Proponer una noticia')} onCerrar={onCerrar}><Cargando /></Modal>;
  if (!plantilla) return <ElegirPlantilla w={w} onCerrar={onCerrar} onElegir={setPlantilla} />;
  return <Formulario w={w} plantilla={plantilla} inicial={p} onCerrar={onCerrar} onGuardado={onGuardado} api={api} avisar={avisar}
    onOtraPlantilla={p.id ? null : () => setPlantilla(null)} />;
}

function ElegirPlantilla({w, onCerrar, onElegir}) {
  const usables = w.plantillas.filter((x) => x.elementos.some((e) => e.tipo));
  return (
    <Modal titulo={t('Proponer una noticia')} onCerrar={onCerrar} ancho>
      <p>{t('Elige una plantilla. RRHH revisará tu propuesta antes de publicarla en la portada.')}</p>
      <div className="si-po-plantillas">
        {usables.map((x) => (
          <button key={x.id} type="button" className="si-po-plantilla" onClick={() => onElegir(x)}>
            <span className="si-po-plantilla-icono"><Icono n={ICONO_PLANTILLA[x.nombre] || 'documento'} /></span>
            <strong>{t(x.titulo)}</strong>
            {x.descripcion && <small>{t(x.descripcion)}</small>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function Formulario({w, plantilla, inicial, onCerrar, onGuardado, api, avisar, onOtraPlantilla}) {
  const [titulo, setTitulo] = useState(inicial.titulo || '');
  const defecto = SECCION_DE[plantilla.nombre];
  const [seccion, setSeccion] = useState(inicial.seccion || (w.secciones.some((s) => s.nombre === defecto) ? defecto : (w.secciones[0] || {}).nombre));
  const [campos, setCampos] = useState(() => {
    const c = {};
    for (const e of plantilla.elementos) if (e.tipo) c[e.nombre] = {tipo: e.tipo, valor: valorDe((inicial.campos || {})[e.nombre]) || (e.tipo === 'diseno' ? DISENO_DE[plantilla.nombre] || 'clasico' : '')};
    return c;
  });
  const [id, setId] = useState(inicial.id || null);
  const [vista, setVista] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const fijar = (k, v) => setCampos((c) => ({...c, [k]: {...c[k], valor: v}}));
  const revisando = inicial.estado === 'REVISION';
  const guardar = async (enviar) => {
    setOcupado(true);
    try {
      const r = await api('noticias.guardar', {id: id || undefined, plantilla: plantilla.nombre, seccion, titulo, campos: JSON.stringify(campos)});
      setId(r.propuesta.id);
      if (enviar) { const e = await api('noticias.enviar', {id: r.propuesta.id}); avisar(e.mensaje); onGuardado(); return; }
      avisar(r.mensaje);
      if (revisando) onGuardado();
    } catch (e) { avisar(e.message, 'rojo'); }
    setOcupado(false);
  };
  return (
    <Modal titulo={t(plantilla.titulo)} onCerrar={onCerrar} ancho pie={<>
      {onOtraPlantilla && <Boton onClick={onOtraPlantilla}>{t('Otra plantilla')}</Boton>}
      <span className="si-crece" />
      <Boton icono={vista ? 'lapiz' : 'ojo'} onClick={() => setVista(!vista)}>{vista ? t('Seguir escribiendo') : t('Vista previa')}</Boton>
      <Boton disabled={ocupado} onClick={() => guardar(false)}>{revisando ? t('Guardar cambios') : t('Guardar borrador')}</Boton>
      {!revisando && <Boton tipo="primario" icono="enviar" disabled={ocupado} onClick={() => guardar(true)}>{t('Enviar a revisión')}</Boton>}
    </>}>
      {inicial.comentario && inicial.estado === 'DEVUELTA' && <p className="si-po-devuelta"><Icono n="chat" /> <span><strong>{t('Comentario de RRHH')}</strong>{inicial.comentario}</span></p>}
      {vista ? <div className="si-po-vista"><Articulo titulo={titulo || t('(sin titular)')} seccion={seccion} campos={campos} w={w} /></div> : (
        <div className="si-po-form">
          <Campo etiqueta={t('Titular')}><input className="si-input si-po-titular" value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} /></Campo>
          {w.secciones.length > 1 && (
            <Campo etiqueta={t('Sección')}>
              <select className="si-select" value={seccion} onChange={(e) => setSeccion(e.target.value)}>
                {w.secciones.map((s) => <option key={s.id} value={s.nombre}>{t(s.titulo)}</option>)}
              </select>
            </Campo>
          )}
          {plantilla.elementos.filter((e) => e.tipo).sort((a, b) => (b.tipo === 'diseno') - (a.tipo === 'diseno')).map((e) => (
            <CampoPlantilla key={e.nombre} e={e} valor={campos[e.nombre].valor} onCambio={(v) => fijar(e.nombre, v)} api={api} avisar={avisar} />
          ))}
        </div>
      )}
    </Modal>
  );
}

const ETIQUETAS = {Entradilla: 'Entradilla', Imagen: 'Imagen', Cuerpo: 'Texto', Enlace: 'Enlace', Fecha: 'Empieza', FechaFin: 'Termina', Lugar: 'Lugar',
  Equipo: 'Equipo', Puesto: 'Puesto y equipo', Diseno: 'Diseño'};

function CampoPlantilla({e, valor, onCambio, api, avisar}) {
  const etiqueta = t(ETIQUETAS[e.nombre] || e.titulo);
  switch (e.tipo) {
    case 'diseno': return (
      <div className="si-campo"><span>{etiqueta}</span>
        <div className="si-po-disenos" role="radiogroup" aria-label={etiqueta}>
          {DISENOS.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={(valor || 'clasico') === x.id} className={`si-po-diseno${(valor || 'clasico') === x.id ? ' activo' : ''}`} onClick={() => onCambio(x.id)}>
              <MiniDiseno id={x.id} /><strong>{t(x.nombre)}</strong><small>{t(x.descripcion)}</small>
            </button>
          ))}
        </div>
      </div>
    );
    case 'rico': return <Campo etiqueta={etiqueta}><EditorRico valor={valor} onCambio={onCambio} /></Campo>;
    case 'largo': return <Campo etiqueta={etiqueta}><textarea className="si-input" rows={4} maxLength={4000} value={valor} onChange={(x) => onCambio(x.target.value)} /></Campo>;
    case 'imagen': return <Campo etiqueta={etiqueta} ayuda={t('JPG o PNG, horizontal. Se guarda sin los datos de la cámara ni la ubicación.')}><SubirImagen valor={valor} onCambio={onCambio} api={api} avisar={avisar} /></Campo>;
    case 'fecha': return <Campo etiqueta={etiqueta}><input className="si-input" type="datetime-local" value={valor} onChange={(x) => onCambio(x.target.value)} /></Campo>;
    case 'enlace': return <Campo etiqueta={etiqueta} ayuda={t('https://… o una página del portal.')}><input className="si-input" type="url" value={valor} maxLength={500} onChange={(x) => onCambio(x.target.value)} placeholder="https://" /></Campo>;
    default: return (
      <Campo etiqueta={etiqueta} ayuda={e.nombre === 'Entradilla' ? t('Una o dos frases: es lo que se ve en la portada.') : undefined}>
        {e.nombre === 'Entradilla' ? <textarea className="si-input" rows={2} maxLength={1000} value={valor} onChange={(x) => onCambio(x.target.value)} />
          : <input className="si-input" value={valor} maxLength={1000} onChange={(x) => onCambio(x.target.value)} />}
      </Campo>
    );
  }
}

/** Miniatura de un diseño (bloques: imagen, titular, texto). */
function MiniDiseno({id}) {
  const I = <i className="si-po-m-img" />, T = <i className="si-po-m-tit" />, X = <><i className="si-po-m-lin" /><i className="si-po-m-lin si-po-m-corta" /></>;
  return (
    <span className={`si-po-mini si-po-mini-${id}`} aria-hidden="true">
      {id === 'clasico' && <>{I}{T}{X}</>}
      {id === 'portada' && <span className="si-po-m-hero">{T}<i className="si-po-m-lin si-po-m-clara" /></span>}
      {id === 'columnas' && <span className="si-po-m-cols">{I}<span>{T}{X}</span></span>}
      {id === 'cartel' && <><span className="si-po-m-cartel">{T}<i className="si-po-m-lin si-po-m-clara" /></span>{X}</>}
      {id === 'cita' && <>{T}<i className="si-po-m-quote">“</i>{X}</>}
    </span>
  );
}

/** Editor de texto enriquecido sencillo: negrita, cursiva, títulos, listas, cita y enlaces (se limpia al guardar). */
function EditorRico({valor, onCambio}) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== valor) ref.current.innerHTML = wcm.limpiarHtml(valor); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = (c, v) => { ref.current.focus(); document.execCommand(c, false, v); onCambio(ref.current.innerHTML); };
  const enlace = () => {
    const u = window.prompt(t('Dirección del enlace (https://…)'), 'https://');
    if (u && wcm.enlaceSeguro(u)) cmd('createLink', u);
  };
  const botones = [['bold', t('N|negrita'), t('Negrita')], ['italic', t('C|cursiva'), t('Cursiva')], ['h2', t('T|título'), t('Título')], ['insertUnorderedList', '•', t('Lista')],
    ['insertOrderedList', '1.', t('Lista numerada')], ['blockquote', '“', t('Cita')]];
  return (
    <div className="si-po-rico">
      <div className="si-po-barra" role="toolbar">
        {botones.map(([c, txt, tit]) => (
          <button key={c} type="button" title={tit} aria-label={tit} onMouseDown={(x) => x.preventDefault()}
            onClick={() => (c === 'h2' || c === 'blockquote' ? cmd('formatBlock', c) : cmd(c))}
            className={c === 'bold' ? 'si-po-b' : c === 'italic' ? 'si-po-i' : ''}>{txt}</button>
        ))}
        <button type="button" title={t('Enlace')} aria-label={t('Enlace')} onMouseDown={(x) => x.preventDefault()} onClick={enlace}><Icono n="enlace" /></button>
      </div>
      <div ref={ref} className="si-po-editable" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
        onInput={() => onCambio(ref.current.innerHTML)}
        onPaste={(x) => { x.preventDefault(); document.execCommand('insertHTML', false, wcm.limpiarHtml(x.clipboardData.getData('text/html') || wcm.limpiarHtml(x.clipboardData.getData('text/plain').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')))); onCambio(ref.current.innerHTML); }} />
    </div>
  );
}

/** Reduce la imagen en el navegador (como mucho 1600 px de ancho) antes de enviarla; el servidor la vuelve a dibujar. */
function reducir(fichero) {
  return new Promise((ok, ko) => {
    if (!/^image\/(jpeg|png)$/.test(fichero.type)) { ko(new Error(t('La imagen tiene que ser JPG o PNG.'))); return; }
    const url = URL.createObjectURL(fichero), img = new Image();
    img.onload = () => {
      const w = Math.min(1600, img.naturalWidth), h = Math.round(img.naturalHeight * (w / img.naturalWidth));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error(t('No se puede leer la imagen: prueba con otro fichero JPG o PNG.'))); };
    img.src = url;
  });
}

function SubirImagen({valor, onCambio, api, avisar}) {
  const [subiendo, setSubiendo] = useState(false);
  const elegir = async (x) => {
    const f = x.target.files && x.target.files[0];
    x.target.value = '';
    if (!f) return;
    setSubiendo(true);
    try { const r = await api('noticias.imagen', {datos: await reducir(f)}); onCambio(r.url); } catch (e) { avisar(e.message, 'rojo'); }
    setSubiendo(false);
  };
  return (
    <div className="si-po-subir">
      {valor ? <img src={valor} alt="" /> : <span className="si-po-sin-img"><Icono n="camara" /></span>}
      <span className="si-fila">
        <label className="si-boton si-boton-secundario si-pe-elegir">
          <span className="si-icono"><Icono n="subir" /></span>{subiendo ? t('Subiendo…') : valor ? t('Cambiar la imagen') : t('Elegir una imagen')}
          <input type="file" accept="image/jpeg,image/png" onChange={elegir} disabled={subiendo} />
        </label>
        {valor && <Boton icono="papelera" onClick={() => onCambio('')}>{t('Quitar')}</Boton>}
      </span>
    </div>
  );
}
