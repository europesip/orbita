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
  {id: 'revista', nombre: 'Revista', descripcion: 'Titular de periódico, letra capital y texto a dos columnas.'},
  {id: 'cine', nombre: 'Cine', descripcion: 'Fondo negro, imagen con viñeta y titular enorme con degradado.'},
  {id: 'titular', nombre: 'Titular gigante', descripcion: 'Tipografía enorme en mayúsculas y la imagen desplazada.'},
  {id: 'diagonal', nombre: 'Diagonal', descripcion: 'Imagen cortada en diagonal y una banda de color con el titular.'},
  {id: 'cuenta', nombre: 'Cuenta atrás', descripcion: 'Para eventos: los días, horas y minutos que faltan.'},
  {id: 'celebracion', nombre: 'Celebración', descripcion: 'Confeti, todo centrado y la imagen en un círculo.'},
];
const DISENO_DE = {noticia: 'clasico', breve: 'cartel', evento: 'cuenta', bienvenida: 'celebracion', logro: 'celebracion'};
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
  const [prueba, setPrueba] = useState(null);        // diseño de portada que se está probando
  const [elegir, setElegir] = useState(false);
  const [disenoGuardado, setDisenoGuardado] = useState(null);
  useEffect(() => {
    const cambio = () => setPest(pestanaDelEnlace());
    window.addEventListener('hashchange', cambio);
    return () => window.removeEventListener('hashchange', cambio);
  }, []);
  const cambiar = (p) => { setPest(p); if (window.history.replaceState) window.history.replaceState(null, '', `#${p}`); };
  const rrhh = r && r.rrhh;
  const rConDiseno = r && (disenoGuardado ? {...r, diseno: disenoGuardado} : r);
  const d0 = rConDiseno && rConDiseno.diseno;
  const diseno = prueba || (d0 && (d0.mio || d0.empresa)) || 'clasica';
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
      {pest === 'portada' && <Inicio w={w} r={r} errorR={errorR} onLeer={setLeer} onProponer={listo ? proponer : null} config={config} rrhh={rrhh}
        diseno={diseno} onDisenar={r ? () => { setPrueba(diseno); setElegir(true); } : null} />}
      {elegir && <ElegirPortada r={rConDiseno} actual={prueba || diseno} onProbar={setPrueba} onCerrar={() => { setPrueba(null); setElegir(false); }}
        onGuardado={(d) => { setDisenoGuardado(d); setPrueba(null); setElegir(false); }} />}
      {pest === 'propuestas' && <MisPropuestas key={version} w={w} onEditar={(p) => setEditar({propuesta: p})} onProponer={listo ? proponer : null} onCambio={tras} />}
      {pest === 'revision' && rrhh && <Revision key={version} w={w} config={config} onCambio={() => { tras(); recargarW(); }} onEditar={(p) => setEditar({propuesta: p})} />}
      {leer && <Lector n={leer} w={w} onCerrar={() => setLeer(null)} />}
      {editar && listo && <Editor w={w} propuesta={editar.propuesta} yo={yo} onCerrar={() => setEditar(null)}
        onGuardado={() => { setEditar(null); tras(); if (pest === 'portada') cambiar('propuestas'); }} />}
    </div>
  );
}

// =========================================================================================== Portada

/** Diseños de la portada entera (RRHH elige el de la empresa; cada persona puede elegir otro para sí). */
export const PORTADAS = [
  {id: 'clasica', nombre: 'Clásica', descripcion: 'Noticia destacada, rejilla y columna lateral.'},
  {id: 'revista', nombre: 'Revista', descripcion: 'Cabecera con la fecha, noticia principal y dos secundarias, titulares de periódico.'},
  {id: 'mosaico', nombre: 'Mosaico', descripcion: 'Teselas de distintos tamaños con la imagen de fondo.'},
  {id: 'carrusel', nombre: 'Carrusel', descripcion: 'Las últimas noticias en grande, pasando solas.'},
  {id: 'cronologia', nombre: 'Cronología', descripcion: 'Una línea de tiempo con las noticias a cada lado.'},
  {id: 'titulares', nombre: 'Titulares', descripcion: 'Lista compacta de titulares y una cinta de última hora.'},
  {id: 'tablero', nombre: 'Tablero', descripcion: 'Primero los indicadores (comunicados, eventos, encuesta), después las noticias.'},
  {id: 'muro', nombre: 'Muro', descripcion: 'Columnas de tarjetas de distinta altura, con avisos y agenda entre ellas.'},
  {id: 'nocturna', nombre: 'Nocturna', descripcion: 'Modo oscuro inmersivo con la destacada sobre su imagen.'},
  {id: 'foco', nombre: 'Enfoque', descripcion: 'Una sola columna central para leer con calma.'},
];

