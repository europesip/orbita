// Personas: el directorio de la plantilla. Buscador con la disponibilidad de hoy de cada persona, ficha (contacto,
// línea de responsables, equipo, perfil y reconocimientos), organigrama, celebraciones y reconocimientos entre
// compañeros. Cada persona edita su perfil; RRHH da de alta fichas nuevas y cambia los datos de organización.
// Diseño propio con los colores y la tipografía de HCL DX: el anillo del avatar dice la disponibilidad de un vistazo.
import React, {useEffect, useMemo, useState} from 'react';
import {Avatar, Boton, Campo, Cargando, Fallo, Modal, Pestanas, Tarjeta, Vacio, fecha, plural, useDatos, useSuite} from './ui.jsx';
import {VALORES_RECONOCIMIENTO, haceCuanto} from './social.jsx';
import {Icono} from './iconos.jsx';
import {t} from './i18n.js';

/** Disponibilidad de hoy (nunca el motivo de una pausa ni el tipo de una ausencia). */
const PRESENCIA = {
  OFICINA: {nombre: 'En la oficina', color: '#1e7d32', icono: 'oficina'},
  TELETRABAJO: {nombre: 'Teletrabajando', color: '#13838f', icono: 'inicio'},
  PAUSA: {nombre: 'En pausa', color: '#b45000', icono: 'pausa'},
  FUERA: {nombre: 'No disponible', color: '#8d8d8d', icono: 'reloj'},
  AUSENTE: {nombre: 'Fuera', color: '#6f5bd6', icono: 'calendario'},
};
const ORDEN_PRESENCIA = ['OFICINA', 'TELETRABAJO', 'PAUSA', 'FUERA', 'AUSENTE'];
const CELEBRACION = {
  CUMPLEANOS: {icono: 'tarta', color: '#c2307a'},
  ANIVERSARIO: {icono: 'trofeo', color: '#b45000'},
  INCORPORACION: {icono: 'entrar', color: '#13838f'},
};
const ROLES = {EMPLEADO: 'Empleado', RESPONSABLE: 'Responsable', RRHH: 'RRHH', ADMINISTRACION: 'Administración'};
const PESTANAS = ['directorio', 'organigrama', 'reconocimientos'];
const valor = (v) => VALORES_RECONOCIMIENTO[v] || VALORES_RECONOCIMIENTO.EQUIPO;

/** Sin tildes ni mayúsculas, para buscar (igual que el servidor). */
const plano = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pestaña y persona del enlace: #directorio, #organigrama, #reconocimientos o #persona=<usuario>. */
function delEnlace() {
  const h = decodeURIComponent((typeof window !== 'undefined' && window.location.hash || '').replace('#', ''));
  if (h.startsWith('persona=')) return {pest: 'directorio', persona: h.slice(8)};
  return {pest: PESTANAS.includes(h) ? h : 'directorio', persona: null};
}

function textoPresencia(p) {
  if (!p) return '';
  const def = PRESENCIA[p.estado] || PRESENCIA.FUERA;
  if (p.estado === 'AUSENTE' && p.vuelve) return t('Fuera · vuelve el {fecha}', {fecha: fecha(p.vuelve)});
  return t(def.nombre);
}

/** Avatar con el anillo de disponibilidad. */
function Foto({persona, tam = 44}) {
  const p = persona.presencia;
  const def = p ? PRESENCIA[p.estado] || PRESENCIA.FUERA : null;
  return (
    <span className="si-pe-foto" style={{'--anillo': def ? def.color : 'transparent'}} title={p ? textoPresencia(p) : undefined}>
      <Avatar nombre={persona.nombre} tam={tam} />
      {def && <i className="si-pe-punto" style={{background: def.color}} />}
    </span>
  );
}

/** Línea de disponibilidad con su punto de color. */
const Disponibilidad = ({p}) => (p ? (
  <span className="si-pe-disponible"><i style={{background: (PRESENCIA[p.estado] || PRESENCIA.FUERA).color}} />{textoPresencia(p)}</span>
) : null);

const Buscador = ({valor: v, onCambiar, placeholder, grande, autoFocus}) => (
  <label className={`si-buscador${grande ? ' grande' : ''}`}>
    <Icono n="buscar" />
    <input type="search" value={v} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus} onChange={(e) => onCambiar(e.target.value)} />
  </label>
);

// =========================================================================================== Aplicación

export function Personas({yo}) {
  const [{pest, persona}, setEnlace] = useState(delEnlace);
  const [ficha, setFicha] = useState(persona);
  const [reconocer, setReconocer] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const cambio = () => { const e = delEnlace(); setEnlace(e); setFicha(e.persona); };
    window.addEventListener('hashchange', cambio);
    return () => window.removeEventListener('hashchange', cambio);
  }, []);
  const cambiar = (p) => {
    setEnlace({pest: p, persona: null});
    if (window.history.replaceState) window.history.replaceState(null, '', `#${p}`);
  };
  const abrir = (u) => setFicha(u);
  const cambio = () => setVersion((v) => v + 1);
  const comun = {onAbrir: abrir, onReconocer: setReconocer, version};
  return (
    <>
      <Pestanas activa={pest} onCambiar={cambiar} pestanas={[
        {id: 'directorio', nombre: t('Directorio')},
        {id: 'organigrama', nombre: t('Organigrama')},
        {id: 'reconocimientos', nombre: t('Reconocimientos')},
      ]} />
      {pest === 'directorio' && <Directorio {...comun} onCambio={cambio} />}
      {pest === 'organigrama' && <Organigrama {...comun} />}
      {pest === 'reconocimientos' && <Reconocimientos {...comun} />}
      {ficha && <Ficha usuario={ficha} yo={yo} onAbrir={abrir} onCerrar={() => setFicha(null)} onReconocer={setReconocer} onCambio={cambio}
        onOrganigrama={() => { setFicha(null); cambiar('organigrama'); }} />}
      {reconocer && <Reconocer para={reconocer === true ? '' : reconocer} yo={yo} onCerrar={() => setReconocer(null)} onEnviado={cambio} />}
    </>
  );
}

