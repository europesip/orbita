// Encuestas: encuestas de clima anónimas. La plantilla responde de forma guiada (secciones, progreso, borrador en el
// navegador); RRHH las prepara (plantillas, ocho tipos de pregunta, dimensiones, borrador, vista previa, apertura
// programada) y ve el informe (participación, favorabilidad, dimensiones, mapa de calor, eNPS, tendencia, comentarios
// y exportación); RRHH y los responsables publican el plan de acción, que ve quien recibió la encuesta.
import React, {useEffect, useMemo, useState} from 'react';
import {
  Avatar, Boton, Campo, Cargando, Fallo, Insignia, Modal, Pestanas, Tarjeta, Vacio, descargar, fecha, iso, plural, useDatos, useSuite,
} from './ui.jsx';
import {Icono} from './iconos.jsx';
import {locale, t} from './i18n.js';

// ------------------------------------------------------------------------------------------- Catálogos

export const DIMENSIONES = {
  COMPROMISO: {nombre: 'Compromiso', icono: 'estrella'},
  LIDERAZGO: {nombre: 'Liderazgo', icono: 'persona'},
  CARGA: {nombre: 'Carga de trabajo', icono: 'reloj'},
  BIENESTAR: {nombre: 'Bienestar', icono: 'salud'},
  RECONOCIMIENTO: {nombre: 'Reconocimiento', icono: 'trofeo'},
  DESARROLLO: {nombre: 'Desarrollo', icono: 'bombilla'},
  COMUNICACION: {nombre: 'Comunicación', icono: 'megafono'},
  RECURSOS: {nombre: 'Medios y herramientas', icono: 'ajustes'},
  EQUIPO: {nombre: 'Equipo', icono: 'personas'},
  FLEXIBILIDAD: {nombre: 'Flexibilidad', icono: 'calendario'},
};
const TIPOS = {
  ACUERDO: {nombre: 'Escala de acuerdo', icono: 'check'},
  ESCALA: {nombre: 'Escala de 1 a 5', icono: 'grafico'},
  ENPS: {nombre: 'eNPS (0 a 10)', icono: 'estrella'},
  SINO: {nombre: 'Sí o no', icono: 'checkCirculo'},
  UNICA: {nombre: 'Opción única', icono: 'lista'},
  MULTIPLE: {nombre: 'Opción múltiple', icono: 'lista'},
  MATRIZ: {nombre: 'Matriz de afirmaciones', icono: 'tarjeta'},
  TEXTO: {nombre: 'Texto libre', icono: 'chat'},
};
const ACUERDO = ['Totalmente en desacuerdo', 'En desacuerdo', 'Ni de acuerdo ni en desacuerdo', 'De acuerdo', 'Totalmente de acuerdo'];
const ESTADOS = {
  BORRADOR: {nombre: 'Borrador', tono: 'gris'}, PROGRAMADA: {nombre: 'Programada', tono: 'violeta'},
  ABIERTA: {nombre: 'Abierta', tono: 'azul'}, CERRADA: {nombre: 'Cerrada', tono: 'gris'},
};
const ESTADOS_ACCION = {PENDIENTE: {nombre: 'Pendiente', tono: 'gris'}, EN_CURSO: {nombre: 'En curso', tono: 'azul'}, HECHA: {nombre: 'Hecha', tono: 'verde'}};
const ROLES = {EMPLEADO: 'Empleados', RESPONSABLE: 'Responsables', RRHH: 'RRHH', ADMINISTRACION: 'Administración'};
const COLOR = {fav: '#1e7d32', neu: '#c6c6c6', des: '#d32f2f'};
const PESTANAS = ['mias', 'resultados', 'gestionar', 'plan'];
const OPCIONALES = ['TEXTO'];

const dim = (d) => DIMENSIONES[d] || null;
const ambitoTexto = (a) => (!a || a === 'TODOS' ? t('Toda la plantilla') : a.startsWith('DEPARTAMENTO:') ? a.slice(13) : t(ROLES[a.slice(4)] || a.slice(4)));
const dia = (s) => (s ? fecha(s.slice(0, 10), {day: 'numeric', month: 'long'}) : '');
const pctTxt = (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString(locale(), {maximumFractionDigits: 0})} %`);
const minutos = (n) => Math.max(1, Math.round(n * 0.3));
const conSigno = (v) => (v > 0 ? `+${v}` : `${v}`);

/** Color de fondo de una celda del mapa de calor según la favorabilidad. */
function calor(v) {
  if (v === null || v === undefined) return '#f4f4f4';
  if (v >= 75) return '#c8e6c9';
  if (v >= 60) return '#e3f1d9';
  if (v >= 45) return '#fff4e5';
  if (v >= 30) return '#ffe0cc';
  return '#fdd';
}

// ------------------------------------------------------------------------------------------- Plantillas

const q = (tipo, texto, dimension, seccion, extra = {}) => ({tipo, texto, dimension, seccion, obligatoria: !OPCIONALES.includes(tipo), opciones: [], ...extra});
export const PLANTILLAS = [
  {id: 'PULSO', titulo: 'Pulso mensual', icono: 'grafico', serie: 'PULSO', duracion: 'Un minuto',
    descripcion: 'Seis preguntas, un minuto. Es anónima: nadie, tampoco RRHH, ve qué ha respondido cada persona.',
    resumen: 'Seis preguntas rápidas cada mes para seguir la carga de trabajo, el liderazgo y el compromiso.',
    preguntas: () => [
      q('ACUERDO', 'Este mes mi carga de trabajo ha sido razonable.', 'CARGA'),
      q('ACUERDO', 'Mi responsable me escucha y me apoya.', 'LIDERAZGO'),
      q('ACUERDO', 'Tengo lo que necesito para hacer bien mi trabajo.', 'RECURSOS'),
      q('SINO', '¿Has podido desconectar del trabajo el último fin de semana?', 'BIENESTAR'),
      q('ENPS', 'Del 0 al 10, ¿recomendarías la empresa a un amigo para trabajar?', 'COMPROMISO'),
      q('TEXTO', '¿Algo que quieras contarnos? (opcional)', null),
    ]},
  {id: 'CLIMA', titulo: 'Clima laboral anual', icono: 'estrella', serie: 'CLIMA', duracion: 'Unos 5 minutos',
    descripcion: 'Tu opinión sobre la empresa, una vez al año. Unos 5 minutos y totalmente anónima.',
    resumen: 'La encuesta completa: diez dimensiones en cuatro secciones, eNPS, prioridades de mejora y comentarios.',
    preguntas: () => [
      q('ACUERDO', 'Mi carga de trabajo es razonable la mayoría de las semanas.', 'CARGA', 'Tu trabajo'),
      q('ACUERDO', 'Tengo los medios y las herramientas que necesito para hacer bien mi trabajo.', 'RECURSOS', 'Tu trabajo'),
      q('ACUERDO', 'Puedo compaginar mi trabajo con mi vida personal.', 'FLEXIBILIDAD', 'Tu trabajo'),
      q('MATRIZ', 'Sobre tu responsable directo:', 'LIDERAZGO', 'Tu equipo y tu responsable',
        {opciones: ['Me da feedback útil sobre mi trabajo.', 'Me escucha cuando planteo un problema.', 'Reconoce el trabajo bien hecho.']}),
      q('ACUERDO', 'En mi equipo nos ayudamos cuando alguien lo necesita.', 'EQUIPO', 'Tu equipo y tu responsable'),
      q('ACUERDO', 'Siento que mi trabajo se valora en la empresa.', 'RECONOCIMIENTO', 'Tu equipo y tu responsable'),
      q('ACUERDO', 'Veo oportunidades para aprender y crecer aquí.', 'DESARROLLO', 'Tu futuro en la empresa'),
      q('ACUERDO', 'Sé cuáles son los objetivos de la empresa y cómo contribuyo a ellos.', 'COMUNICACION', 'Tu futuro en la empresa'),
      q('ACUERDO', 'Me veo trabajando aquí dentro de dos años.', 'COMPROMISO', 'Tu futuro en la empresa'),
      q('ENPS', 'Del 0 al 10, ¿recomendarías la empresa a un amigo para trabajar?', 'COMPROMISO', 'Tu futuro en la empresa'),
      q('MULTIPLE', '¿Qué mejorarías primero? (elige hasta tres)', null, 'Para terminar',
        {opciones: ['Salario y beneficios', 'Formación', 'Flexibilidad horaria', 'Herramientas de trabajo', 'Comunicación interna', 'Carga de trabajo', 'Reconocimiento']}),
      q('UNICA', '¿Cómo describirías tu nivel de estrés en el último mes?', 'BIENESTAR', 'Para terminar', {opciones: ['Bajo', 'Moderado', 'Alto', 'Muy alto']}),
      q('TEXTO', '¿Qué es lo que más te gusta de trabajar aquí?', null, 'Para terminar'),
      q('TEXTO', 'Si pudieras cambiar una cosa, ¿cuál sería?', null, 'Para terminar'),
    ]},
  {id: 'BIENESTAR', titulo: 'Bienestar', icono: 'salud', serie: 'BIENESTAR', duracion: 'Dos minutos',
    descripcion: 'Unas preguntas sobre cómo estás. Es anónima.',
    resumen: 'Energía, desconexión y estrés, y qué ayudaría a cuidarse mejor.',
    preguntas: () => [
      q('ESCALA', '¿Cómo valorarías tu energía al final de la semana?', 'BIENESTAR'),
      q('SINO', '¿Has podido desconectar del trabajo el último fin de semana?', 'BIENESTAR'),
      q('ACUERDO', 'Puedo compaginar mi trabajo con mi vida personal.', 'FLEXIBILIDAD'),
      q('UNICA', '¿Cómo describirías tu nivel de estrés en el último mes?', 'BIENESTAR', null, {opciones: ['Bajo', 'Moderado', 'Alto', 'Muy alto']}),
      q('MULTIPLE', '¿Qué te ayudaría a cuidarte mejor?', 'BIENESTAR', null,
        {obligatoria: false, opciones: ['Pausas activas', 'Más flexibilidad horaria', 'Actividades de equipo', 'Charlas de salud', 'Menos reuniones']}),
    ]},
  {id: 'TELETRABAJO', titulo: 'Teletrabajo y flexibilidad', icono: 'inicio', serie: 'TELETRABAJO', duracion: 'Dos minutos',
    descripcion: 'Queremos saber cómo te está funcionando la política de teletrabajo.',
    resumen: 'Organización, medios en casa y cuántos días de teletrabajo prefiere la plantilla.',
    preguntas: () => [
      q('ACUERDO', 'La política de teletrabajo me permite organizarme mejor.', 'FLEXIBILIDAD'),
      q('ACUERDO', 'Cuando teletrabajo tengo los medios que necesito.', 'RECURSOS'),
      q('ACUERDO', 'Me siento igual de conectado con mi equipo cuando teletrabajo.', 'EQUIPO'),
      q('UNICA', '¿Cuántos días a la semana te gustaría teletrabajar?', 'FLEXIBILIDAD', null, {opciones: ['Ninguno', '1', '2', '3 o más']}),
      q('TEXTO', '¿Qué cambiarías de la política de teletrabajo?', null),
    ]},
  {id: 'INCORPORACION', titulo: 'Incorporación (primeros 30 días)', icono: 'entrar', serie: 'INCORPORACION', duracion: 'Dos minutos',
    descripcion: 'Cuéntanos cómo han sido tus primeras semanas. Es anónima.',
    resumen: 'Para las personas recién llegadas: claridad del puesto, medios y acogida del equipo.',
    preguntas: () => [
      q('ACUERDO', 'Sé lo que se espera de mí en mi puesto.', 'COMUNICACION'),
      q('ACUERDO', 'Tuve lo que necesitaba desde el primer día.', 'RECURSOS'),
      q('ACUERDO', 'Mi equipo me ha ayudado a integrarme.', 'EQUIPO'),
      q('ESCALA', '¿Cómo valorarías tu incorporación en general?', 'COMPROMISO'),
      q('TEXTO', '¿Qué mejorarías de tu incorporación?', null),
    ]},
  {id: 'BLANCO', titulo: 'En blanco', icono: 'mas', serie: '', duracion: '', descripcion: '', resumen: 'Empieza desde cero y añade tus preguntas.',
    preguntas: () => [q('ACUERDO', '', null)]},
];
/** Una plantilla con sus textos en el idioma de la interfaz. */
function desdePlantilla(p) {
  return {titulo: p.id === 'BLANCO' ? '' : t(p.titulo), descripcion: p.descripcion ? t(p.descripcion) : '', serie: p.serie, ambito: 'TODOS', minimo: 5, cierre: '',
    gracias: t('Gracias. En unas semanas compartiremos los resultados y lo que vamos a hacer con ellos.'),
    preguntas: p.preguntas().map((x) => ({...x, texto: x.texto ? t(x.texto) : '', seccion: x.seccion ? t(x.seccion) : null,
      opciones: (x.opciones || []).map((o) => t(o))}))};
}

const pestanaDelEnlace = () => {
  const h = (typeof window !== 'undefined' && window.location.hash || '').replace('#', '');
  return PESTANAS.includes(h) ? h : 'mias';
};

// =========================================================================================== Aplicación

export function Encuestas() {
  const [pest, setPest] = useState(pestanaDelEnlace);
  const [d, error, recargar] = useDatos('encuestas.lista', {}, []);
  const [informe, setInforme] = useState(null);
  useEffect(() => {
    const cambio = () => setPest(pestanaDelEnlace());
    window.addEventListener('hashchange', cambio);
    return () => window.removeEventListener('hashchange', cambio);
  }, []);
  const cambiar = (p) => { setPest(p); if (window.history.replaceState) window.history.replaceState(null, '', `#${p}`); };
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const pendientes = d.encuestas.filter((e) => e.paraMi && e.estado === 'ABIERTA' && !e.respondida).length;
  const verResultados = d.rrhh || d.responsable;
  const abrirInforme = (id) => { setInforme(id); cambiar('resultados'); };
  return (
    <>
      <Pestanas activa={pest} onCambiar={cambiar} pestanas={[
        {id: 'mias', nombre: t('Mis encuestas'), cuenta: pendientes},
        verResultados && {id: 'resultados', nombre: t('Resultados')},
        d.rrhh && {id: 'gestionar', nombre: t('Gestionar')},
        {id: 'plan', nombre: t('Plan de acción')},
      ]} />
      {pest === 'mias' && <MisEncuestas d={d} onCambio={recargar} onPlan={() => cambiar('plan')} onInforme={abrirInforme} />}
      {pest === 'resultados' && verResultados && <Resultados d={d} inicial={informe} onCambio={recargar} />}
      {pest === 'gestionar' && d.rrhh && <Gestionar d={d} onCambio={recargar} onInforme={abrirInforme} />}
      {pest === 'plan' && <Plan />}
    </>
  );
}