function Inicio({w, r, errorR, onLeer, onProponer, config, rrhh, diseno, onDisenar}) {
  const [seccion, setSeccion] = useState('');
  const noticias = w.estado === 'ok' ? w.noticias : [];
  const filtradas = seccion ? noticias.filter((n) => n.seccion === seccion) : noticias;
  const ahora = new Date().toISOString().slice(0, 16);
  const eventos = noticias.filter((n) => valorDe(n.campos.Fecha) && valorDe(n.campos.FechaFin || n.campos.Fecha) >= ahora)
    .sort((a, b) => valorDe(a.campos.Fecha).localeCompare(valorDe(b.campos.Fecha))).slice(0, 4);
  const p = {w, r, errorR, onLeer, filtradas, eventos, noticias};
  const cabeza = (
    <div className="si-po-cabeza">
      <div>
        <h2>{t('Noticias')}</h2>
        <Chips w={w} seccion={seccion} onCambiar={setSeccion} />
      </div>
      <span className="si-fila">
        {onDisenar && <Boton icono="ajustes" onClick={onDisenar}>{t('Diseño de la portada')}</Boton>}
        {onProponer && <Boton tipo="primario" icono="lapiz" onClick={onProponer}>{t('Proponer una noticia')}</Boton>}
      </span>
    </div>
  );
  const estado = <EstadoNoticias w={w} vacias={w.estado === 'ok' && !filtradas.length} />;
  const pie = rrhh && config && config.noticias && config.noticias.contentComposer && (
    <p className="si-tenue si-po-cc">{t('¿Prefieres el editor de DX?')} <a href={config.noticias.contentComposer} target="_blank" rel="noopener noreferrer">{t('Escribir en Content Composer')}</a></p>
  );
  const Diseno = DISENOS_PORTADA[diseno] || DISENOS_PORTADA.clasica;
  return <div className={`si-po-portada si-po-l-${diseno}`}><Diseno {...p} cabeza={cabeza} estado={estado} pie={pie} /></div>;
}

// ---------------------------------------------------------------- Piezas comunes

function Chips({w, seccion, onCambiar}) {
  if (w.estado !== 'ok' || w.secciones.length < 2) return null;
  return (
    <div className="si-po-chips" role="group" aria-label={t('Secciones')}>
      <button type="button" className={!seccion ? 'activa' : ''} onClick={() => onCambiar('')}>{t('Todas')}</button>
      {w.secciones.map((s) => <button key={s.id} type="button" className={seccion === s.nombre ? 'activa' : ''} onClick={() => onCambiar(s.nombre)}>{t(s.titulo)}</button>)}
    </div>
  );
}

function EstadoNoticias({w, vacias}) {
  if (w.estado === 'cargando') return <Cargando />;
  if (w.estado === 'error') return <Fallo>{t('No se pueden leer las noticias de WCM: {error}', {error: w.error})}</Fallo>;
  if (w.estado === 'sin') return <Vacio icono="megafono">{t('Todavía no hay biblioteca de noticias en WCM: la crea la instalación de ÓRBITA (news.enabled).')}</Vacio>;
  if (vacias) return <Vacio icono="megafono">{t('Aún no hay noticias en esta sección.')}</Vacio>;
  return null;
}

const Rejilla = ({lista, w, onLeer, clase = ''}) => (lista.length ? (
  <div className={`si-po-lista ${clase}`}>{lista.map((n) => <Tarjeta key={n.id}><TarjetaNoticia n={n} w={w} onLeer={onLeer} /></Tarjeta>)}</div>
) : null);

function AvisoEncuesta({r}) {
  if (!r || !r.comunicacion || !(r.comunicacion.encuestasPendientes > 0)) return null;
  return (
    <a className="si-po-aviso" href={urlApp('encuestas')}>
      <IconoApp app="encuestas" tam={36} />
      <span><strong>{t('Tienes una encuesta por responder')}</strong><small>{t('Es anónima y se responde en unos minutos.')}</small></span>
    </a>
  );
}