// =========================================================================================== Directorio

function Directorio({onAbrir, onReconocer, onCambio, version}) {
  const [d, error, recargar] = useDatos('personas.directorio', {}, [version]);
  const [q, setQ] = useState('');
  const [dep, setDep] = useState('');
  const [estado, setEstado] = useState('');
  const [alta, setAlta] = useState(false);
  const filtradas = useMemo(() => {
    if (!d) return [];
    const palabras = plano(q).split(/\s+/).filter(Boolean);
    return d.personas.filter((p) => {
      if (dep && p.departamento !== dep) return false;
      if (estado && p.presencia.estado !== estado) return false;
      const texto = plano([p.nombre, p.puesto, p.departamento, p.sede, p.email, p.usuario, ...(p.habilidades || [])].join(' '));
      return palabras.every((w) => texto.includes(w));
    });
  }, [d, q, dep, estado]);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  return (
    <div className="si-pe-rejilla">
      <div className="si-pe-principal">
        <section className="si-pe-buscar">
          <div className="si-seccion-cab">
            <h3>{t('¿A quién buscas?')}</h3>
            {d.rrhh && <Boton tipo="primario" icono="mas" onClick={() => setAlta(true)}>{t('Dar de alta')}</Boton>}
          </div>
          <Buscador grande valor={q} onCambiar={setQ} placeholder={t('Nombre, puesto, habilidad, idioma o sede')} />
          <div className="si-pe-filtros" role="group" aria-label={t('Disponibilidad de hoy')}>
            <span className="si-tenue">{t('Hoy:')}</span>
            {ORDEN_PRESENCIA.filter((e) => d.estados[e]).map((e) => (
              <button key={e} type="button" className={`si-pe-chip${estado === e ? ' activa' : ''}`} aria-pressed={estado === e}
                onClick={() => setEstado(estado === e ? '' : e)}>
                <i style={{background: PRESENCIA[e].color}} />{t(PRESENCIA[e].nombre)} <strong>{d.estados[e]}</strong>
              </button>
            ))}
          </div>
          <div className="si-pe-filtros" role="group" aria-label={t('Departamento')}>
            <button type="button" className={`si-pe-chip${!dep ? ' activa' : ''}`} aria-pressed={!dep} onClick={() => setDep('')}>{t('Todos')}</button>
            {d.departamentos.map((x) => (
              <button key={x} type="button" className={`si-pe-chip${dep === x ? ' activa' : ''}`} aria-pressed={dep === x} onClick={() => setDep(dep === x ? '' : x)}>{x}</button>
            ))}
          </div>
        </section>
        <p className="si-tenue si-pe-cuenta">{filtradas.length === d.personas.length
          ? plural(d.total, 'persona', 'personas') : t('{n} de {total}', {n: filtradas.length, total: plural(d.total, 'persona', 'personas')})}</p>
        {!filtradas.length ? <Vacio icono="buscar">{t('Nadie coincide con la búsqueda.')}</Vacio> : (
          <ul className="si-pe-tarjetas">
            {filtradas.map((p) => <li key={p.usuario}><TarjetaPersona p={p} onAbrir={onAbrir} onBuscar={setQ} /></li>)}
          </ul>
        )}
      </div>
      <aside className="si-pe-lado">
        <Celebraciones onAbrir={onAbrir} version={version} />
        <UltimosReconocimientos onAbrir={onAbrir} onReconocer={onReconocer} version={version} />
      </aside>
      {alta && <DatosRrhh d={d} onCerrar={() => setAlta(false)} onGuardado={(u) => { setAlta(false); recargar(); onCambio(); onAbrir(u); }} />}
    </div>
  );
}

function TarjetaPersona({p, onAbrir, onBuscar}) {
  return (
    <article className={`si-pe-tarjeta${p.yo ? ' si-pe-yo' : ''}`}>
      <button type="button" className="si-pe-abrir" onClick={() => onAbrir(p.usuario)} aria-label={t('Ver la ficha de {nombre}', {nombre: p.nombre})}>
        <Foto persona={p} tam={52} />
        <span className="si-pe-nombre">
          <strong>{p.nombre}{p.yo && <small> · {t('Tú')}</small>}</strong>
          <span>{p.puesto}</span>
          <small>{[p.departamento, p.sede].filter(Boolean).join(' · ')}</small>
        </span>
      </button>
      <Disponibilidad p={p.presencia} />
      {p.habilidades && p.habilidades.length > 0 && (
        <div className="si-pe-habilidades">
          {p.habilidades.slice(0, 3).map((h) => <button key={h} type="button" className="si-pe-etiqueta" onClick={() => onBuscar(h)}>{h}</button>)}
          {p.habilidades.length > 3 && <span className="si-tenue">+{p.habilidades.length - 3}</span>}
        </div>
      )}
      <div className="si-pe-contacto">
        {p.email && <a href={`mailto:${p.email}`} title={p.email} aria-label={t('Escribir a {nombre}', {nombre: p.nombre})}><Icono n="correo" /></a>}
        {p.telefono && <a href={`tel:${p.telefono.replace(/[^+0-9]/g, '')}`} title={p.telefono} aria-label={t('Llamar a {nombre}', {nombre: p.nombre})}><Icono n="telefono" /></a>}
        {p.extension && <span className="si-tenue" title={t('Extensión')}>{t('Ext.')} {p.extension}</span>}
        {p.aCargo > 0 && <span className="si-pe-equipo-n" title={t('Personas a su cargo')}><Icono n="personas" /> {p.aCargo}</span>}
      </div>
    </article>
  );
}