// =========================================================================================== Mis encuestas

function MisEncuestas({d, onCambio, onPlan, onInforme}) {
  const [respondiendo, setRespondiendo] = useState(null);
  const [acc] = useDatos('encuestas.acciones', {}, []);
  if (respondiendo) {
    return <Responder id={respondiendo} onSalir={() => setRespondiendo(null)} onEnviada={onCambio} />;
  }
  const mias = d.encuestas.filter((e) => e.paraMi);
  const pendientes = mias.filter((e) => e.estado === 'ABIERTA' && !e.respondida);
  const anteriores = mias.filter((e) => !pendientes.includes(e));
  const enMarcha = acc ? acc.acciones.filter((a) => a.estado !== 'HECHA') : [];
  const hechas = acc ? acc.acciones.filter((a) => a.estado === 'HECHA').length : 0;
  return (
    <>
      <div className="si-mensaje-barra si-mb-info"><Icono n="candado" /><span>{t('Las encuestas son anónimas: guardamos que has respondido, pero no qué has respondido. Los resultados solo se ven cuando responde un mínimo de personas.')}</span></div>
      {pendientes.length ? (
        <div className="si-en-pendientes">
          {pendientes.map((e) => (
            <article key={e.id} className="si-en-pendiente">
              <span className="si-eyebrow"><Icono n="candado" /> {t('Encuesta anónima')}</span>
              <h3>{e.titulo}</h3>
              {e.descripcion && <p>{e.descripcion}</p>}
              <p className="si-en-meta">
                <span><Icono n="lista" /> {plural(e.preguntas, 'pregunta', 'preguntas')}</span>
                <span><Icono n="reloj" /> {t('Unos {n} min', {n: minutos(e.preguntas)})}</span>
                {e.cierre && <span><Icono n="calendario" /> {t('Hasta el {fecha}', {fecha: dia(e.cierre)})}</span>}
              </p>
              <Boton tipo="primario" icono="derecha" onClick={() => setRespondiendo(e.id)}>{t('Responder')}</Boton>
            </article>
          ))}
        </div>
      ) : (
        <Tarjeta><Vacio icono="checkCirculo">{t('Estás al día: no tienes encuestas por responder.')}</Vacio></Tarjeta>
      )}
      <div className="si-en-dos">
        <Tarjeta titulo={t('Lo que estamos haciendo')} accion={<button type="button" className="si-enlace" onClick={onPlan}>{t('Plan de acción')} <Icono n="derecha" /></button>}>
          {!acc ? <Cargando /> : !enMarcha.length ? <Vacio icono="lista">{t('Aún no hay acciones en marcha.')}</Vacio> : (
            <ul className="si-lista si-mini-lista">
              {enMarcha.slice(0, 4).map((a) => (
                <li key={a.id}>
                  <span className="si-en-acc-icono"><Icono n={dim(a.dimension) ? dim(a.dimension).icono : 'lista'} /></span>
                  <span><strong>{a.titulo}</strong><small>{t(ESTADOS_ACCION[a.estado].nombre)}{a.limite ? ` · ${t('antes del {fecha}', {fecha: dia(a.limite)})}` : ''} · {a.encuestaTitulo}</small></span>
                </li>
              ))}
            </ul>
          )}
          {hechas > 0 && <p className="si-tenue si-en-hechas"><Icono n="checkCirculo" /> {plural(hechas, 'acción ya hecha', 'acciones ya hechas')}</p>}
        </Tarjeta>
        <Tarjeta titulo={t('Encuestas anteriores')}>
          {!anteriores.length ? <Vacio icono="grafico">{t('Aún no hay encuestas anteriores.')}</Vacio> : (
            <ul className="si-lista si-mini-lista">
              {anteriores.map((e) => (
                <li key={e.id}>
                  <span><strong>{e.titulo}</strong><small>{t(ESTADOS[e.estado].nombre)} · {t('participó el {n} %', {n: e.destinatarios ? Math.round((100 * e.participantes) / e.destinatarios) : 0})}</small></span>
                  {e.respondida && <Insignia tono="verde"><Icono n="check" /> {t('Respondida')}</Insignia>}
                  {e.informe && <Boton icono="grafico" onClick={() => onInforme(e.id)}>{t('Informe')}</Boton>}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </>
  );
}

// =========================================================================================== Responder

/** Las páginas: una por sección (o de cinco en cinco si no hay secciones). */
function paginas(lista) {
  const p = [];
  for (const x of lista) {
    const ult = p[p.length - 1];
    const nueva = !ult || (x.seccion ? x.seccion !== ult.seccion : (!ult.seccion && ult.preguntas.length >= 5) || !!ult.seccion);
    if (nueva) p.push({seccion: x.seccion || null, preguntas: [x]}); else ult.preguntas.push(x);
  }
  return p;
}

const respondida = (x, v) => {
  if (v === undefined || v === null || v === '') return false;
  if (x.tipo === 'MULTIPLE') return v.length > 0;
  if (x.tipo === 'MATRIZ') return Object.keys(v).length >= x.opciones.length;
  if (x.tipo === 'TEXTO') return String(v).trim().length > 0;
  return true;
};

function leerBorrador(clave) {
  try { return JSON.parse(window.localStorage.getItem(clave) || '{}'); } catch (e) { return {}; }
}
function guardarBorrador(clave, r) {
  try { window.localStorage.setItem(clave, JSON.stringify(r)); } catch (e) { /* sin almacenamiento */ }
}
function borrarBorrador(clave) {
  try { window.localStorage.removeItem(clave); } catch (e) { /* */ }
}

export function Responder({id, vistaPrevia, onSalir, onEnviada}) {
  const {api, avisar} = useSuite();
  const [e, error] = useDatos('encuestas.detalle', {id}, [id]);
  const clave = `orbita.encuesta.${id}`;
  const [r, setR] = useState(() => (vistaPrevia ? {} : leerBorrador(clave)));
  const [pag, setPag] = useState(0);
  const [marcar, setMarcar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fin, setFin] = useState(false);
  const ps = useMemo(() => (e ? paginas(e.lista) : []), [e]);
  const fijar = (qid, v) => { const n = {...r, [qid]: v}; setR(n); if (!vistaPrevia) guardarBorrador(clave, n); };
  useEffect(() => { if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({top: 0}); }, [pag]);
  if (error) return <Fallo>{error}</Fallo>;
  if (!e) return <Cargando />;
  if (fin) {
    return (
      <section className="si-en-fin">
        <span className="si-en-fin-icono"><Icono n="checkCirculo" /></span>
        <h2>{t('¡Gracias!')}</h2>
        <p>{e.gracias || t('Tus respuestas se han guardado de forma anónima.')}</p>
        <ul>
          <li><Icono n="candado" /> {t('Nadie, tampoco RRHH, puede ver qué has respondido tú.')}</li>
          <li><Icono n="grafico" /> {t('Los resultados se verán cuando respondan al menos {n} personas.', {n: e.minimo})}</li>
          <li><Icono n="lista" /> {t('Con ellos prepararemos un plan de acción que verás en esta aplicación.')}</li>
        </ul>
        <Boton tipo="primario" onClick={onSalir}>{t('Volver a mis encuestas')}</Boton>
      </section>
    );
  }
  const total = e.lista.length;
  const hechas = e.lista.filter((x) => respondida(x, r[x.id])).length;
  const actual = ps[pag] || {preguntas: []};
  const faltan = actual.preguntas.filter((x) => x.obligatoria && !respondida(x, r[x.id]));
  const ultima = pag === ps.length - 1;
  const siguiente = () => {
    if (faltan.length && !vistaPrevia) { setMarcar(true); avisar(t('Responde a las preguntas marcadas con *.'), 'rojo'); return; }
    setMarcar(false);
    setPag(pag + 1);
  };
  const enviar = async () => {
    if (vistaPrevia) { onSalir(); return; }
    if (faltan.length) { setMarcar(true); return; }
    setEnviando(true);
    try {
      await api('encuestas.responder', {id, respuestas: JSON.stringify(r)});
      borrarBorrador(clave);
      setFin(true);
      onEnviada && onEnviada();
    } catch (err) { avisar(err.message, 'rojo'); setEnviando(false); }
  };
  let numero = 0;
  for (let i = 0; i < pag; i++) numero += ps[i].preguntas.length;
  return (
    <section className="si-formulario si-en-responder">
      {vistaPrevia && <div className="si-mensaje-barra si-mb-aviso"><Icono n="ojo" /><span>{t('Vista previa: así la verá la plantilla. Las respuestas no se guardan.')}</span></div>}
      <header className="si-formulario-cab">
        <span className="si-eyebrow"><Icono n="candado" /> {t('Encuesta anónima')}</span>
        <h3>{e.titulo}</h3>
        {pag === 0 && e.descripcion && <p>{e.descripcion}</p>}
        <div className="si-en-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechas}>
          <div><i style={{width: `${(100 * hechas) / Math.max(1, total)}%`}} /></div>
          <small>{ps.length > 1 ? `${t('Paso {n} de {total}', {n: pag + 1, total: ps.length})} · ` : ''}{t('{n} de {total} respondidas', {n: hechas, total})}</small>
        </div>
      </header>
      {actual.seccion && <h4 className="si-en-seccion">{actual.seccion}</h4>}
      <ol className="si-en-preguntas" start={numero + 1}>
        {actual.preguntas.map((x) => (
          <li key={x.id} className={marcar && x.obligatoria && !respondida(x, r[x.id]) ? 'si-en-falta' : ''}>
            <p className="si-en-enunciado">{x.texto}{x.obligatoria && <span className="si-obligatorio" aria-label={t('obligatoria')}>*</span>}</p>
            <Control x={x} v={r[x.id]} onCambiar={(v) => fijar(x.id, v)} />
          </li>
        ))}
      </ol>
      <footer className="si-formulario-pie si-en-pie">
        {pag > 0 ? <Boton icono="izquierda" onClick={() => setPag(pag - 1)}>{t('Anterior')}</Boton> : <Boton onClick={onSalir}>{vistaPrevia ? t('Cerrar vista previa') : t('Salir')}</Boton>}
        <span className="si-tenue si-crece">{!vistaPrevia && t('Tus respuestas se guardan en este navegador hasta que las envíes.')}</span>
        {ultima
          ? <Boton tipo="primario" icono="candado" disabled={enviando} onClick={enviar}>{vistaPrevia ? t('Terminar la vista previa') : t('Enviar de forma anónima')}</Boton>
          : <Boton tipo="primario" icono="derecha" onClick={siguiente}>{t('Siguiente')}</Boton>}
      </footer>
    </section>
  );
}

function Control({x, v, onCambiar}) {
  switch (x.tipo) {
    case 'ACUERDO':
      return (
        <div className="si-en-acuerdo" role="radiogroup">
          {ACUERDO.map((txt, i) => (
            <button key={i} type="button" role="radio" aria-checked={v === i + 1} className={v === i + 1 ? 'activa' : ''} onClick={() => onCambiar(i + 1)}>
              <b>{i + 1}</b><span>{t(txt)}</span>
            </button>
          ))}
        </div>
      );
    case 'ESCALA': case 'ENPS': {
      const n = x.tipo === 'ENPS' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
      return (
        <div className={`si-escala${x.tipo === 'ENPS' ? ' si-escala-enps' : ''}`}>
          <div className="si-escala-botones" role="radiogroup">
            {n.map((k) => <button key={k} type="button" role="radio" aria-checked={v === k} className={v === k ? 'activa' : ''} onClick={() => onCambiar(k)}>{k}</button>)}
          </div>
          <div className="si-escala-extremos"><small>{t(x.tipo === 'ENPS' ? 'Nada probable' : 'Poco')}</small><small>{t(x.tipo === 'ENPS' ? 'Muy probable' : 'Mucho')}</small></div>
        </div>
      );
    }
    case 'SINO':
      return (
        <div className="si-en-sino" role="radiogroup">
          {[[true, 'Sí'], [false, 'No']].map(([k, txt]) => (
            <button key={txt} type="button" role="radio" aria-checked={v === k} className={v === k ? 'activa' : ''} onClick={() => onCambiar(k)}>{t(txt)}</button>
          ))}
        </div>
      );
    case 'UNICA': case 'MULTIPLE': {
      const multiple = x.tipo === 'MULTIPLE';
      const sel = multiple ? (v || []) : v;
      return (
        <div className="si-en-opciones" role={multiple ? 'group' : 'radiogroup'}>
          {x.opciones.map((o, i) => {
            const on = multiple ? sel.includes(i) : sel === i;
            return (
              <button key={i} type="button" role={multiple ? 'checkbox' : 'radio'} aria-checked={on} className={on ? 'activa' : ''}
                onClick={() => onCambiar(multiple ? (on ? sel.filter((k) => k !== i) : [...sel, i].sort((a, b) => a - b)) : i)}>
                <i className={multiple ? 'cuadrado' : 'circulo'}>{on && <Icono n="check" />}</i>{o}
              </button>
            );
          })}
        </div>
      );
    }
    case 'MATRIZ': {
      const m = v || {};
      return (
        <div className="si-en-matriz">
          <table>
            <thead><tr><th />{ACUERDO.map((txt, i) => <th key={i} title={t(txt)}><b>{i + 1}</b><small>{t(txt)}</small></th>)}</tr></thead>
            <tbody>
              {x.opciones.map((o, item) => (
                <tr key={item}>
                  <th scope="row">{o}</th>
                  {ACUERDO.map((txt, i) => (
                    <td key={i}>
                      <button type="button" aria-label={`${o}: ${t(txt)}`} aria-pressed={m[item] === i + 1} className={m[item] === i + 1 ? 'activa' : ''}
                        onClick={() => onCambiar({...m, [item]: i + 1})}>{i + 1}</button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return (
        <>
          <textarea className="si-input" rows={3} maxLength={1000} value={v || ''} placeholder={t('Escribe tu respuesta')} onChange={(ev) => onCambiar(ev.target.value)} />
          <small className="si-tenue">{t('No incluyas datos que permitan saber quién eres.')}</small>
        </>
      );
  }
}

// =========================================================================================== Resultados

function Resultados({d, inicial, onCambio}) {
  const con = d.encuestas.filter((e) => e.informe);
  const porDefecto = inicial || (con.find((e) => e.participantes > 0) || con[0] || {}).id;
  const [id, setId] = useState(porDefecto);
  if (!con.length) return <Tarjeta><Vacio icono="grafico">{t('Aún no hay encuestas con resultados.')}</Vacio></Tarjeta>;
  return (
    <>
      <div className="si-seccion-cab">
        <h3>{t('Resultados')}</h3>
        <select className="si-select" value={id || ''} onChange={(e) => setId(Number(e.target.value))} aria-label={t('Encuesta')}>
          {con.map((e) => <option key={e.id} value={e.id}>{e.titulo} · {t(ESTADOS[e.estado].nombre)}</option>)}
        </select>
      </div>
      {id && <Informe key={id} id={id} onCambio={onCambio} />}
    </>
  );
}

/** Barra apilada desfavorable / neutral / favorable. */
const Apilada = ({b, alta}) => (
  <div className={`si-en-apilada${alta ? ' alta' : ''}`} title={`${t('Desfavorable')} ${pctTxt(b.desfavorable)} · ${t('Neutral')} ${pctTxt(b.neutral)} · ${t('Favorable')} ${pctTxt(b.favorable)}`}>
    <i style={{width: `${b.desfavorable}%`, background: COLOR.des}}>{b.desfavorable >= 12 ? `${Math.round(b.desfavorable)}` : ''}</i>
    <i style={{width: `${b.neutral}%`, background: COLOR.neu, color: '#333'}}>{b.neutral >= 12 ? `${Math.round(b.neutral)}` : ''}</i>
    <i style={{width: `${b.favorable}%`, background: COLOR.fav}}>{b.favorable >= 12 ? `${Math.round(b.favorable)}` : ''}</i>
  </div>
);

const Delta = ({v, ant, sufijo = ''}) => {
  if (ant === null || ant === undefined || v === null || v === undefined) return null;
  const dlt = Math.round(v - ant);
  if (!dlt) return <span className="si-en-delta">= {t('igual')}</span>;
  return <span className={`si-en-delta ${dlt > 0 ? 'sube' : 'baja'}`}>{dlt > 0 ? '▲' : '▼'} {conSigno(dlt)}{sufijo}</span>;
};

function Informe({id, onCambio}) {
  const {api, avisar} = useSuite();
  const [d, error, recargar] = useDatos('encuestas.informe', {id}, [id]);
  const [filtro, setFiltro] = useState('');
  const [ia, setIa] = useState(null);
  const [pensando, setPensando] = useState(false);
  const [nuevaAccion, setNuevaAccion] = useState(null);
  const [acc, , recargarAcc] = useDatos('encuestas.acciones', {encuesta: String(id)}, [id]);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const e = d.encuesta;
  const qs = Object.fromEntries(d.preguntas.map((x) => [x.id, x]));
  const b = d.total || d.departamentos[0] || {};
  const ant = d.anterior;
  const participacion = e.destinatarios ? Math.round((100 * e.participantes) / e.destinatarios) : 0;
  const dims = b.suficientes ? Object.entries(b.dimensiones || {}).sort((x, y) => y[1] - x[1]) : [];
  const accion = async (op, msg) => {
    try { const r = await api(op, {id}); avisar(r.mensaje || msg); recargar(); onCambio && onCambio(); } catch (err) { avisar(err.message, 'rojo'); }
  };
  const resumir = async () => {
    setPensando(true);
    try { setIa(await api('encuestas.temas', {id})); } catch (err) { avisar(err.message, 'rojo'); }
    setPensando(false);
  };
  const csv = () => {
    const filas = [[t('Pregunta'), t('Tipo'), t('Dimensión'), t('Ítem u opción'), t('Respuestas'), t('Media'), t('Favorable'), t('Neutral'), t('Desfavorable'), '%']];
    for (const p of b.preguntas || []) {
      const x = qs[p.id];
      const base = [x.texto, t(TIPOS[x.tipo].nombre), x.dimension ? t(DIMENSIONES[x.dimension].nombre) : ''];
      if (p.items) p.items.forEach((it) => filas.push([...base, x.opciones[it.item], it.respuestas, it.media, it.favorable, it.neutral, it.desfavorable, '']));
      else if (p.opciones) p.opciones.forEach((o) => filas.push([...base, x.opciones[o.opcion], o.votos, '', '', '', '', o.porcentaje]));
      else if (x.tipo === 'TEXTO') filas.push([...base, '', p.respuestas, '', '', '', '', '']);
      else if (x.tipo === 'ENPS') filas.push([...base, 'eNPS', p.respuestas, p.media, '', '', '', p.enps]);
      else if (x.tipo === 'SINO') filas.push([...base, t('Sí'), p.respuestas, '', p.favorable, '', '', p.favorable]);
      else filas.push([...base, '', p.respuestas, p.media, p.favorable, p.neutral, p.desfavorable, '']);
    }
    const txt = `﻿${filas.map((f) => f.map((v) => {
      const s = v === null || v === undefined ? '' : String(typeof v === 'number' ? v.toLocaleString(locale()) : v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';')).join('\r\n')}`;
    descargar(`informe-${e.titulo.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}.csv`, txt);
  };
  const imprimir = () => { document.body.classList.add('si-imprimiendo'); window.print(); setTimeout(() => document.body.classList.remove('si-imprimiendo'), 500); };
  const secciones = [];
  for (const p of b.preguntas || []) {
    const x = qs[p.id];
    if (x.tipo === 'TEXTO') continue;
    const s = secciones[secciones.length - 1];
    if (!s || s.nombre !== (x.seccion || '')) secciones.push({nombre: x.seccion || '', lista: [p]}); else s.lista.push(p);
  }
  const comentarios = (b.preguntas || []).filter((p) => qs[p.id].tipo === 'TEXTO');
  const f = filtro.trim().toLowerCase();
  return (
    <div className="si-en-informe si-imprimible">
      <header className="si-en-inf-cab">
        <div>
          <h2>{e.titulo}</h2>
          <p className="si-tenue">{ambitoTexto(e.ambito)} · {e.abierta ? t('abierta el {fecha}', {fecha: dia(e.abierta)}) : ''}{e.cierre ? ` · ${t('cierre el {fecha}', {fecha: dia(e.cierre)})}` : ''}
            {' '}<Insignia tono={ESTADOS[e.estado].tono}>{t(ESTADOS[e.estado].nombre)}</Insignia></p>
          {!d.rrhh && <p className="si-tenue">{t('Ves los resultados de tu departamento: {d}.', {d: b.departamento})}</p>}
        </div>
        <div className="si-fila si-no-imprimir">
          {d.rrhh && e.estado === 'ABIERTA' && <Boton icono="campana" onClick={() => accion('encuestas.recordar')}>{t('Recordar')}</Boton>}
          {d.rrhh && e.estado === 'ABIERTA' && <Boton tipo="peligro" onClick={() => window.confirm(t('¿Cerrar la encuesta? Ya no se podrá responder.')) && accion('encuestas.cerrar')}>{t('Cerrar la encuesta')}</Boton>}
          {b.suficientes && <Boton icono="descargar" onClick={csv}>{t('Exportar CSV')}</Boton>}
          {b.suficientes && <Boton icono="documento" onClick={imprimir}>{t('Imprimir o guardar en PDF')}</Boton>}
        </div>
      </header>

      <div className="si-en-kpis">
        <div className="si-en-kpi">
          <span>{t('Participación')}</span>
          <strong>{participacion} %</strong>
          <small>{t('{n} de {total} personas', {n: e.participantes, total: e.destinatarios})}</small>
          <div className="si-barra fina"><div style={{width: `${participacion}%`}} /></div>
        </div>
        <div className="si-en-kpi">
          <span>{t('Índice de favorabilidad')}</span>
          <strong>{b.suficientes ? pctTxt(b.indice) : '—'}</strong>
          <small>{b.suficientes && ant ? <Delta v={b.indice} ant={ant.indice} sufijo=" pt" /> : t('respuestas 4 y 5 de las escalas')}</small>
        </div>
        <div className="si-en-kpi">
          <span>eNPS</span>
          <strong className={b.enps > 0 ? 'si-positivo' : b.enps < 0 ? 'si-negativo' : ''}>{b.suficientes && b.enps !== null && b.enps !== undefined ? conSigno(b.enps) : '—'}</strong>
          <small>{b.suficientes && ant && ant.enps !== null ? <Delta v={b.enps} ant={ant.enps} /> : t('de −100 a +100')}</small>
        </div>
        <div className="si-en-kpi">
          <span>{t('Mínimo de respuestas')}</span>
          <strong>{d.minimo}</strong>
          <small><Icono n="candado" /> {t('protege el anonimato')}</small>
        </div>
      </div>
      {ant && b.suficientes && <p className="si-tenue si-en-comparada"><Icono n="grafico" /> {t('Comparada con «{titulo}».', {titulo: ant.titulo})}</p>}

      {!b.suficientes ? (
        <div className="si-mensaje-barra si-mb-aviso"><Icono n="candado" /><span>{t('Aún no hay suficientes respuestas para mostrar resultados (mínimo {n}).', {n: d.minimo})}</span></div>
      ) : (
        <>
          {dims.length > 0 && (
            <Tarjeta titulo={t('Dimensiones')} className="si-en-dims-tarjeta">
              <ul className="si-en-dims">
                {dims.map(([k, v], i) => (
                  <li key={k}>
                    <span className="si-en-dim-nombre"><Icono n={dim(k).icono} /> {t(dim(k).nombre)}
                      {i === 0 && dims.length > 2 && <Insignia tono="verde">{t('Fortaleza')}</Insignia>}
                      {i >= dims.length - 2 && dims.length > 3 && <Insignia tono="ambar">{t('A mejorar')}</Insignia>}</span>
                    <span className="si-en-dim-barra"><i style={{width: `${v}%`, background: v >= 60 ? COLOR.fav : v >= 45 ? '#b45000' : COLOR.des}} /></span>
                    <strong>{pctTxt(v)}</strong>
                    {ant && ant.dimensiones && <Delta v={v} ant={ant.dimensiones[k]} sufijo=" pt" />}
                  </li>
                ))}
              </ul>
              <p className="si-leyenda"><span>{t('Favorabilidad: porcentaje de respuestas 4 y 5 («de acuerdo» y «totalmente de acuerdo»).')}</span></p>
            </Tarjeta>
          )}
          {d.total && d.departamentos.length > 0 && dims.length > 0 && (
            <Tarjeta titulo={t('Mapa de calor por departamento')}>
              <div className="si-tabla-envoltura">
                <table className="si-tabla si-en-calor">
                  <thead><tr><th>{t('Departamento')}</th><th>{t('Índice')}</th>{dims.map(([k]) => <th key={k} title={t(dim(k).nombre)}><Icono n={dim(k).icono} /><small>{t(dim(k).nombre)}</small></th>)}<th>eNPS</th></tr></thead>
                  <tbody>
                    <tr className="si-en-calor-total"><th>{t('Total')}</th><td style={{background: calor(b.indice)}}>{pctTxt(b.indice)}</td>
                      {dims.map(([k, v]) => <td key={k} style={{background: calor(v)}}>{pctTxt(v)}</td>)}<td>{b.enps !== null && b.enps !== undefined ? conSigno(b.enps) : '—'}</td></tr>
                    {d.departamentos.map((x) => (
                      <tr key={x.departamento}>
                        <th>{x.departamento}</th>
                        {x.suficientes ? (
                          <>
                            <td style={{background: calor(x.indice)}}>{pctTxt(x.indice)}</td>
                            {dims.map(([k]) => <td key={k} style={{background: calor(x.dimensiones[k])}}>{pctTxt(x.dimensiones[k])}</td>)}
                            <td>{x.enps !== null && x.enps !== undefined ? conSigno(x.enps) : '—'}</td>
                          </>
                        ) : <td colSpan={dims.length + 2} className="si-tenue"><Icono n="candado" /> {t('Oculto para proteger el anonimato (menos de {n} respuestas, o se podría deducir por diferencia)', {n: d.minimo})}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}
          {secciones.map((s) => (
            <Tarjeta key={s.nombre || 'general'} titulo={s.nombre || t('Preguntas')}>
              <ol className="si-en-resultados">
                {s.lista.map((p) => <ResultadoPregunta key={p.id} p={p} x={qs[p.id]} />)}
              </ol>
            </Tarjeta>
          ))}
          {comentarios.length > 0 && (
            <Tarjeta titulo={t('Comentarios')} accion={d.iaDisponible && <Boton icono="chispas" disabled={pensando} onClick={resumir}>{pensando ? t('Resumiendo…') : t('Resumir con IA')}</Boton>}>
              {ia && (
                <div className="si-en-ia">
                  <strong><Icono n="chispas" /> {t('Resumen de {n} comentarios', {n: ia.comentarios})}</strong>
                  <p>{ia.resumen}</p>
                  <small className="si-tenue">{t('Generado por IA a partir de los comentarios anónimos: revísalo antes de compartirlo.')}</small>
                </div>
              )}
              {b.temas && b.temas.length > 0 && (
                <div className="si-pe-filtros si-en-temas">
                  <span className="si-tenue">{t('Se repite:')}</span>
                  {b.temas.map((x) => (
                    <button key={x.palabra} type="button" className={`si-pe-chip${filtro === x.palabra ? ' activa' : ''}`} onClick={() => setFiltro(filtro === x.palabra ? '' : x.palabra)}>
                      {x.palabra} <strong>{x.comentarios}</strong>
                    </button>
                  ))}
                </div>
              )}
              <label className="si-buscador si-no-imprimir"><Icono n="buscar" /><input type="search" value={filtro} onChange={(ev) => setFiltro(ev.target.value)} placeholder={t('Buscar en los comentarios')} aria-label={t('Buscar en los comentarios')} /></label>
              {comentarios.map((p) => {
                const lista = p.comentarios.filter((c) => !f || c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(f));
                return (
                  <section key={p.id} className="si-en-coment">
                    <h4>{qs[p.id].texto} <span className="si-tenue">· {p.comentarios.length}</span></h4>
                    {lista.length ? <ul className="si-comentarios-pulso">{lista.map((c, i) => <li key={i}>{c}</li>)}</ul> : <p className="si-tenue">{t('Sin comentarios.')}</p>}
                  </section>
                );
              })}
            </Tarjeta>
          )}
        </>
      )}

      {d.participacion.length > 0 && (
        <Tarjeta titulo={t('Participación por departamento')}>
          <ul className="si-en-dims">
            {d.participacion.map((x) => {
              const v = x.destinatarios ? Math.round((100 * x.participantes) / x.destinatarios) : 0;
              return (
                <li key={x.departamento}>
                  <span className="si-en-dim-nombre">{x.departamento}</span>
                  <span className="si-en-dim-barra"><i style={{width: `${v}%`, background: 'var(--si-acento)'}} /></span>
                  <strong>{v} %</strong><small className="si-tenue">{x.participantes}/{x.destinatarios}</small>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      )}

      <Tarjeta titulo={t('Plan de acción de esta encuesta')} accion={acc && acc.puedeCrear && <span className="si-no-imprimir"><Boton tipo="primario" icono="mas" onClick={() => setNuevaAccion({encuesta: id})}>{t('Añadir acción')}</Boton></span>}>
        {!acc ? <Cargando /> : !acc.acciones.length ? <Vacio icono="lista">{t('Aún no hay acciones. Los resultados tienen más valor si la plantilla ve qué se hace con ellos.')}</Vacio> : (
          <ul className="si-en-acciones-lista">{acc.acciones.map((a) => <FilaAccion key={a.id} a={a} onEditar={setNuevaAccion} />)}</ul>
        )}
      </Tarjeta>
      {nuevaAccion && acc && <EditarAccion inicial={nuevaAccion} datos={acc} onCerrar={() => setNuevaAccion(null)} onHecho={recargarAcc} />}
    </div>
  );
}

function ResultadoPregunta({p, x}) {
  const ops = x.opciones || [];
  return (
    <li className="si-en-res">
      <p className="si-en-res-txt">{x.texto}
        {x.dimension && <span className="si-en-dim-chip"><Icono n={dim(x.dimension).icono} /> {t(dim(x.dimension).nombre)}</span>}</p>
      {(x.tipo === 'ACUERDO' || x.tipo === 'ESCALA') && (
        <div className="si-en-res-fila"><Apilada b={p} /><span className="si-en-media">{p.media === null ? '—' : p.media.toLocaleString(locale())}<small>/5</small></span></div>
      )}
      {x.tipo === 'MATRIZ' && (
        <ul className="si-en-items">
          {p.items.map((it) => (
            <li key={it.item}><span>{ops[it.item]}</span><Apilada b={it} /><span className="si-en-media">{it.media === null ? '—' : it.media.toLocaleString(locale())}<small>/5</small></span></li>
          ))}
        </ul>
      )}
      {x.tipo === 'SINO' && (
        <div className="si-en-res-fila">
          <div className="si-en-apilada"><i style={{width: `${p.favorable}%`, background: COLOR.fav}}>{t('Sí')} {Math.round(p.favorable)} %</i>
            <i style={{width: `${100 - p.favorable}%`, background: COLOR.neu, color: '#333'}}>{t('No')} {Math.round(100 - p.favorable)} %</i></div>
        </div>
      )}
      {(x.tipo === 'UNICA' || x.tipo === 'MULTIPLE') && (
        <ul className="si-en-barras">
          {[...p.opciones].sort((a, b) => b.votos - a.votos).map((o) => (
            <li key={o.opcion}><span>{ops[o.opcion]}</span><i><b style={{width: `${o.porcentaje}%`}} /></i><strong>{Math.round(o.porcentaje)} %</strong><small>{o.votos}</small></li>
          ))}
          {x.tipo === 'MULTIPLE' && <li className="si-tenue"><small>{t('Cada persona podía elegir varias: los porcentajes no suman 100.')}</small></li>}
        </ul>
      )}
      {x.tipo === 'ENPS' && p.enps !== undefined && (
        <div className="si-enps">
          <span className={`si-enps-valor ${p.enps > 0 ? 'si-positivo' : p.enps < 0 ? 'si-negativo' : ''}`}>{conSigno(p.enps)}</span>
          <div className="si-crece">
            <div className="si-enps-barra">
              <span style={{width: `${(100 * p.detractores) / p.respuestas}%`, background: 'var(--si-rojo)'}} />
              <span style={{width: `${(100 * p.pasivos) / p.respuestas}%`, background: '#cdced9'}} />
              <span style={{width: `${(100 * p.promotores) / p.respuestas}%`, background: 'var(--si-verde)'}} />
            </div>
            <small className="si-tenue">{t('Promotores: {p} · Pasivos: {n} · Detractores: {d}', {p: p.promotores, n: p.pasivos, d: p.detractores})}</small>
          </div>
        </div>
      )}
      <small className="si-tenue">{plural(p.respuestas || 0, 'respuesta', 'respuestas')}</small>
    </li>
  );
}

// =========================================================================================== Gestionar (RRHH)

function Gestionar({d, onCambio, onInforme}) {
  const {api, avisar} = useSuite();
  const [plantillas, setPlantillas] = useState(false);
  const [editando, setEditando] = useState(null);
  const [previa, setPrevia] = useState(null);
  if (editando) return <Constructor inicial={editando} d={d} onCerrar={() => { setEditando(null); onCambio(); }} onPrevia={setPrevia} previa={previa} />;
  if (previa) return <Responder id={previa} vistaPrevia onSalir={() => setPrevia(null)} />;
  const accion = async (op, x, confirmar) => {
    if (confirmar && !window.confirm(confirmar)) return;
    try {
      const r = await api(op, {id: x.id});
      avisar(r.mensaje);
      onCambio();
      if (op === 'encuestas.duplicar') setEditando(aEditable(r));
    } catch (e) { avisar(e.message, 'rojo'); }
  };
  const editar = async (x) => {
    try { setEditando(aEditable(await api('encuestas.detalle', {id: x.id}))); } catch (e) { avisar(e.message, 'rojo'); }
  };
  return (
    <>
      <section className="si-do-publicar">
        <div>
          <h3>{t('Encuestas de la empresa')}</h3>
          <p className="si-tenue">{t('Prepara una encuesta desde una plantilla, revísala con la vista previa y ábrela ya o prográmala.')}</p>
        </div>
        <Boton tipo="primario" icono="mas" onClick={() => setPlantillas(true)}>{t('Nueva encuesta')}</Boton>
      </section>
      <div className="si-tarjeta si-tarjeta-lista">
        <div className="si-tabla-envoltura">
          <table className="si-tabla si-en-gestion">
            <thead><tr><th>{t('Encuesta')}</th><th>{t('Estado')}</th><th>{t('Para')}</th><th>{t('Participación')}</th><th /></tr></thead>
            <tbody>
              {d.encuestas.map((x) => {
                const pct = x.destinatarios ? Math.round((100 * x.participantes) / x.destinatarios) : 0;
                const editable = x.estado === 'BORRADOR' || x.estado === 'PROGRAMADA';
                return (
                  <tr key={x.id}>
                    <td><strong>{x.titulo}</strong><br /><small className="si-tenue">{plural(x.preguntas, 'pregunta', 'preguntas')}{x.serie ? ` · ${x.serie}` : ''}</small></td>
                    <td><Insignia tono={ESTADOS[x.estado].tono}>{t(ESTADOS[x.estado].nombre)}</Insignia><br />
                      <small className="si-tenue">{x.estado === 'PROGRAMADA' ? t('se abre el {fecha}', {fecha: dia(x.apertura)})
                        : x.estado === 'ABIERTA' && x.cierre ? t('hasta el {fecha}', {fecha: dia(x.cierre)}) : x.abierta ? dia(x.abierta) : ''}</small></td>
                    <td>{ambitoTexto(x.ambito)}</td>
                    <td className="si-participacion">{editable ? <span className="si-tenue">—</span> : <><div className="si-barra"><div style={{width: `${pct}%`}} /></div>
                      <small>{t('{n} de {total} ({p} %)', {n: x.participantes, total: x.destinatarios, p: pct})}</small></>}</td>
                    <td className="si-derecha si-en-botones">
                      {editable && <Boton icono="lapiz" onClick={() => editar(x)}>{t('Editar')}</Boton>}
                      <button type="button" className="si-icono-boton" title={t('Vista previa')} aria-label={t('Vista previa')} onClick={() => setPrevia(x.id)}><Icono n="ojo" /></button>
                      <button type="button" className="si-icono-boton" title={t('Duplicar')} aria-label={t('Duplicar')} onClick={() => accion('encuestas.duplicar', x)}><Icono n="documento" /></button>
                      {x.estado === 'ABIERTA' && <button type="button" className="si-icono-boton" title={t('Recordar a quien no ha respondido')} aria-label={t('Recordar')} onClick={() => accion('encuestas.recordar', x)}><Icono n="campana" /></button>}
                      {x.informe && <Boton icono="grafico" onClick={() => onInforme(x.id)}>{t('Informe')}</Boton>}
                      {x.estado === 'ABIERTA' && <button type="button" className="si-icono-boton" title={t('Cerrar la encuesta')} aria-label={t('Cerrar la encuesta')} onClick={() => accion('encuestas.cerrar', x, t('¿Cerrar la encuesta? Ya no se podrá responder.'))}><Icono n="parar" /></button>}
                      {editable && <button type="button" className="si-icono-boton" title={t('Borrar')} aria-label={t('Borrar')} onClick={() => accion('encuestas.borrar', x, t('¿Borrar «{titulo}»?', {titulo: x.titulo}))}><Icono n="papelera" /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {plantillas && (
        <Modal ancho titulo={t('Nueva encuesta')} onCerrar={() => setPlantillas(false)}>
          <p className="si-tenue">{t('Elige un punto de partida. Podrás cambiar, quitar y añadir preguntas.')}</p>
          <div className="si-en-plantillas">
            {PLANTILLAS.map((p) => {
              const n = p.preguntas().filter((x) => x.texto).length;
              return (
                <button key={p.id} type="button" className="si-en-plantilla" onClick={() => { setPlantillas(false); setEditando(desdePlantilla(p)); }}>
                  <span className="si-en-plantilla-icono"><Icono n={p.icono} /></span>
                  <strong>{t(p.titulo)}</strong>
                  <span>{t(p.resumen)}</span>
                  {n > 0 && <small>{plural(n, 'pregunta', 'preguntas')}{p.duracion ? ` · ${t(p.duracion)}` : ''}</small>}
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Una encuesta del servidor en el formato del constructor. */
function aEditable(r) {
  return {id: r.id, titulo: r.titulo, descripcion: r.descripcion || '', gracias: r.gracias || '', ambito: r.ambito, serie: r.serie || '', minimo: r.minimo,
    cierre: r.cierre || '', preguntas: r.lista.map((x) => ({tipo: x.tipo, texto: x.texto, dimension: x.dimension, seccion: x.seccion, obligatoria: x.obligatoria, opciones: x.opciones || []}))};
}

function Constructor({inicial, d, onCerrar, onPrevia, previa}) {
  const {api, avisar} = useSuite();
  const [f, setF] = useState(inicial);
  const [publicar, setPublicar] = useState(false);
  const [apertura, setApertura] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [nuevoTipo, setNuevoTipo] = useState('ACUERDO');
  if (previa) return <Responder id={previa} vistaPrevia onSalir={() => onPrevia(null)} />;
  const qs = f.preguntas;
  const fijarQ = (i, cambios) => setF({...f, preguntas: qs.map((x, j) => (j === i ? {...x, ...cambios} : x))});
  const mover = (i, dlt) => {
    const n = [...qs];
    const [x] = n.splice(i, 1);
    n.splice(i + dlt, 0, x);
    setF({...f, preguntas: n});
  };
  const anadir = () => setF({...f, preguntas: [...qs, {tipo: nuevoTipo, texto: '', dimension: null, seccion: qs.length ? qs[qs.length - 1].seccion : null,
    obligatoria: !OPCIONALES.includes(nuevoTipo), opciones: ['UNICA', 'MULTIPLE', 'MATRIZ'].includes(nuevoTipo) ? ['', ''] : []}]});
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await api('encuestas.guardar', {id: f.id, titulo: f.titulo, descripcion: f.descripcion, gracias: f.gracias, ambito: f.ambito, serie: f.serie,
        minimo: f.minimo, cierre: f.cierre, preguntas: JSON.stringify(qs.map((x) => ({...x, opciones: (x.opciones || []).filter((o) => o.trim())})))});
      setF({...f, id: r.id});
      setGuardando(false);
      return r;
    } catch (e) { avisar(e.message, 'rojo'); setGuardando(false); return null; }
  };
  const borrador = async () => { const r = await guardar(); if (r) avisar(r.mensaje); };
  const vista = async () => { const r = await guardar(); if (r) onPrevia(r.id); };
  const publicarYa = async () => {
    const r = await guardar();
    if (!r) return;
    try { const x = await api('encuestas.publicar', {id: r.id, apertura}); avisar(x.mensaje); onCerrar(); } catch (e) { avisar(e.message, 'rojo'); }
  };
  const secciones = [...new Set(qs.map((x) => x.seccion).filter(Boolean))];
  const dimsUsadas = [...new Set(qs.map((x) => x.dimension).filter(Boolean))];
  const ahora = new Date();
  const minFecha = `${iso(ahora)}T${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  return (
    <div className="si-en-constructor">
      <div className="si-seccion-cab">
        <h3><button type="button" className="si-enlace" onClick={onCerrar}><Icono n="izquierda" /> {t('Encuestas')}</button> · {f.id ? t('Editar encuesta') : t('Nueva encuesta')}</h3>
        <div className="si-fila">
          <Boton onClick={borrador} disabled={guardando}>{t('Guardar borrador')}</Boton>
          <Boton icono="ojo" onClick={vista} disabled={guardando}>{t('Vista previa')}</Boton>
          <Boton tipo="primario" icono="enviar" onClick={() => setPublicar(true)} disabled={guardando}>{t('Publicar…')}</Boton>
        </div>
      </div>
      <div className="si-en-cons-rejilla">
        <div className="si-en-cons-preguntas">
          {qs.map((x, i) => {
            const nuevaSeccion = x.seccion && (i === 0 || qs[i - 1].seccion !== x.seccion);
            return (
              <React.Fragment key={i}>
                {nuevaSeccion && <h4 className="si-en-seccion">{x.seccion}</h4>}
                <section className="si-en-q">
                  <header>
                    <span className="si-num">{i + 1}</span>
                    <select className="si-select" value={x.tipo} aria-label={t('Tipo de pregunta')}
                      onChange={(e) => fijarQ(i, {tipo: e.target.value, obligatoria: !OPCIONALES.includes(e.target.value),
                        opciones: ['UNICA', 'MULTIPLE', 'MATRIZ'].includes(e.target.value) && (x.opciones || []).length < 2 ? ['', ''] : x.opciones})}>
                      {d.tipos.map((k) => <option key={k} value={k}>{t(TIPOS[k].nombre)}</option>)}
                    </select>
                    <select className="si-select" value={x.dimension || ''} aria-label={t('Dimensión')} onChange={(e) => fijarQ(i, {dimension: e.target.value || null})}>
                      <option value="">{t('Sin dimensión')}</option>
                      {d.dimensiones.map((k) => <option key={k} value={k}>{t(DIMENSIONES[k].nombre)}</option>)}
                    </select>
                    <label className="si-casilla"><input type="checkbox" checked={x.obligatoria} onChange={(e) => fijarQ(i, {obligatoria: e.target.checked})} /> {t('Obligatoria')}</label>
                    <span className="si-crece" />
                    <button type="button" className="si-icono-boton" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={t('Subir')} title={t('Subir')}><Icono n="abajo" className="si-pe-girado" /></button>
                    <button type="button" className="si-icono-boton" disabled={i === qs.length - 1} onClick={() => mover(i, 1)} aria-label={t('Bajar')} title={t('Bajar')}><Icono n="abajo" /></button>
                    <button type="button" className="si-icono-boton" onClick={() => setF({...f, preguntas: [...qs.slice(0, i + 1), {...x, opciones: [...(x.opciones || [])]}, ...qs.slice(i + 1)]})} aria-label={t('Duplicar')} title={t('Duplicar')}><Icono n="documento" /></button>
                    <button type="button" className="si-icono-boton" onClick={() => setF({...f, preguntas: qs.filter((_, j) => j !== i)})} aria-label={t('Quitar')} title={t('Quitar')}><Icono n="papelera" /></button>
                  </header>
                  <textarea className="si-input" rows={2} maxLength={400} value={x.texto} placeholder={t('Escribe la pregunta o la afirmación')} onChange={(e) => fijarQ(i, {texto: e.target.value})} />
                  {['UNICA', 'MULTIPLE', 'MATRIZ'].includes(x.tipo) && (
                    <div className="si-en-ops">
                      <small className="si-tenue">{x.tipo === 'MATRIZ' ? t('Afirmaciones (cada una se valora de 1 a 5):') : t('Opciones:')}</small>
                      {(x.opciones || []).map((o, k) => (
                        <div key={k} className="si-fila">
                          <i className={x.tipo === 'MULTIPLE' ? 'cuadrado' : x.tipo === 'UNICA' ? 'circulo' : 'guion'} />
                          <input className="si-input si-crece" value={o} maxLength={120} onChange={(e) => fijarQ(i, {opciones: x.opciones.map((y, j) => (j === k ? e.target.value : y))})} />
                          <button type="button" className="si-icono-boton" disabled={x.opciones.length <= 2} onClick={() => fijarQ(i, {opciones: x.opciones.filter((_, j) => j !== k)})} aria-label={t('Quitar')}><Icono n="x" /></button>
                        </div>
                      ))}
                      {(x.opciones || []).length < 10 && <button type="button" className="si-enlace" onClick={() => fijarQ(i, {opciones: [...(x.opciones || []), '']})}><Icono n="mas" /> {x.tipo === 'MATRIZ' ? t('Añadir afirmación') : t('Añadir opción')}</button>}
                    </div>
                  )}
                  <div className="si-en-q-pie">
                    <span className="si-tenue"><Icono n={TIPOS[x.tipo].icono} /> {x.tipo === 'ACUERDO' ? t('De «totalmente en desacuerdo» a «totalmente de acuerdo»') : t(TIPOS[x.tipo].nombre)}</span>
                    <label className="si-en-q-seccion">{t('Sección')}
                      <input className="si-input" list="si-en-secciones" value={x.seccion || ''} maxLength={120} placeholder={t('Sin sección')} onChange={(e) => fijarQ(i, {seccion: e.target.value || null})} />
                    </label>
                  </div>
                </section>
              </React.Fragment>
            );
          })}
          <datalist id="si-en-secciones">{secciones.map((s) => <option key={s} value={s} />)}</datalist>
          {qs.length < d.maxPreguntas && (
            <div className="si-en-anadir">
              <select className="si-select" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} aria-label={t('Tipo de pregunta')}>
                {d.tipos.map((k) => <option key={k} value={k}>{t(TIPOS[k].nombre)}</option>)}
              </select>
              <Boton icono="mas" onClick={anadir}>{t('Añadir pregunta')}</Boton>
            </div>
          )}
        </div>
        <aside className="si-en-cons-ajustes">
          <Tarjeta titulo={t('Ajustes')}>
            <Campo etiqueta={t('Título')}><input className="si-input" value={f.titulo} maxLength={160} onChange={(e) => setF({...f, titulo: e.target.value})} placeholder={t('Pulso de diciembre')} /></Campo>
            <Campo etiqueta={t('Introducción')}><textarea className="si-input" rows={3} maxLength={500} value={f.descripcion} onChange={(e) => setF({...f, descripcion: e.target.value})} /></Campo>
            <Campo etiqueta={t('Para')}>
              <select className="si-select" value={f.ambito} onChange={(e) => setF({...f, ambito: e.target.value})}>
                <option value="TODOS">{t('Toda la plantilla')}</option>
                <optgroup label={t('Departamento')}>{d.departamentos.map((x) => <option key={x} value={`DEPARTAMENTO:${x}`}>{x}</option>)}</optgroup>
                <optgroup label={t('Rol')}>{Object.keys(ROLES).map((x) => <option key={x} value={`ROL:${x}`}>{t(ROLES[x])}</option>)}</optgroup>
              </select>
            </Campo>
            <div className="si-rejilla-2">
              <Campo etiqueta={t('Mínimo para ver resultados')}><input className="si-input" type="number" min={d.minimo} max={50} value={f.minimo} onChange={(e) => setF({...f, minimo: e.target.value})} /></Campo>
              <Campo etiqueta={t('Cierre')}><input className="si-input" type="date" min={iso(new Date())} value={f.cierre} onChange={(e) => setF({...f, cierre: e.target.value})} /></Campo>
            </div>
            <Campo etiqueta={t('Serie')} ayuda={t('Las encuestas de la misma serie se comparan entre sí (tendencia).')}>
              <input className="si-input" list="si-en-series" value={f.serie} maxLength={40} onChange={(e) => setF({...f, serie: e.target.value.toUpperCase()})} placeholder="PULSO" />
              <datalist id="si-en-series">{['PULSO', 'CLIMA', 'BIENESTAR', 'TELETRABAJO', 'INCORPORACION'].map((s) => <option key={s} value={s} />)}</datalist>
            </Campo>
            <Campo etiqueta={t('Mensaje al terminar')}><textarea className="si-input" rows={2} maxLength={500} value={f.gracias} onChange={(e) => setF({...f, gracias: e.target.value})} /></Campo>
          </Tarjeta>
          <Tarjeta titulo={t('Resumen')}>
            <p>{plural(qs.length, 'pregunta', 'preguntas')} · {t('unos {n} min', {n: minutos(qs.length)})}</p>
            {qs.length > 15 && <p className="si-tenue"><Icono n="alerta" /> {t('Más de 15 preguntas: la participación suele bajar.')}</p>}
            <div className="si-en-dims-usadas">{dimsUsadas.length ? dimsUsadas.map((k) => <span key={k} className="si-en-dim-chip"><Icono n={dim(k).icono} /> {t(dim(k).nombre)}</span>)
              : <small className="si-tenue">{t('Asigna dimensiones a las preguntas para ver el informe por dimensión.')}</small>}</div>
            <p className="si-tenue"><Icono n="candado" /> {t('Anónima: los resultados solo se ven a partir de {n} respuestas.', {n: f.minimo})}</p>
          </Tarjeta>
        </aside>
      </div>
      {publicar && (
        <Modal titulo={t('Publicar la encuesta')} onCerrar={() => setPublicar(false)}
          pie={<><Boton onClick={() => setPublicar(false)}>{t('Cancelar')}</Boton><Boton tipo="primario" icono="enviar" onClick={publicarYa}>{apertura ? t('Programar') : t('Abrir ahora')}</Boton></>}>
          <p>{t('«{titulo}» para {para}.', {titulo: f.titulo || t('Sin título'), para: ambitoTexto(f.ambito)})}</p>
          <label className="si-casilla"><input type="radio" checked={!apertura} onChange={() => setApertura('')} /> {t('Abrirla ahora: cada persona recibe un aviso.')}</label>
          <label className="si-casilla"><input type="radio" checked={!!apertura} onChange={() => setApertura(minFecha)} /> {t('Programar la apertura')}</label>
          {apertura && <Campo etiqueta={t('Se abre el')}><input className="si-input" type="datetime-local" min={minFecha} value={apertura} onChange={(e) => setApertura(e.target.value)} /></Campo>}
          <p className="si-tenue">{t('Una vez abierta ya no se pueden cambiar las preguntas.')}</p>
        </Modal>
      )}
    </div>
  );
}

// =========================================================================================== Plan de acción

function FilaAccion({a, onEditar}) {
  const vencida = a.limite && a.estado !== 'HECHA' && a.limite < iso(new Date());
  return (
    <li className={`si-en-accion si-en-accion-${a.estado.toLowerCase()}`}>
      <span className="si-en-acc-icono"><Icono n={dim(a.dimension) ? dim(a.dimension).icono : 'lista'} /></span>
      <div className="si-crece">
        <strong>{a.titulo}</strong>
        {a.descripcion && <p>{a.descripcion}</p>}
        <small className="si-tenue">
          {[dim(a.dimension) && t(dim(a.dimension).nombre), a.departamento || t('Toda la plantilla'), a.encuestaTitulo].filter(Boolean).join(' · ')}
        </small>
      </div>
      <div className="si-en-acc-lado">
        <Insignia tono={ESTADOS_ACCION[a.estado].tono}>{t(ESTADOS_ACCION[a.estado].nombre)}</Insignia>
        {a.limite && <small className={vencida ? 'si-negativo' : 'si-tenue'}>{vencida ? t('vencida el {fecha}', {fecha: dia(a.limite)}) : t('antes del {fecha}', {fecha: dia(a.limite)})}</small>}
        {a.responsable && <span className="si-fila"><Avatar nombre={a.responsable.nombre} tam={22} /><small>{a.responsable.nombre}</small></span>}
        {a.editar && onEditar && <button type="button" className="si-enlace" onClick={() => onEditar(a)}><Icono n="lapiz" /> {t('Editar')}</button>}
      </div>
    </li>
  );
}

function Plan() {
  const [d, error, recargar] = useDatos('encuestas.acciones', {}, []);
  const [editar, setEditar] = useState(null);
  const [enc, setEnc] = useState('');
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const titulos = [...new Map(d.acciones.map((a) => [a.encuesta, a.encuestaTitulo])).entries()];
  const lista = d.acciones.filter((a) => !enc || String(a.encuesta) === enc);
  const hechas = lista.filter((a) => a.estado === 'HECHA').length;
  return (
    <>
      <section className="si-do-publicar">
        <div>
          <h3>{t('Plan de acción')}</h3>
          <p className="si-tenue">{t('Lo que hacemos con lo que nos contáis en las encuestas.')}</p>
          {lista.length > 0 && <p className="si-en-avance"><strong>{t('{h} de {n} acciones hechas', {h: hechas, n: lista.length})}</strong>
            <span className="si-barra fina"><span style={{display: 'block', height: '100%', width: `${(100 * hechas) / lista.length}%`, background: 'var(--si-verde)'}} /></span></p>}
        </div>
        <div className="si-fila">
          {titulos.length > 1 && (
            <select className="si-select" value={enc} onChange={(e) => setEnc(e.target.value)} aria-label={t('Encuesta')}>
              <option value="">{t('Todas las encuestas')}</option>
              {titulos.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          {d.puedeCrear && d.encuestas.length > 0 && <Boton tipo="primario" icono="mas" onClick={() => setEditar({encuesta: d.encuestas[0].id})}>{t('Añadir acción')}</Boton>}
        </div>
      </section>
      {!lista.length ? <Tarjeta><Vacio icono="lista">{t('Aún no hay acciones en el plan.')}</Vacio></Tarjeta> : (
        <div className="si-en-tablero">
          {Object.entries(ESTADOS_ACCION).map(([k, v]) => {
            const col = lista.filter((a) => a.estado === k);
            return (
              <section key={k} className={`si-en-columna si-en-col-${k.toLowerCase()}`}>
                <h4>{t(v.nombre)} <span className="si-cuenta">{col.length}</span></h4>
                <ul className="si-en-acciones-lista">{col.map((a) => <FilaAccion key={a.id} a={a} onEditar={setEditar} />)}</ul>
              </section>
            );
          })}
        </div>
      )}
      {editar && <EditarAccion inicial={editar} datos={d} onCerrar={() => setEditar(null)} onHecho={recargar} />}
    </>
  );
}

function EditarAccion({inicial, datos, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const [dir] = useDatos('personas.directorio', {}, []);
  const [f, setF] = useState({id: inicial.id, encuesta: inicial.encuesta, titulo: inicial.titulo || '', descripcion: inicial.descripcion || '',
    dimension: inicial.dimension || '', departamento: inicial.departamento || '', responsable: inicial.responsable ? inicial.responsable.usuario : '',
    limite: inicial.limite || '', estado: inicial.estado || 'PENDIENTE'});
  const campo = (k) => (e) => setF({...f, [k]: e.target.value});
  const guardar = async () => {
    try { const r = await api('encuestas.accion', f); avisar(r.mensaje); onHecho(); onCerrar(); } catch (e) { avisar(e.message, 'rojo'); }
  };
  const quitar = async () => {
    if (!window.confirm(t('¿Quitar «{titulo}» del plan?', {titulo: f.titulo}))) return;
    try { const r = await api('encuestas.accionBorrar', {id: f.id}); avisar(r.mensaje); onHecho(); onCerrar(); } catch (e) { avisar(e.message, 'rojo'); }
  };
  const deptos = dir ? [...new Set(dir.personas.map((p) => p.departamento).filter(Boolean))].sort() : [];
  return (
    <Modal titulo={f.id ? t('Editar acción') : t('Nueva acción del plan')} onCerrar={onCerrar}
      pie={<>{f.id && <Boton tipo="peligro" onClick={quitar}>{t('Quitar')}</Boton>}<Boton onClick={onCerrar}>{t('Cancelar')}</Boton>
        <Boton tipo="primario" disabled={!f.titulo.trim()} onClick={guardar}>{t('Guardar')}</Boton></>}>
      <Campo etiqueta={t('Encuesta')}>
        <select className="si-select" value={f.encuesta} onChange={(e) => setF({...f, encuesta: Number(e.target.value)})} disabled={!!f.id}>
          {datos.encuestas.map((x) => <option key={x.id} value={x.id}>{x.titulo}</option>)}
        </select>
      </Campo>
      <Campo etiqueta={t('¿Qué se va a hacer?')}><input className="si-input" value={f.titulo} maxLength={160} onChange={campo('titulo')} autoFocus /></Campo>
      <Campo etiqueta={t('Detalle (opcional)')}><textarea className="si-input" rows={3} maxLength={1000} value={f.descripcion} onChange={campo('descripcion')} /></Campo>
      <div className="si-rejilla-2">
        <Campo etiqueta={t('Dimensión')}>
          <select className="si-select" value={f.dimension} onChange={campo('dimension')}>
            <option value="">{t('Sin dimensión')}</option>
            {datos.dimensiones.map((k) => <option key={k} value={k}>{t(DIMENSIONES[k].nombre)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={t('Para')}>
          {datos.rrhh ? (
            <select className="si-select" value={f.departamento} onChange={campo('departamento')}>
              <option value="">{t('Toda la plantilla')}</option>
              {deptos.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          ) : <input className="si-input" value={datos.departamento || ''} disabled />}
        </Campo>
        <Campo etiqueta={t('Quién la lleva')}>
          <select className="si-select" value={f.responsable} onChange={campo('responsable')}>
            <option value="">{t('Yo')}</option>
            {dir && dir.personas.map((p) => <option key={p.usuario} value={p.usuario}>{p.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={t('Fecha límite')}><input className="si-input" type="date" value={f.limite} onChange={campo('limite')} /></Campo>
      </div>
      <Campo etiqueta={t('Estado')}>
        <div className="si-pe-filtros">
          {Object.entries(ESTADOS_ACCION).map(([k, v]) => (
            <button key={k} type="button" className={`si-pe-chip${f.estado === k ? ' activa' : ''}`} aria-pressed={f.estado === k} onClick={() => setF({...f, estado: k})}>{t(v.nombre)}</button>
          ))}
        </div>
      </Campo>
    </Modal>
  );
}