function Agenda({r, eventos, onLeer}) {
  return (
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
  );
}

function PersonasWidget({r}) {
  if (!r || !(r.celebraciones.length > 0 || r.reconocimientos.length > 0)) return null;
  return (
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
  );
}

/** Columna o fila de avisos: comunicados, encuesta, agenda y personas. */
function Lado({r, errorR, eventos, onLeer, clase = 'si-po-lado'}) {
  return (
    <aside className={clase}>
      {errorR && <Fallo>{errorR}</Fallo>}
      {r && <Comunicados r={r} />}
      <AvisoEncuesta r={r} />
      <Agenda r={r} eventos={eventos} onLeer={onLeer} />
      <PersonasWidget r={r} />
    </aside>
  );
}

function Accesos() {
  return (
    <nav className="si-accesos si-po-accesos">
      {[['inicio', 'Mi intranet', 'Tu día de un vistazo'], ['fichaje', 'Fichaje', 'Registro de jornada'], ['vacaciones', 'Vacaciones', 'Ausencias y calendario'],
        ['gastos', 'Gastos y viajes', 'Notas y tickets'], ['comunicacion', 'Comunicación', 'Comunicados y consultas'], ['personas', 'Personas', 'Directorio y organigrama'],
        ['documentos', 'Mis documentos', 'Nóminas y certificados'], ['encuestas', 'Encuestas', 'Clima y plan de acción']].map(([app, tit, s]) => (
        <a key={app} href={urlApp(app)} className="si-acceso"><span><IconoApp app={app} tam={40} /></span><strong>{t(tit)}</strong><small>{t(s)}</small></a>
      ))}
    </nav>
  );
}

const imagenDe = (n) => valorDe(n.campos.Imagen);
const fondo = (img) => (img ? {backgroundImage: `url("${img.replace(/"/g, '%22')}")`} : undefined);
const cuando = (n) => (valorDe(n.campos.Fecha) ? fechaHora(valorDe(n.campos.Fecha)) : n.fecha ? haceCuanto(n.fecha) : '');