function Celebraciones({onAbrir, version}) {
  const [d] = useDatos('personas.celebraciones', {}, [version]);
  return (
    <Tarjeta titulo={t('Celebraciones')} className="si-pe-celebraciones">
      {!d ? <Cargando /> : !d.celebraciones.length ? <Vacio icono="tarta">{t('Nada que celebrar en los próximos {n} días.', {n: d.dias})}</Vacio> : (
        <ul className="si-lista si-mini-lista">
          {d.celebraciones.map((c) => <FilaCelebracion key={`${c.tipo}-${c.usuario}`} c={c} onAbrir={onAbrir} />)}
        </ul>
      )}
    </Tarjeta>
  );
}

export function textoCelebracion(c) {
  if (c.tipo === 'CUMPLEANOS') return c.hoy ? t('¡Hoy es su cumpleaños!') : t('Cumpleaños el {fecha}', {fecha: fecha(c.fecha, {weekday: 'long', day: 'numeric', month: 'long'})});
  if (c.tipo === 'ANIVERSARIO') {
    const anios = plural(c.anios, 'año', 'años');
    return c.hoy ? t('Hoy cumple {anios} en la empresa', {anios}) : t('{anios} en la empresa el {fecha}', {anios, fecha: fecha(c.fecha, {day: 'numeric', month: 'long'})});
  }
  return c.fecha > new Date().toISOString().slice(0, 10) ? t('Se incorpora el {fecha}', {fecha: fecha(c.fecha, {day: 'numeric', month: 'long'})})
    : t('Nueva incorporación · {fecha}', {fecha: fecha(c.fecha, {day: 'numeric', month: 'long'})});
}

export function FilaCelebracion({c, onAbrir, href}) {
  const def = CELEBRACION[c.tipo];
  const dentro = (
    <>
      <span className="si-pe-cel-icono" style={{color: def.color}}><Icono n={def.icono} /></span>
      <span><strong>{c.nombre}</strong><small>{textoCelebracion(c)}</small></span>
    </>
  );
  return (
    <li className={c.hoy ? 'si-pe-hoy' : ''}>
      {href ? <a href={href}>{dentro}</a> : <button type="button" className="si-pe-fila" onClick={() => onAbrir(c.usuario)}>{dentro}</button>}
    </li>
  );
}

function UltimosReconocimientos({onAbrir, onReconocer, version}) {
  const [d] = useDatos('reconocimientos.lista', {}, [version]);
  return (
    <Tarjeta titulo={t('Reconocimientos')} accion={<Boton icono="corazon" onClick={() => onReconocer(true)}>{t('Dar las gracias')}</Boton>}>
      {!d ? <Cargando /> : !d.reconocimientos.length ? <Vacio icono="corazon">{t('Todavía no hay reconocimientos.')}</Vacio> : (
        <ul className="si-lista si-mini-lista">
          {d.reconocimientos.slice(0, 4).map((r) => (
            <li key={r.id}>
              <button type="button" className="si-pe-fila" onClick={() => onAbrir(r.para.usuario)}>
                <span className="si-pe-cel-icono" style={{color: valor(r.valor).color}}><Icono n={valor(r.valor).icono} /></span>
                <span><strong>{r.para.nombre}</strong><small>{t(valor(r.valor).nombre)} · {t('de {nombre}', {nombre: r.de.nombre})} · {haceCuanto(r.creado)}</small></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

// =========================================================================================== Ficha

function Ficha({usuario, yo, onAbrir, onCerrar, onReconocer, onCambio, onOrganigrama}) {
  const [d, error, recargar, fijar] = useDatos('personas.ficha', {usuario}, [usuario]);
  const [editar, setEditar] = useState(null);
  const titulo = t('Ficha');
  return (
    <Modal titulo={titulo} onCerrar={onCerrar} ancho>
      {error ? <Fallo>{error}</Fallo> : !d ? <Cargando /> : (
        <div className="si-pe-ficha">
          <header className="si-pe-portada">
            <Foto persona={d} tam={84} />
            <div className="si-crece">
              <h2>{d.nombre}</h2>
              <p>{d.puesto}</p>
              <p className="si-tenue">{[d.departamento, d.sede].filter(Boolean).join(' · ')}</p>
              <div className="si-fila"><Disponibilidad p={d.presencia} />
                {d.presencia && d.presencia.proxima && d.presencia.estado !== 'AUSENTE' && (
                  <span className="si-tenue">{t('Próxima ausencia: {fechas}', {fechas: rangoCorto(d.presencia.proxima)})}</span>
                )}
              </div>
            </div>
          </header>
          <div className="si-pe-acciones">
            {d.email && <a className="si-boton si-boton-secundario" href={`mailto:${d.email}`}><span className="si-icono"><Icono n="correo" /></span>{t('Correo')}</a>}
            {d.telefono && <a className="si-boton si-boton-secundario" href={`tel:${d.telefono.replace(/[^+0-9]/g, '')}`}><span className="si-icono"><Icono n="telefono" /></span>{t('Llamar')}</a>}
            {!d.yo && <Boton icono="corazon" onClick={() => onReconocer(d.usuario)}>{t('Dar las gracias')}</Boton>}
            <Boton icono="organigrama" onClick={onOrganigrama}>{t('Ver en el organigrama')}</Boton>
            {d.editarPerfil && <Boton tipo="primario" icono="lapiz" onClick={() => setEditar('perfil')}>{t('Editar mi perfil')}</Boton>}
            {d.editarRrhh && <Boton icono="ajustes" onClick={() => setEditar('rrhh')}>{t('Datos de organización')}</Boton>}
          </div>
          <div className="si-pe-columnas">
            <div>
              {(d.sobreMi || d.yo) && (
                <section className="si-pe-bloque">
                  <h4>{t('Sobre mí')}</h4>
                  {d.sobreMi ? <p className="si-pe-texto">{d.sobreMi}</p> : <p className="si-tenue">{t('Cuenta algo sobre ti: a qué te dedicas, en qué te pueden preguntar…')}</p>}
                </section>
              )}
              <section className="si-pe-bloque">
                <h4>{t('Habilidades')}</h4>
                {d.habilidades.length ? <div className="si-pe-habilidades">{d.habilidades.map((h) => <span key={h} className="si-pe-etiqueta">{h}</span>)}</div>
                  : <p className="si-tenue">{t('Sin habilidades en su perfil.')}</p>}
              </section>
              {d.idiomas && <section className="si-pe-bloque"><h4>{t('Idiomas')}</h4><p>{d.idiomas}</p></section>}
              <section className="si-pe-bloque">
                <h4>{t('Reconocimientos recibidos')} <span className="si-tenue">· {d.reconocimientos.total}</span></h4>
                <div className="si-pe-valores">
                  {Object.entries(d.reconocimientos.porValor).filter(([, n]) => n > 0).map(([v, n]) => (
                    <span key={v} className="si-pe-valor" style={{'--valor': valor(v).color}}><Icono n={valor(v).icono} /> {t(valor(v).nombre)} <strong>{n}</strong></span>
                  ))}
                </div>
                {d.reconocimientos.ultimos.length ? (
                  <ul className="si-pe-citas">
                    {d.reconocimientos.ultimos.map((r) => (
                      <li key={r.id}><q>{r.texto}</q><small>{r.de.nombre} · {haceCuanto(r.creado)}</small></li>
                    ))}
                  </ul>
                ) : <p className="si-tenue">{t('Aún no ha recibido ninguno.')}</p>}
              </section>
            </div>
            <div>
              <section className="si-pe-bloque">
                <h4>{t('Contacto')}</h4>
                <dl className="si-pe-datos">
                  {d.email && <><dt>{t('Correo')}</dt><dd><a href={`mailto:${d.email}`}>{d.email}</a></dd></>}
                  {d.telefono && <><dt>{t('Teléfono')}</dt><dd>{d.telefono}</dd></>}
                  {d.extension && <><dt>{t('Extensión')}</dt><dd>{d.extension}</dd></>}
                  {d.sede && <><dt>{t('Sede')}</dt><dd>{[d.sede, d.ubicacion].filter(Boolean).join(' · ')}</dd></>}
                  {d.incorporacion && <><dt>{t('En la empresa desde')}</dt><dd>{fecha(d.incorporacion, {day: 'numeric', month: 'long', year: 'numeric'})}
                    {d.antiguedad > 0 && <span className="si-tenue"> · {plural(d.antiguedad, 'año', 'años')}</span>}</dd></>}
                  {d.cumpleanos && <><dt>{t('Cumpleaños')}</dt><dd>{fechaCumple(d.cumpleanos)}
                    {d.yo && !d.cumpleVisible && <span className="si-tenue"> · {t('solo lo ves tú')}</span>}</dd></>}
                  <dt>{t('Rol en ÓRBITA')}</dt><dd>{t(ROLES[d.rol] || d.rol)}</dd>
                </dl>
              </section>
              <section className="si-pe-bloque">
                <h4>{t('Línea de responsables')}</h4>
                {!d.cadena.length ? <p className="si-tenue">{t('No depende de nadie: está arriba del organigrama.')}</p> : (
                  <ol className="si-pe-cadena">
                    {d.cadena.map((x) => <li key={x.usuario}><MiniPersona p={x} onAbrir={onAbrir} /></li>)}
                    <li className="si-pe-actual"><MiniPersona p={d} /></li>
                  </ol>
                )}
              </section>
              {d.equipo.length > 0 && (
                <section className="si-pe-bloque">
                  <h4>{t('Su equipo')} <span className="si-tenue">· {d.equipo.length}</span></h4>
                  <ul className="si-pe-minis">{d.equipo.map((x) => <li key={x.usuario}><MiniPersona p={x} onAbrir={onAbrir} /></li>)}</ul>
                </section>
              )}
              {d.companeros.length > 0 && (
                <section className="si-pe-bloque">
                  <h4>{t('Compañeros')}</h4>
                  <ul className="si-pe-minis">{d.companeros.map((x) => <li key={x.usuario}><MiniPersona p={x} onAbrir={onAbrir} /></li>)}</ul>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
      {editar === 'perfil' && d && <EditarPerfil d={d} onCerrar={() => setEditar(null)} onGuardado={(n) => { fijar(n); setEditar(null); onCambio(); }} />}
      {editar === 'rrhh' && d && <ConDirectorio><DatosRrhh persona={d} onCerrar={() => setEditar(null)}
        onGuardado={() => { setEditar(null); recargar(); onCambio(); }} /></ConDirectorio>}
    </Modal>
  );
}

/** Carga el directorio (departamentos, sedes y personas) para la ventana de RRHH y se lo pasa como d. */
function ConDirectorio({children}) {
  const [d, error] = useDatos('personas.directorio', {}, []);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return null;
  return React.cloneElement(children, {d});
}

function MiniPersona({p, onAbrir}) {
  const dentro = <><Foto persona={p} tam={32} /><span><strong>{p.nombre}</strong><small>{p.puesto}</small></span></>;
  return onAbrir ? <button type="button" className="si-pe-mini" onClick={() => onAbrir(p.usuario)}>{dentro}</button> : <span className="si-pe-mini">{dentro}</span>;
}

const rangoCorto = (r) => (r.desde === r.hasta ? fecha(r.desde) : `${fecha(r.desde)} – ${fecha(r.hasta)}`);
const fechaCumple = (mmdd) => fecha(`2000-${mmdd}`, {day: 'numeric', month: 'long'});

// =========================================================================================== Editar mi perfil

function EditarPerfil({d, onCerrar, onGuardado}) {
  const {api, avisar} = useSuite();
  const [f, setF] = useState({telefono: d.telefono || '', extension: d.extension || '', ubicacion: d.ubicacion || '', sobreMi: d.sobreMi || '',
    idiomas: d.idiomas || '', habilidades: d.habilidades || [], mes: d.cumpleanos ? d.cumpleanos.slice(0, 2) : '',
    dia: d.cumpleanos ? d.cumpleanos.slice(3) : '', cumpleVisible: !!d.cumpleVisible});
  const [nueva, setNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campo = (k) => (e) => setF({...f, [k]: e.target.value});
  const anadir = () => {
    const h = nueva.trim().replace(/\s+/g, ' ');
    if (!h) return;
    if (!f.habilidades.some((x) => x.toLowerCase() === h.toLowerCase())) setF({...f, habilidades: [...f.habilidades, h]});
    setNueva('');
  };
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await api('personas.perfil', {telefono: f.telefono, extension: f.extension, ubicacion: f.ubicacion, sobreMi: f.sobreMi,
        idiomas: f.idiomas, habilidades: f.habilidades.join(', '), cumpleanos: f.mes && f.dia ? `${f.mes}-${f.dia}` : '', cumpleVisible: f.cumpleVisible});
      avisar(r.mensaje);
      onGuardado(r);
    } catch (e) { avisar(e.message, 'rojo'); setGuardando(false); }
  };
  const meses = Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0'));
  const dias = Array.from({length: 31}, (_, i) => String(i + 1).padStart(2, '0'));
  return (
    <Modal titulo={t('Editar mi perfil')} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton><Boton tipo="primario" disabled={guardando} onClick={guardar}>{t('Guardar')}</Boton></>}>
      <p className="si-tenue">{t('Lo ve toda la empresa en el directorio. El nombre, el puesto, el departamento, la sede y el correo los mantiene RRHH.')}</p>
      <div className="si-rejilla-2">
        <Campo etiqueta={t('Teléfono')}><input className="si-input" value={f.telefono} onChange={campo('telefono')} placeholder="+34 600 000 000" inputMode="tel" /></Campo>
        <Campo etiqueta={t('Extensión')}><input className="si-input" value={f.extension} onChange={campo('extension')} inputMode="numeric" maxLength={8} /></Campo>
      </div>
      <Campo etiqueta={t('Dónde encontrarme')} ayuda={t('Planta, zona o puesto dentro de tu sede.')}>
        <input className="si-input" value={f.ubicacion} onChange={campo('ubicacion')} maxLength={80} />
      </Campo>
      <Campo etiqueta={t('Sobre mí')} ayuda={t('{n} de 600 caracteres', {n: f.sobreMi.length})}>
        <textarea className="si-input" rows={3} maxLength={600} value={f.sobreMi} onChange={campo('sobreMi')} />
      </Campo>
      <Campo etiqueta={t('Habilidades')} ayuda={t('En qué te pueden preguntar. Como mucho 15; pulsa Intro para añadir.')}>
        <div className="si-pe-editor-etiquetas">
          {f.habilidades.map((h) => (
            <span key={h} className="si-pe-etiqueta">{h}
              <button type="button" aria-label={t('Quitar {h}', {h})} onClick={() => setF({...f, habilidades: f.habilidades.filter((x) => x !== h)})}><Icono n="x" /></button>
            </span>
          ))}
          {f.habilidades.length < 15 && (
            <input value={nueva} maxLength={40} placeholder={t('Añadir…')} onChange={(e) => setNueva(e.target.value)} onBlur={anadir}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); anadir(); } }} />
          )}
        </div>
      </Campo>
      <Campo etiqueta={t('Idiomas')}><input className="si-input" value={f.idiomas} onChange={campo('idiomas')} maxLength={200} placeholder={t('Español, Inglés…')} /></Campo>
      <Campo etiqueta={t('Cumpleaños')} ayuda={t('Sin el año. Solo aparece en Celebraciones si lo marcas como visible.')}>
        <div className="si-fila">
          <select className="si-select" value={f.dia} onChange={campo('dia')} aria-label={t('Día')}>
            <option value="">{t('Día')}</option>{dias.map((x) => <option key={x} value={x}>{Number(x)}</option>)}
          </select>
          <select className="si-select" value={f.mes} onChange={campo('mes')} aria-label={t('Mes')}>
            <option value="">{t('Mes')}</option>
            {meses.map((m) => <option key={m} value={m}>{fecha(`2000-${m}-01`, {month: 'long'})}</option>)}
          </select>
          <label className="si-casilla"><input type="checkbox" checked={f.cumpleVisible} onChange={(e) => setF({...f, cumpleVisible: e.target.checked})} /> {t('Visible para todos')}</label>
        </div>
      </Campo>
    </Modal>
  );
}

// =========================================================================================== RRHH: alta y datos de organización

function DatosRrhh({d, persona, onCerrar, onGuardado}) {
  const {api, avisar} = useSuite();
  const nueva = !persona;
  const [f, setF] = useState(nueva
    ? {usuario: '', nombre: '', puesto: '', departamento: '', responsable: '', rol: 'EMPLEADO', email: '', sede: '', ubicacion: '',
      incorporacion: new Date().toISOString().slice(0, 10), diasVacaciones: '22', diasPropios: '2'}
    : {nombre: persona.nombre, puesto: persona.puesto || '', departamento: persona.departamento || '',
      responsable: persona.responsable ? persona.responsable.usuario : '', rol: persona.rol, email: persona.email || '', sede: persona.sede || '',
      ubicacion: persona.ubicacion || '', incorporacion: persona.incorporacion || '',
      diasVacaciones: String(persona.rrhhDatos ? persona.rrhhDatos.diasVacaciones : 22), diasPropios: String(persona.rrhhDatos ? persona.rrhhDatos.diasPropios : 2)});
  const [guardando, setGuardando] = useState(false);
  const campo = (k) => (e) => setF({...f, [k]: e.target.value});
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = nueva ? await api('personas.alta', f) : await api('personas.editar', {...f, usuario: persona.usuario});
      avisar(r.mensaje);
      onGuardado(r.usuario);
    } catch (e) { avisar(e.message, 'rojo'); setGuardando(false); }
  };
  const posibles = d.personas.filter((p) => !persona || p.usuario !== persona.usuario);
  return (
    <Modal titulo={nueva ? t('Dar de alta a una persona') : t('Datos de organización de {nombre}', {nombre: persona.nombre})} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton><Boton tipo="primario" disabled={guardando} onClick={guardar}>{nueva ? t('Dar de alta') : t('Guardar')}</Boton></>}>
      {nueva && <p className="si-tenue">{t('Crea la ficha de ÓRBITA de un usuario que ya existe en DX: sin ficha, DX le deja entrar pero las aplicaciones de ÓRBITA no.')}</p>}
      {nueva && <Campo etiqueta={t('Usuario de DX')}><input className="si-input" value={f.usuario} onChange={campo('usuario')} autoFocus /></Campo>}
      <Campo etiqueta={t('Nombre y apellidos')}><input className="si-input" value={f.nombre} onChange={campo('nombre')} maxLength={120} /></Campo>
      <div className="si-rejilla-2">
        <Campo etiqueta={t('Puesto')}><input className="si-input" value={f.puesto} onChange={campo('puesto')} maxLength={120} /></Campo>
        <Campo etiqueta={t('Departamento')}>
          <input className="si-input" list="si-pe-departamentos" value={f.departamento} onChange={campo('departamento')} maxLength={80} />
          <datalist id="si-pe-departamentos">{d.departamentos.map((x) => <option key={x} value={x} />)}</datalist>
        </Campo>
        <Campo etiqueta={t('Responsable')} ayuda={t('Aprueba sus solicitudes. Sin responsable, se aprueban solas.')}>
          <select className="si-select" value={f.responsable} onChange={campo('responsable')}>
            <option value="">{t('Sin responsable')}</option>
            {posibles.map((p) => <option key={p.usuario} value={p.usuario}>{p.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={t('Rol en ÓRBITA')}>
          <select className="si-select" value={f.rol} onChange={campo('rol')} disabled={persona && persona.yo}>
            {d.roles.map((r) => <option key={r} value={r}>{t(ROLES[r] || r)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={t('Correo')}><input className="si-input" type="email" value={f.email} onChange={campo('email')} maxLength={160} /></Campo>
        <Campo etiqueta={t('Sede')}>
          <input className="si-input" list="si-pe-sedes" value={f.sede} onChange={campo('sede')} maxLength={80} />
          <datalist id="si-pe-sedes">{d.sedes.map((x) => <option key={x} value={x} />)}</datalist>
        </Campo>
        <Campo etiqueta={t('En la empresa desde')}><input className="si-input" type="date" value={f.incorporacion} onChange={campo('incorporacion')} /></Campo>
        <Campo etiqueta={t('Dónde encontrarle')}><input className="si-input" value={f.ubicacion} onChange={campo('ubicacion')} maxLength={80} /></Campo>
        <Campo etiqueta={t('Días de vacaciones al año')}><input className="si-input" type="number" min={0} max={60} value={f.diasVacaciones} onChange={campo('diasVacaciones')} /></Campo>
        <Campo etiqueta={t('Días de asuntos propios')}><input className="si-input" type="number" min={0} max={60} value={f.diasPropios} onChange={campo('diasPropios')} /></Campo>
      </div>
    </Modal>
  );
}

// =========================================================================================== Organigrama

function Organigrama({onAbrir, version}) {
  const [d, error] = useDatos('personas.organigrama', {}, [version]);
  const [abiertos, setAbiertos] = useState(null);
  const [q, setQ] = useState('');
  // Padre de cada persona y todas las personas, para abrir las ramas que llevan a una búsqueda
  const {padre, todas} = useMemo(() => {
    const pa = {}, to = [];
    const recorrer = (n, p) => { to.push(n); pa[n.usuario] = p; n.equipo.forEach((h) => recorrer(h, n.usuario)); };
    if (d) d.arbol.forEach((n) => recorrer(n, null));
    return {padre: pa, todas: to};
  }, [d]);
  // Al empezar: abiertas las ramas que llevan hasta mí y el primer nivel
  useEffect(() => {
    if (d && !abiertos) setAbiertos(new Set([...d.cadena, ...d.arbol.map((n) => n.usuario)]));
  }, [d, abiertos]);
  const coinciden = useMemo(() => {
    const w = plano(q).trim();
    if (!w) return new Set();
    return new Set(todas.filter((n) => plano(`${n.nombre} ${n.puesto} ${n.departamento}`).includes(w)).map((n) => n.usuario));
  }, [q, todas]);
  useEffect(() => {
    if (!coinciden.size) return;
    setAbiertos((a) => {
      const s = new Set(a || []);
      coinciden.forEach((u) => { for (let p = padre[u]; p; p = padre[p]) s.add(p); });
      return s;
    });
  }, [coinciden, padre]);
  // En pantallas estrechas el árbol se desplaza en horizontal: se empieza mostrando a la persona que mira
  const listo = !!(d && abiertos);
  useEffect(() => {
    if (!listo) return;
    const caja = document.querySelector('.si-pe-org'), yo = caja && caja.querySelector('.si-pe-yo');
    if (caja && yo && caja.scrollWidth > caja.clientWidth) {
      const c = caja.getBoundingClientRect(), y = yo.getBoundingClientRect();
      caja.scrollLeft += y.left - c.left - (c.width - y.width) / 2;
    }
  }, [listo]);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d || !abiertos) return <Cargando />;
  const alternar = (u) => setAbiertos((a) => { const s = new Set(a); if (s.has(u)) s.delete(u); else s.add(u); return s; });
  const todo = () => setAbiertos(new Set(todas.filter((n) => n.equipo.length).map((n) => n.usuario)));
  const nada = () => setAbiertos(new Set());
  const rama = (lista) => (
    <ul>
      {lista.map((n) => (
        <li key={n.usuario}>
          <NodoOrganigrama n={n} yo={n.usuario === d.yo} marcado={coinciden.has(n.usuario)} abierto={abiertos.has(n.usuario)}
            onAbrir={onAbrir} onAlternar={() => alternar(n.usuario)} />
          {n.equipo.length > 0 && abiertos.has(n.usuario) && rama(n.equipo)}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <div className="si-seccion-cab">
        <h3>{t('Organigrama')} <span className="si-tenue">· {plural(d.total, 'persona', 'personas')}</span></h3>
        <div className="si-fila">
          <Buscador valor={q} onCambiar={setQ} placeholder={t('Buscar en el organigrama')} />
          <Boton onClick={todo}>{t('Abrir todo')}</Boton>
          <Boton onClick={nada}>{t('Cerrar todo')}</Boton>
        </div>
      </div>
      {q && !coinciden.size && <p className="si-tenue">{t('Nadie coincide con la búsqueda.')}</p>}
      <div className="si-pe-org" role="tree" aria-label={t('Organigrama')}>{rama(d.arbol)}</div>
    </>
  );
}

function NodoOrganigrama({n, yo, marcado, abierto, onAbrir, onAlternar}) {
  return (
    <div className={`si-pe-nodo${yo ? ' si-pe-yo' : ''}${marcado ? ' si-pe-marcado' : ''}`} role="treeitem" aria-expanded={n.equipo.length ? abierto : undefined}>
      <button type="button" className="si-pe-nodo-persona" onClick={() => onAbrir(n.usuario)}>
        <Foto persona={n} tam={40} />
        <span><strong>{n.nombre}</strong><small>{n.puesto}</small><small className="si-pe-dep">{n.departamento}</small></span>
      </button>
      {n.equipo.length > 0 && (
        <button type="button" className="si-pe-nodo-equipo" onClick={onAlternar} aria-label={abierto ? t('Ocultar su equipo') : t('Ver su equipo')}>
          <Icono n="abajo" className={abierto ? 'si-pe-girado' : ''} /> {plural(n.total, 'persona', 'personas')}
        </button>
      )}
    </div>
  );
}

// =========================================================================================== Reconocimientos

function Reconocimientos({onAbrir, onReconocer, version}) {
  const {api, avisar} = useSuite();
  const [filtro, setFiltro] = useState('');
  const [d, error, recargar] = useDatos('reconocimientos.lista', {valor: filtro || undefined}, [filtro, version]);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const quitar = async (r) => {
    if (!window.confirm(t('¿Quitar este reconocimiento?'))) return;
    try { const x = await api('reconocimientos.borrar', {id: r.id}); avisar(x.mensaje); recargar(); } catch (e) { avisar(e.message, 'rojo'); }
  };
  return (
    <>
      <section className="si-pe-gracias">
        <div>
          <h3>{t('Dar las gracias también es trabajo en equipo')}</h3>
          <p className="si-tenue">{t('Reconoce en público a un compañero: lo ve toda la empresa y le llega un aviso a esa persona y a su responsable.')}</p>
          <p className="si-pe-mis-cifras">{t('Has recibido {r} · has enviado {e}', {r: d.recibidos, e: d.enviados})}</p>
        </div>
        <Boton tipo="primario" icono="corazon" onClick={() => onReconocer(true)}>{t('Dar las gracias')}</Boton>
      </section>
      <div className="si-pe-filtros" role="group" aria-label={t('Motivo')}>
        <button type="button" className={`si-pe-chip${!filtro ? ' activa' : ''}`} aria-pressed={!filtro} onClick={() => setFiltro('')}>{t('Todos')}</button>
        {d.valores.map((v) => (
          <button key={v} type="button" className={`si-pe-chip${filtro === v ? ' activa' : ''}`} aria-pressed={filtro === v} onClick={() => setFiltro(filtro === v ? '' : v)}>
            <span style={{color: valor(v).color}}><Icono n={valor(v).icono} /></span>{t(valor(v).nombre)}
          </button>
        ))}
      </div>
      {!d.reconocimientos.length ? <Vacio icono="corazon">{t('Todavía no hay reconocimientos.')}</Vacio> : (
        <ul className="si-pe-muro">
          {d.reconocimientos.map((r) => (
            <li key={r.id} className="si-pe-reconocimiento" style={{'--valor': valor(r.valor).color}}>
              <header>
                <span className="si-pe-valor"><Icono n={valor(r.valor).icono} /> {t(valor(r.valor).nombre)}</span>
                <small>{haceCuanto(r.creado)}</small>
              </header>
              <button type="button" className="si-pe-mini" onClick={() => onAbrir(r.para.usuario)}>
                <Avatar nombre={r.para.nombre} tam={40} /><span><strong>{r.para.nombre}</strong><small>{r.para.puesto}</small></span>
              </button>
              <q>{r.texto}</q>
              <footer>
                <button type="button" className="si-enlace" onClick={() => onAbrir(r.de.usuario)}>{t('de {nombre}', {nombre: r.de.nombre})}</button>
                {r.puedeBorrar && <button type="button" className="si-icono-boton" onClick={() => quitar(r)} aria-label={t('Quitar')} title={t('Quitar')}><Icono n="papelera" /></button>}
              </footer>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Reconocer({para, yo, onCerrar, onEnviado}) {
  const {api, avisar} = useSuite();
  const [d] = useDatos('personas.directorio', {}, []);
  const [f, setF] = useState({para, valor: '', texto: ''});
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await api('reconocimientos.enviar', f);
      avisar(r.mensaje);
      onEnviado();
      onCerrar();
    } catch (e) { avisar(e.message, 'rojo'); setEnviando(false); }
  };
  const destinatario = d && d.personas.find((p) => p.usuario === f.para);
  return (
    <Modal titulo={t('Dar las gracias')} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton>
        <Boton tipo="primario" icono="enviar" disabled={enviando || !f.para || !f.valor || !f.texto.trim()} onClick={enviar}>{t('Publicar')}</Boton></>}>
      {!d ? <Cargando /> : (
        <>
          <Campo etiqueta={t('¿A quién?')}>
            <select className="si-select" value={f.para} onChange={(e) => setF({...f, para: e.target.value})}>
              <option value="">{t('Elige a un compañero')}</option>
              {d.personas.filter((p) => p.usuario !== yo.usuario).map((p) => <option key={p.usuario} value={p.usuario}>{p.nombre} · {p.puesto}</option>)}
            </select>
          </Campo>
          <Campo etiqueta={t('¿Por qué?')}>
            <div className="si-pe-elegir-valor" role="radiogroup">
              {Object.entries(VALORES_RECONOCIMIENTO).map(([k, v]) => (
                <button key={k} type="button" role="radio" aria-checked={f.valor === k} className={f.valor === k ? 'activa' : ''} style={{'--valor': v.color}}
                  onClick={() => setF({...f, valor: k})}>
                  <Icono n={v.icono} /><strong>{t(v.nombre)}</strong>
                </button>
              ))}
            </div>
          </Campo>
          <Campo etiqueta={t('Tu mensaje')} ayuda={t('{n} de 300 caracteres', {n: f.texto.length})}>
            <textarea className="si-input" rows={3} maxLength={300} value={f.texto} onChange={(e) => setF({...f, texto: e.target.value})}
              placeholder={destinatario ? t('Gracias, {nombre}, por…', {nombre: destinatario.nombre.split(' ')[0]}) : t('Gracias por…')} />
          </Campo>
          <p className="si-tenue">{t('Lo verá toda la empresa en Reconocimientos y en su ficha.')}</p>
        </>
      )}
    </Modal>
  );
}