/** Tesela con la imagen de fondo y el titular encima (mosaico, carrusel, nocturna). */
function Tesela({n, w, onLeer, clase = ''}) {
  const img = imagenDe(n);
  return (
    <button type="button" className={`si-po-tesela ${clase}${img ? '' : ' si-po-tesela-sin'}`} style={fondo(img)} onClick={() => onLeer(n)}>
      <span className="si-po-tesela-txt">
        <span className="si-po-meta">{nombreSeccion(w, n.seccion) && <span className="si-po-seccion">{nombreSeccion(w, n.seccion)}</span>}<span>{cuando(n)}</span></span>
        <strong>{n.titulo}</strong>
        {valorDe(n.campos.Entradilla) && <span className="si-po-entradilla">{valorDe(n.campos.Entradilla)}</span>}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- Los diez diseños

function Clasica({w, r, errorR, onLeer, filtradas, eventos, cabeza, estado, pie}) {
  const [destacada, ...resto] = filtradas;
  return (
    <div className="si-po-rejilla">
      <div className="si-po-principal">
        {cabeza}{estado}
        {destacada && <Tarjeta className="si-po-destacada"><TarjetaNoticia n={destacada} w={w} grande onLeer={onLeer} /></Tarjeta>}
        <Rejilla lista={resto} w={w} onLeer={onLeer} />
        {pie}
      </div>
      <Lado r={r} errorR={errorR} eventos={eventos} onLeer={onLeer} />
      <Accesos />
    </div>
  );
}

function Revista({w, r, errorR, onLeer, filtradas, eventos, cabeza, estado, pie}) {
  const [a, b, c, ...resto] = filtradas;
  const hoy = new Date().toLocaleDateString(locale(), {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  return (
    <>
      <div className="si-po-cabecera-rev"><small>{t('Edición del {fecha}', {fecha: hoy})}</small><strong>{t('Noticias de la empresa')}</strong></div>
      {cabeza}{estado}
      {a && (
        <div className="si-po-rev-portada">
          <button type="button" className="si-po-rev-lider" onClick={() => onLeer(a)}>
            {imagenDe(a) && <img src={imagenDe(a)} alt="" />}
            <span className="si-po-meta"><span className="si-po-seccion">{nombreSeccion(w, a.seccion)}</span><span>{cuando(a)}</span></span>
            <strong>{a.titulo}</strong>
            {valorDe(a.campos.Entradilla) && <span className="si-po-entradilla">{valorDe(a.campos.Entradilla)}</span>}
          </button>
          <div className="si-po-rev-sec">
            {[b, c].filter(Boolean).map((n) => (
              <button key={n.id} type="button" onClick={() => onLeer(n)}>
                {imagenDe(n) && <img src={imagenDe(n)} alt="" />}
                <span className="si-po-meta"><span className="si-po-seccion">{nombreSeccion(w, n.seccion)}</span></span>
                <strong>{n.titulo}</strong>
              </button>
            ))}
          </div>
        </div>
      )}
      <Rejilla lista={resto} w={w} onLeer={onLeer} clase="si-po-rev-resto" />
      {pie}
      <Lado r={r} errorR={errorR} eventos={eventos} onLeer={onLeer} clase="si-po-fila-lado" />
      <Accesos />
    </>
  );
}

function Mosaico({w, r, errorR, onLeer, filtradas, eventos, cabeza, estado, pie}) {
  const formas = ['grande', 'alta', '', '', 'ancha', '', 'alta', '', ''];
  return (
    <div className="si-po-rejilla">
      <div className="si-po-principal">
        {cabeza}{estado}
        <div className="si-po-mosaico">{filtradas.map((n, i) => <Tesela key={n.id} n={n} w={w} onLeer={onLeer} clase={`si-po-ts-${formas[i % formas.length] || 'normal'}`} />)}</div>
        {pie}
      </div>
      <Lado r={r} errorR={errorR} eventos={eventos} onLeer={onLeer} />
      <Accesos />
    </div>
  );
}

function Carrusel({w, r, errorR, onLeer, filtradas, eventos, cabeza, estado, pie}) {
  const diapos = filtradas.filter(imagenDe).slice(0, 5);
  const [i, setI] = useState(0);
  const [parado, setParado] = useState(false);
  useEffect(() => {
    if (parado || diapos.length < 2) return undefined;
    const x = setInterval(() => setI((k) => (k + 1) % diapos.length), 6000);
    return () => clearInterval(x);
  }, [parado, diapos.length]);
  const actual = diapos[i % Math.max(1, diapos.length)];
  const resto = filtradas.filter((n) => !diapos.includes(n));
  return (
    <>
      {cabeza}{estado}
      {actual && (
        <div className="si-po-carrusel" onMouseEnter={() => setParado(true)} onMouseLeave={() => setParado(false)}>
          <Tesela key={actual.id} n={actual} w={w} onLeer={onLeer} clase="si-po-diapo" />
          {diapos.length > 1 && <>
            <button type="button" className="si-po-flecha si-po-izq" aria-label={t('Anterior')} onClick={() => setI((i - 1 + diapos.length) % diapos.length)}><Icono n="izquierda" /></button>
            <button type="button" className="si-po-flecha si-po-der" aria-label={t('Siguiente')} onClick={() => setI((i + 1) % diapos.length)}><Icono n="derecha" /></button>
            <div className="si-po-puntos">{diapos.map((n, k) => <button key={n.id} type="button" aria-label={n.titulo} className={k === i % diapos.length ? 'activo' : ''} onClick={() => setI(k)} />)}</div>
          </>}
        </div>
      )}
      <Lado r={r} errorR={errorR} eventos={eventos} onLeer={onLeer} clase="si-po-fila-lado" />
      <Rejilla lista={resto.length ? resto : filtradas.slice(diapos.length)} w={w} onLeer={onLeer} />
      {pie}
      <Accesos />
    </>
  );
}

function Cronologia({w, r, errorR, onLeer, filtradas, eventos, cabeza, estado, pie}) {
  let mes = '';
  return (
    <div className="si-po-rejilla">
      <div className="si-po-principal">
        {cabeza}{estado}
        <ol className="si-po-crono">
          {filtradas.map((n, k) => {
            const m = n.fecha ? new Date(n.fecha).toLocaleDateString(locale(), {month: 'long', year: 'numeric'}) : '';
            const nuevoMes = m !== mes; mes = m;
            return (
              <React.Fragment key={n.id}>
                {nuevoMes && m && <li className="si-po-crono-mes"><span>{m}</span></li>}
                <li className={`si-po-crono-item ${k % 2 ? 'si-po-der' : 'si-po-izq'}`}>
                  <span className="si-po-crono-punto" />
                  <Tarjeta><TarjetaNoticia n={n} w={w} onLeer={onLeer} /></Tarjeta>
                </li>
              </React.Fragment>
            );
          })}
        </ol>
        {pie}
      </div>
      <Lado r={r} errorR={errorR} eventos={eventos} onLeer={onLeer} />
      <Accesos />
    </div>
  );
}

function Titulares({w, r, errorR, onLeer, filtradas, eventos, cabeza, estado, pie}) {
  const cinta = filtradas.slice(0, 6);
  return (
    <>
      {cinta.length > 0 && (
        <div className="si-po-cinta" aria-label={t('Última hora')}>
          <strong>{t('Última hora')}</strong>
          <div><span className="si-po-cinta-mov">{[...cinta, ...cinta].map((n, k) => <button key={`${n.id}-${k}`} type="button" onClick={() => onLeer(n)}>{n.titulo}</button>)}</span></div>
        </div>
      )}
      <div className="si-po-rejilla">
        <div className="si-po-principal">
          {cabeza}{estado}
          <ol className="si-po-titulares">
            {filtradas.map((n, k) => (
              <li key={n.id}><button type="button" onClick={() => onLeer(n)}>
                <span className="si-po-num">{String(k + 1).padStart(2, '0')}</span>
                <span className="si-crece"><strong>{n.titulo}</strong>
                  <small>{[nombreSeccion(w, n.seccion), cuando(n), valorDe(n.campos.Entradilla)].filter(Boolean).join(' · ')}</small></span>
                {imagenDe(n) && <img src={imagenDe(n)} alt="" />}
              </button></li>
            ))}
          </ol>
          {pie}
        </div>
        <Lado r={r} errorR={errorR} eventos={eventos} onLeer={onLeer} />
        <Accesos />
      </div>
    </>
  );
}

function Tablero({w, r, errorR, onLeer, filtradas, eventos, cabeza, estado, pie}) {
  const com = r && r.comunicacion;
  const kpis = [
    {n: com ? com.comunicadosPorConfirmar : '–', t: 'Comunicados por confirmar', i: 'megafono', href: `${urlApp('comunicacion')}#comunicados`, tono: com && com.comunicadosPorConfirmar ? 'ambar' : ''},
    {n: com ? com.comunicadosPorLeer : '–', t: 'Comunicados sin leer', i: 'campana', href: `${urlApp('comunicacion')}#comunicados`},
    {n: eventos.length, t: 'Próximos eventos', i: 'evento'},
    {n: com ? com.encuestasPendientes : '–', t: 'Encuestas por responder', i: 'grafico', href: urlApp('encuestas'), tono: com && com.encuestasPendientes ? 'azul' : ''},
    {n: r ? r.celebraciones.length : '–', t: 'Celebraciones', i: 'tarta', href: urlApp('personas')},
  ];
  return (
    <>
      <div className="si-po-kpis">
        {kpis.map((k) => {
          const dentro = <><span className="si-po-kpi-i"><Icono n={k.i} /></span><strong>{k.n}</strong><small>{t(k.t)}</small></>;
          return k.href ? <a key={k.t} href={k.href} className={`si-po-kpi ${k.tono ? `si-po-kpi-${k.tono}` : ''}`}>{dentro}</a> : <div key={k.t} className="si-po-kpi">{dentro}</div>;
        })}
      </div>
      <div className="si-po-tablero">
        <div className="si-po-principal">
          {cabeza}{estado}
          <Rejilla lista={filtradas} w={w} onLeer={onLeer} clase="si-po-lista-2" />
          {pie}
        </div>
        <Lado r={r} errorR={errorR} eventos={eventos} onLeer={onLeer} />
      </div>
      <Accesos />
    </>
  );
}

function Muro({w, r, errorR, onLeer, filtradas, eventos, cabeza, estado, pie}) {
  const piezas = filtradas.map((n) => <Tarjeta key={n.id}><TarjetaNoticia n={n} w={w} onLeer={onLeer} /></Tarjeta>);
  const avisos = [r && <Comunicados key="com" r={r} />, <AvisoEncuesta key="enc" r={r} />, <Agenda key="ag" r={r} eventos={eventos} onLeer={onLeer} />, <PersonasWidget key="pe" r={r} />].filter(Boolean);
  avisos.forEach((a, k) => piezas.splice(Math.min(piezas.length, 1 + k * 3), 0, a));
  return (
    <>
      {cabeza}{estado}
      {errorR && <Fallo>{errorR}</Fallo>}
      <div className="si-po-muro">{piezas.map((x, k) => <div key={k} className="si-po-ladrillo">{x}</div>)}</div>
      {pie}
      <Accesos />
    </>
  );
}

function Nocturna({w, r, errorR, onLeer, filtradas, eventos, cabeza, estado, pie}) {
  const [a, ...resto] = filtradas;
  return (
    <div className="si-po-noche">
      {a && (
        <div className="si-po-noche-hero" style={fondo(imagenDe(a))}>
          <div className="si-po-noche-velo" />
          <div className="si-po-noche-txt">
            <span className="si-po-meta"><span className="si-po-seccion">{nombreSeccion(w, a.seccion)}</span><span>{cuando(a)}</span></span>
            <h2>{a.titulo}</h2>
            {valorDe(a.campos.Entradilla) && <p>{valorDe(a.campos.Entradilla)}</p>}
            <Boton tipo="primario" onClick={() => onLeer(a)}>{t('Leer la noticia')}</Boton>
          </div>
        </div>
      )}
      <div className="si-po-rejilla">
        <div className="si-po-principal">
          {cabeza}{estado}
          <div className="si-po-noche-lista">{resto.map((n) => <Tesela key={n.id} n={n} w={w} onLeer={onLeer} />)}</div>
          {pie}
        </div>
        <Lado r={r} errorR={errorR} eventos={eventos} onLeer={onLeer} />
        <Accesos />
      </div>
    </div>
  );
}

function Foco({w, r, errorR, onLeer, filtradas, eventos, cabeza, estado, pie}) {
  const com = r && r.comunicacion;
  return (
    <div className="si-po-foco">
      <div className="si-po-foco-avisos">
        {com && com.comunicadosPorConfirmar > 0 && <a href={`${urlApp('comunicacion')}#comunicados`}><Icono n="megafono" /> {t('{n} comunicados por confirmar', {n: com.comunicadosPorConfirmar})}</a>}
        {com && com.encuestasPendientes > 0 && <a href={urlApp('encuestas')}><Icono n="grafico" /> {t('Una encuesta por responder')}</a>}
        {eventos[0] && <button type="button" onClick={() => onLeer(eventos[0])}><Icono n="evento" /> {eventos[0].titulo} · {fechaHora(valorDe(eventos[0].campos.Fecha))}</button>}
        {errorR && <Fallo>{errorR}</Fallo>}
      </div>
      {cabeza}{estado}
      {filtradas.map((n) => (
        <article key={n.id} className="si-po-foco-item">
          <button type="button" onClick={() => onLeer(n)}>
            {imagenDe(n) && <img src={imagenDe(n)} alt="" loading="lazy" />}
            <span className="si-po-meta"><span className="si-po-seccion">{nombreSeccion(w, n.seccion)}</span><span>{cuando(n)}</span></span>
            <strong>{n.titulo}</strong>
            {valorDe(n.campos.Entradilla) && <span className="si-po-entradilla">{valorDe(n.campos.Entradilla)}</span>}
            <span className="si-po-seguir">{t('Seguir leyendo')} →</span>
          </button>
        </article>
      ))}
      {pie}
      <Accesos />
    </div>
  );
}

const DISENOS_PORTADA = {clasica: Clasica, revista: Revista, mosaico: Mosaico, carrusel: Carrusel, cronologia: Cronologia, titulares: Titulares,
  tablero: Tablero, muro: Muro, nocturna: Nocturna, foco: Foco};

/** Miniatura de un diseño de portada. */
function MiniPortada({id}) {
  const b = (c, k) => <i key={k} className={c} />;
  const bloques = {
    clasica: [b('mp-h1 mp-ancha'), b('mp-c'), b('mp-c'), b('mp-lado')],
    revista: [b('mp-mast'), b('mp-lider'), b('mp-sec'), b('mp-sec'), b('mp-c3'), b('mp-c3'), b('mp-c3')],
    mosaico: [b('mp-g2'), b('mp-t'), b('mp-t'), b('mp-w2'), b('mp-t')],
    carrusel: [b('mp-hero'), b('mp-dots'), b('mp-c3'), b('mp-c3'), b('mp-c3')],
    cronologia: [b('mp-linea'), b('mp-izq'), b('mp-der'), b('mp-izq')],
    titulares: [b('mp-cinta'), b('mp-fila'), b('mp-fila'), b('mp-fila'), b('mp-fila')],
    tablero: [b('mp-k'), b('mp-k'), b('mp-k'), b('mp-k'), b('mp-c'), b('mp-c')],
    muro: [b('mp-m1'), b('mp-m2'), b('mp-m3'), b('mp-m2'), b('mp-m1'), b('mp-m3')],
    nocturna: [b('mp-noche'), b('mp-c3 mp-osc'), b('mp-c3 mp-osc'), b('mp-c3 mp-osc')],
    foco: [b('mp-foco'), b('mp-foco-t'), b('mp-foco'), b('mp-foco-t')],
  };
  return <span className={`si-po-mp si-po-mp-${id}`} aria-hidden="true">{bloques[id]}</span>;
}

/** Elegir el diseño de la portada: para mí o, RRHH, para toda la empresa. Se ve al momento en la página. */
function ElegirPortada({r, actual, onProbar, onCerrar, onGuardado}) {
  const {api, avisar} = useSuite();
  const [ambito, setAmbito] = useState('mio');
  const [ocupado, setOcupado] = useState(false);
  const guardar = async (diseno) => {
    setOcupado(true);
    try { const x = await api('portada.diseno', {diseno, ambito}); avisar(x.mensaje); onGuardado(x.diseno); } catch (e) { avisar(e.message, 'rojo'); setOcupado(false); }
  };
  const empresa = (r && r.diseno && r.diseno.empresa) || 'clasica';
  const mio = r && r.diseno && r.diseno.mio;
  return (
    <Modal titulo={t('Diseño de la portada')} onCerrar={onCerrar} ancho pie={<>
      {mio && ambito === 'mio' && <Boton disabled={ocupado} onClick={() => guardar('')}>{t('Volver al de la empresa')}</Boton>}
      <span className="si-crece" />
      <Boton onClick={onCerrar}>{t('Cancelar')}</Boton>
      <Boton tipo="primario" disabled={ocupado} onClick={() => guardar(actual)}>{ambito === 'empresa' ? t('Guardar para toda la empresa') : t('Guardar para mí')}</Boton>
    </>}>
      <p className="si-tenue">{t('Elige cómo quieres ver la portada: se aplica al momento detrás de esta ventana. El de la empresa ahora es «{d}».', {d: t((PORTADAS.find((x) => x.id === empresa) || PORTADAS[0]).nombre)})}</p>
      {r && r.rrhh && (
        <div className="si-po-ambito" role="radiogroup">
          <label><input type="radio" checked={ambito === 'mio'} onChange={() => setAmbito('mio')} /> {t('Solo para mí')}</label>
          <label><input type="radio" checked={ambito === 'empresa'} onChange={() => setAmbito('empresa')} /> {t('Para toda la empresa (quien no haya elegido otro)')}</label>
        </div>
      )}
      <div className="si-po-portadas" role="radiogroup" aria-label={t('Diseño de la portada')}>
        {PORTADAS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={actual === x.id} className={`si-po-diseno${actual === x.id ? ' activo' : ''}`} onClick={() => onProbar(x.id)}>
            <MiniPortada id={x.id} /><strong>{t(x.nombre)}</strong><small>{t(x.descripcion)}</small>
          </button>
        ))}
      </div>
    </Modal>
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

function FaltaCorto({iso}) {
  const f = useFalta(iso);
  return f ? <span className="si-po-falta"><b>{f.dias}</b> {t(f.dias === 1 ? 'día' : 'días')} <b>{f.horas}</b> h <b>{f.minutos}</b> min</span> : null;
}

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
        {d === 'cuenta' && evento && <FaltaCorto iso={evento} />}
        {entradilla && <span className="si-po-entradilla">{entradilla}</span>}
      </span>
    </button>
  );
}

/** Lo que falta para una fecha (se actualiza cada 30 s); null si ya ha pasado. */
function useFalta(iso) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { if (!iso) return undefined; const i = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(i); }, [iso]);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - ahora;
  if (!(ms > 0)) return null;
  return {dias: Math.floor(ms / 864e5), horas: Math.floor(ms / 36e5) % 24, minutos: Math.floor(ms / 6e4) % 60};
}

function CuentaAtras({iso}) {
  const f = useFalta(iso);
  if (!f) return <p className="si-po-cuenta-ya">{iso ? t('¡Ya ha empezado!') : t('Pon la fecha del evento para ver la cuenta atrás.')}</p>;
  return (
    <div className="si-po-cuenta" role="timer" aria-label={t('Faltan {d} días, {h} horas y {m} minutos', {d: f.dias, h: f.horas, m: f.minutos})}>
      {[[f.dias, 'días'], [f.horas, 'horas'], [f.minutos, 'minutos']].map(([n, u]) => (
        <span key={u}><strong>{String(n).padStart(2, '0')}</strong><small>{t(u)}</small></span>
      ))}
    </div>
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
    case 'revista':
      dentro = <>
        <div className="si-po-rev-cab">{meta}<h1>{titulo}</h1>{entradilla}</div>
        {foto}{lista}
        {cuerpo && <div className="si-po-cuerpo si-po-rev-cuerpo" dangerouslySetInnerHTML={{__html: cuerpo}} />}
        {enlace && wcm.enlaceSeguro(enlace) && <p><a className="si-boton si-boton-secundario" href={enlace} target="_blank" rel="noopener noreferrer">{t('Abrir el enlace')}</a></p>}
      </>;
      break;
    case 'cine':
      dentro = <div className="si-po-cine">
        {img && <div className="si-po-cine-img" style={{backgroundImage: `url("${img.replace(/"/g, '%22')}")`}} />}
        <div className="si-po-cine-txt">{cabeza}{entradilla}{lista}{resto}</div>
      </div>;
      break;
    case 'titular':
      dentro = <>
        <div className="si-po-gigante">{meta}<h1>{titulo}</h1></div>
        {entradilla}
        {img && <div className="si-po-desplazada"><img src={img} alt="" /></div>}
        {lista}{resto}
      </>;
      break;
    case 'diagonal':
      dentro = <>
        <div className="si-po-diag">
          {img ? <img src={img} alt="" /> : <span className="si-po-diag-sin" />}
          <div className="si-po-diag-banda"><div>{cabeza}</div></div>
        </div>
        {entradilla}{lista}{resto}
      </>;
      break;
    case 'cuenta':
      dentro = <>
        <div className="si-po-cuenta-cab">{cabeza}<CuentaAtras iso={v('Fecha')} />{lista}</div>
        {entradilla}{foto}{resto}
      </>;
      break;
    case 'celebracion':
      dentro = <div className="si-po-fiesta">
        <span className="si-po-fiesta-icono"><Icono n={v('Equipo') ? 'trofeo' : v('Puesto') ? 'entrar' : 'estrella'} /></span>
        {cabeza}{entradilla}
        {img && <img className="si-po-fiesta-img" src={img} alt="" />}
        {lista}{resto}
      </div>;
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
      {id === 'revista' && <><i className="si-po-m-serif" /><i className="si-po-m-lin si-po-m-corta" />{I}<span className="si-po-m-2col"><span>{X}</span><span>{X}</span></span></>}
      {id === 'cine' && <span className="si-po-m-cine"><i className="si-po-m-img" /><i className="si-po-m-grad" /><i className="si-po-m-lin si-po-m-clara" /></span>}
      {id === 'titular' && <><i className="si-po-m-gig" /><i className="si-po-m-gig si-po-m-corta" /><i className="si-po-m-barra" /><i className="si-po-m-img si-po-m-off" /></>}
      {id === 'diagonal' && <span className="si-po-m-diag"><i className="si-po-m-img" /><i className="si-po-m-banda" /></span>}
      {id === 'cuenta' && <span className="si-po-m-cuenta">{T}<span className="si-po-m-nums"><i /><i /><i /></span></span>}
      {id === 'celebracion' && <span className="si-po-m-fiesta"><i className="si-po-m-circ" />{T}<i className="si-po-m-lin si-po-m-corta" /></span>}
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
