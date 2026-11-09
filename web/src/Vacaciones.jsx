// Vacaciones y ausencias: saldo, solicitudes y calendario del equipo.
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Avatar, Boton, Campo, Cargando, ESTADOS, Fallo, Insignia, Modal, Pestanas, SelectorMes, TIPOS_AUSENCIA, Tarjeta, Vacio,
  dosCifras, fecha, iso, laborables, plural, rango, useDatos, useSuite,
} from './ui.jsx';
import {BotonConversacion, Conversacion} from './social.jsx';
import {lang, locale, t} from './i18n.js';
import {Icono} from './iconos.jsx';

const ICONO_AUSENCIA = {VACACIONES: 'sol', ASUNTOS_PROPIOS: 'calendario', PERMISO: 'documento', BAJA: 'salud'};
const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MESES = () => Array.from({length: 12}, (_, m) => mayuscula(new Date(2000, m, 1).toLocaleDateString(locale(), {month: 'long'})));
/** Iniciales de los días de la semana, empezando en lunes y en domingo. */
const SEMANA_L = () => (lang() === 'en' ? 'MTWTFSS' : 'LMXJVSD');
const SEMANA_D = () => (lang() === 'en' ? 'SMTWTFS' : 'DLMXJVS');
const diasEntre = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

export function Vacaciones({yo}) {
  const [res, error, , fijar] = useDatos('vac.resumen', {}, []);
  const [pestana, setPestana] = useState('anio');
  const [nueva, setNueva] = useState(null);
  const [version, setVersion] = useState(0);
  const pedirRango = useCallback((desde, hasta) => setNueva({desde, hasta}), []);
  if (error) return <Fallo>{error}</Fallo>;
  if (!res) return <Cargando />;
  const actualizar = (r) => { fijar(r); setVersion((v) => v + 1); };
  return (
    <>
      <div className="si-vac-cabecera">
        <AnilloSaldo titulo={t('Vacaciones {anio}', {anio: res.anio})} s={res.vacaciones} color="#0b5fff" />
        <div className="si-vac-mini">
          <MiniSaldo titulo={t('Asuntos propios')} s={res.propios} color="var(--si-violeta)" icono="calendario" />
          <div className="si-vac-pendientes">
            <span><Icono n="reloj_arena" /></span>
            <div><strong>{plural(res.vacaciones.pendientes + res.propios.pendientes, 'día', 'días')}</strong>
              <small>{res.aprobador ? t('esperando aprobación de {quien}', {quien: res.aprobador.split(' ')[0]}) : t('esperando aprobación')}</small></div>
          </div>
        </div>
        <CuentaAtras proxima={res.proxima || res.solicitudes.filter((s) => s.estado === 'PENDIENTE' && s.desde > iso(new Date()))
          .sort((a, b) => (a.desde < b.desde ? -1 : 1))[0]} onPedir={() => setNueva({})} />
      </div>
      <Pestanas activa={pestana} onCambiar={setPestana} pestanas={[
        {id: 'anio', nombre: t('Mi año')},
        {id: 'solicitudes', nombre: t('Mis solicitudes'), cuenta: res.solicitudes.filter((s) => s.estado === 'PENDIENTE').length},
        {id: 'calendario', nombre: t(yo.tieneEquipo ? 'Cuadrante de mi equipo' : 'Cuadrante del equipo')},
      ]} />
      {pestana === 'anio' && <MiAnio version={version} yo={yo} onPedir={pedirRango} />}
      {pestana === 'solicitudes' && <Solicitudes res={res} onCambio={actualizar} />}
      {pestana === 'calendario' && <CalendarioEquipo version={version} yo={yo} />}
      {nueva && <NuevaSolicitud yo={yo} res={res} inicial={nueva} onCerrar={() => setNueva(null)}
        onHecho={(r) => { setNueva(null); actualizar(r); }} />}
    </>
  );
}

/** Anillo con los días aprobados, pendientes y libres. */
function AnilloSaldo({titulo, s, color}) {
  const r = 52, l = 2 * Math.PI * r, tot = Math.max(1, s.total);
  const ap = (s.aprobados / tot) * l, pe = (s.pendientes / tot) * l;
  return (
    <div className="si-vac-anillo">
      <svg viewBox="0 0 130 130" aria-hidden="true">
        <circle cx="65" cy="65" r={r} className="pista" />
        <circle cx="65" cy="65" r={r} className="seg" stroke={color} strokeOpacity=".9" strokeDasharray={`${ap} ${l}`} transform="rotate(-90 65 65)" />
        <circle cx="65" cy="65" r={r} className="seg" stroke={color} strokeOpacity=".35" strokeDasharray={`${pe} ${l}`}
          strokeDashoffset={-ap} transform="rotate(-90 65 65)" />
        <text x="65" y="66" className="cifra">{s.disponibles}</text>
        <text x="65" y="86" className="sub">{t('días libres')}</text>
      </svg>
      <div className="si-vac-anillo-datos">
        <span className="si-etiqueta">{titulo}</span>
        <strong>{t('{n} días al año', {n: s.total})}</strong>
        <span><i style={{background: color}} />{plural(s.aprobados, 'disfrutado o aprobado', 'disfrutados o aprobados')}</span>
        <span><i style={{background: color, opacity: .35}} />{plural(s.pendientes, 'pendiente', 'pendientes')}</span>
        <span><i className="libre" />{plural(s.disponibles, 'por planificar', 'por planificar')}</span>
      </div>
    </div>
  );
}

function MiniSaldo({titulo, s, color, icono}) {
  return (
    <div className="si-vac-minisaldo">
      <span className="si-vac-mini-icono"><Icono n={icono} /></span>
      <div>
        <small>{titulo}</small>
        <strong>{s.disponibles} <em>{t('de {total}', {total: s.total})}</em></strong>
        <div className="si-puntos-saldo">
          {Array.from({length: s.total}, (_, i) => (
            <i key={i} style={i < s.aprobados ? {background: color} : i < s.aprobados + s.pendientes ? {background: color, opacity: .35} : {}} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Cuenta atrás hasta la próxima ausencia aprobada. */
function CuentaAtras({proxima, onPedir}) {
  const hoy = iso(new Date());
  let titulo, sub;
  if (!proxima) { titulo = t('¿Planeamos algo?'); sub = t('No tienes ausencias aprobadas próximamente.'); }
  else if (proxima.desde <= hoy) {
    titulo = t('¡Disfruta!');
    sub = t('Estás de {tipo} hasta el {fecha}', {tipo: TIPOS_AUSENCIA[proxima.tipo].nombre.toLowerCase(), fecha: fecha(proxima.hasta)});
  }
  else {
    const n = diasEntre(hoy, proxima.desde);
    titulo = n === 1 ? t('¡Mañana empiezan!') : t('Faltan {n} días', {n});
    sub = `${TIPOS_AUSENCIA[proxima.tipo].nombre} · ${rango(proxima.desde, proxima.hasta)} · ${plural(proxima.dias, 'día laborable', 'días laborables')}`
      + (proxima.estado === 'PENDIENTE' ? ` · ${t('pendiente de aprobar')}` : '');
  }
  return (
    <div className={`si-vac-cuenta${proxima ? '' : ' vacia'}`}>
      <span className="si-vac-cuenta-icono"><Icono n={proxima ? ICONO_AUSENCIA[proxima.tipo] : 'calendario'} /></span>
      <small>{t('Próxima ausencia')}</small>
      <strong>{titulo}</strong>
      <span>{sub}</span>
      <button type="button" className="si-vac-pedir" onClick={onPedir}><Icono n="mas" /> {t('Solicitar ausencia')}</button>
    </div>
  );
}

// ---------- Mi año: los 12 meses, seleccionar días arrastrando ----------
function MiAnio({version, yo, onPedir}) {
  const hoyD = new Date();
  const hoy = iso(hoyD);
  const [anio, setAnio] = useState(hoyD.getFullYear());
  const [datos, error] = useDatos('vac.anio', {anio}, [anio, version]);
  const [sel, setSelEstado] = useState(null); // {a, b}
  const selRef = useRef(null);
  const setSel = (s) => { selRef.current = typeof s === 'function' ? s(selRef.current) : s; setSelEstado(selRef.current); };
  const [arrastrando, setArrastrando] = useState(false);
  useEffect(() => {
    if (!arrastrando) return undefined;
    const fin = () => {
      const s = selRef.current;
      setArrastrando(false);
      setSel(null);
      if (s) onPedir(s.a <= s.b ? s.a : s.b, s.a <= s.b ? s.b : s.a);
    };
    window.addEventListener('mouseup', fin);
    return () => window.removeEventListener('mouseup', fin);
  }, [arrastrando, onPedir]);
  if (error) return <Fallo>{error}</Fallo>;
  if (!datos) return <Cargando />;

  const festivos = Object.fromEntries(datos.festivos.map((f) => [f.fecha, f.nombre]));
  const mia = (d) => datos.mias.find((a) => a.desde <= d && a.hasta >= d);
  const [sd, sh] = sel ? (sel.a <= sel.b ? [sel.a, sel.b] : [sel.b, sel.a]) : [null, null];
  const usados = {};
  datos.mias.forEach((a) => { usados[a.tipo] = (usados[a.tipo] || 0) + a.dias; });

  return (
    <Tarjeta className="si-mi-anio"
      titulo={<div className="si-selector-mes">
        <button type="button" onClick={() => setAnio(anio - 1)} aria-label={t('Año anterior')}><Icono n="izquierda" /></button>
        <span>{anio}</span>
        <button type="button" onClick={() => setAnio(anio + 1)} aria-label={t('Año siguiente')}><Icono n="derecha" /></button>
      </div>}
      accion={<span className="si-tenue si-pista"><Icono n="puntero" /> {t('Arrastra sobre los días para pedirlos')}</span>}>
      <div className="si-anio-resumen">
        {Object.entries(TIPOS_AUSENCIA).map(([k, ti]) => (
          <span key={k}><i style={{background: ti.color}} />{ti.nombre} <b>{usados[k] || 0}</b></span>
        ))}
        <span><i className="pendiente" />{t('Pendiente')}</span>
        <span><i className="festivo" />{t('Festivo')}</span>
        <span><i className="equipo" />{t('Falta alguien del equipo')}</span>
      </div>
      <div className="si-anio" onMouseLeave={() => {}}>
        {MESES().map((nombre, m) => {
          const primero = new Date(anio, m, 1);
          const hueco = (primero.getDay() + 6) % 7;
          const n = new Date(anio, m + 1, 0).getDate();
          return (
            <div key={m} className={`si-mes${anio === hoyD.getFullYear() && m === hoyD.getMonth() ? ' actual' : ''}`}>
              <h5>{nombre}</h5>
              <div className="si-mes-rejilla">
                {[...SEMANA_L()].map((d, i) => <b key={i}>{d}</b>)}
                {Array.from({length: hueco}, (_, i) => <span key={'h' + i} />)}
                {Array.from({length: n}, (_, i) => {
                  const d = `${anio}-${dosCifras(m + 1)}-${dosCifras(i + 1)}`;
                  const w = (hueco + i) % 7;
                  const a = mia(d);
                  const finde = w >= 5;
                  const eq = datos.equipo[d];
                  const seleccionado = sd && d >= sd && d <= sh;
                  const clases = ['si-dia-anio', finde && 'finde', festivos[d] && 'festivo', d === hoy && 'hoy', d < hoy && 'pasado',
                    a && !finde && !festivos[d] && 'aus', a && a.estado === 'PENDIENTE' && 'pendiente', seleccionado && 'sel']
                    .filter(Boolean).join(' ');
                  const titulo = [festivos[d], a && `${TIPOS_AUSENCIA[a.tipo].nombre} (${ESTADOS[a.estado].nombre.toLowerCase()})`,
                    eq && `${t('Fuera:')} ${eq.map((x) => t(x.nombre) + (x.estado === 'PENDIENTE' ? ` (${t('pendiente')})` : '')).join(', ')}`].filter(Boolean).join(' · ');
                  return (
                    <button key={d} type="button" className={clases} title={titulo}
                      style={a ? {'--c': TIPOS_AUSENCIA[a.tipo].color} : undefined}
                      onMouseDown={(e) => { if (finde || festivos[d] || (d < hoy)) return; e.preventDefault(); setSel({a: d, b: d}); setArrastrando(true); }}
                      onMouseEnter={() => { if (arrastrando) setSel((s) => s && {...s, b: d}); }}>
                      {i + 1}
                      {eq && !finde && <i className={`si-dia-equipo${eq.length > 1 ? ' varios' : ''}`} />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}

function Solicitudes({res, onCambio}) {
  const {api, avisar} = useSuite();
  const [chat, setChat] = useState(null);
  const hoy = iso(new Date());
  const cancelar = async (s) => {
    if (!window.confirm(t('¿Cancelar la solicitud de {tipo} ({rango})?', {tipo: TIPOS_AUSENCIA[s.tipo].nombre.toLowerCase(), rango: rango(s.desde, s.hasta)}))) return;
    try {
      const r = await api('vac.cancelar', {id: s.id});
      avisar(r.mensaje);
      onCambio(r);
    } catch (e) { avisar(e.message, 'rojo'); }
  };
  if (!res.solicitudes.length) return <Tarjeta><Vacio icono="calendario">{t('Todavía no has pedido ninguna ausencia.')}</Vacio></Tarjeta>;
  return (
    <Tarjeta>
      <ul className="si-lista">
        {res.solicitudes.map((s) => {
          const ti = TIPOS_AUSENCIA[s.tipo], e = ESTADOS[s.estado];
          const cancelable = s.estado === 'PENDIENTE' || (s.estado === 'APROBADA' && s.desde > hoy);
          return (
            <li key={s.id} className={`si-solicitud${s.estado === 'CANCELADA' || s.estado === 'RECHAZADA' ? ' si-apagado' : ''}`}>
              <span className="si-tipo-punto" style={{background: ti.color}} />
              <div className="si-solicitud-datos">
                <strong>{ti.nombre} · {plural(s.dias, 'día', 'días')}</strong>
                <span>{rango(s.desde, s.hasta)}</span>
                {s.comentario && <q>{s.comentario}</q>}
                {s.comentarioResp && <p className="si-respuesta"><b>{s.aprobador}:</b> {s.comentarioResp}</p>}
                {s.estado !== 'CANCELADA' && <BotonConversacion cuenta={s.comentarios} abierta={chat === s.id} onAlternar={() => setChat(chat === s.id ? null : s.id)} />}
                {chat === s.id && <Conversacion clase="AUSENCIA" objeto={s.id} compacta />}
              </div>
              <div className="si-solicitud-estado">
                <Insignia tono={e.tono}>{e.nombre}</Insignia>
                <small>{s.estado === 'PENDIENTE' ? t('Pedida el {fecha}', {fecha: fecha(s.creado)}) : s.aprobador && s.estado !== 'CANCELADA' ? t('por {quien}', {quien: s.aprobador}) : ''}</small>
                {cancelable && <button type="button" className="si-enlace" onClick={() => cancelar(s)}>{t('Cancelar')}</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}

function NuevaSolicitud({yo, res, inicial, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const [tipo, setTipo] = useState('VACACIONES');
  const [desde, setDesde] = useState(inicial.desde || iso(manana));
  const [hasta, setHasta] = useState(inicial.hasta || inicial.desde || iso(manana));
  const [anioEq] = useDatos('vac.anio', {anio: Number(desde.slice(0, 4))}, [desde.slice(0, 4)]);
  // Compañeros que faltan alguno de esos días (como en los planificadores de vacaciones de equipo)
  const coinciden = {};
  if (anioEq) {
    Object.entries(anioEq.equipo).forEach(([d, l]) => {
      if (d >= desde && d <= hasta) l.forEach((x) => { coinciden[x.nombre] = (coinciden[x.nombre] || 0) + 1; });
    });
  }
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const dias = laborables(desde, hasta, yo.festivos);
  const saldo = tipo === 'VACACIONES' ? res.vacaciones : tipo === 'ASUNTOS_PROPIOS' ? res.propios : null;
  const restante = saldo ? saldo.disponibles - dias : null;
  const festivosEnRango = yo.festivos.filter((f) => f.fecha >= desde && f.fecha <= hasta);
  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await api('vac.solicitar', {tipo, desde, hasta, comentario});
      avisar(r.mensaje);
      onHecho(r);
    } catch (e) { avisar(e.message, 'rojo'); setEnviando(false); }
  };
  return (
    <Modal titulo={t('Solicitar ausencia')} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton>
        <Boton tipo="primario" disabled={enviando || dias === 0 || (restante !== null && restante < 0)} onClick={enviar}>
          {res.aprobador && tipo !== 'BAJA' ? t('Enviar a {quien}', {quien: res.aprobador.split(' ')[0]}) : t('Registrar')}
        </Boton></>}>
      <div className="si-tipos">
        {Object.entries(TIPOS_AUSENCIA).map(([k, ti]) => (
          <button key={k} type="button" className={tipo === k ? 'activa' : ''} onClick={() => setTipo(k)} style={{'--c': ti.color}}>
            <span className="si-tipo-icono"><Icono n={ICONO_AUSENCIA[k]} /></span>{ti.nombre}
          </button>
        ))}
      </div>
      <div className="si-rejilla-2">
        <Campo etiqueta={t('Desde')}><input className="si-input" type="date" value={desde} min={tipo === 'BAJA' ? undefined : iso(new Date())}
          onChange={(e) => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value); }} /></Campo>
        <Campo etiqueta={t('Hasta (incluido)')}><input className="si-input" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></Campo>
      </div>
      <div className={`si-calculo${restante !== null && restante < 0 ? ' error' : ''}`}>
        <strong>{plural(dias, 'día laborable', 'días laborables')}</strong>
        {saldo && <span>{restante >= 0 ? t('Te quedarán {n} de {tipo}', {n: plural(restante, 'día', 'días'), tipo: TIPOS_AUSENCIA[tipo].nombre.toLowerCase()})
          : t('Solo te quedan {n}', {n: plural(saldo.disponibles, 'día disponible', 'días disponibles')})}</span>}
        {festivosEnRango.length > 0 && <small>{t('No cuentan:')} {festivosEnRango.map((f) => `${f.nombre} (${fecha(f.fecha)})`).join(', ')}</small>}
      </div>
      {anioEq && (Object.keys(coinciden).length
        ? <div className="si-coinciden">
          <span><Icono n="personas" /> {t('Esos días también faltan:')}</span>
          {Object.entries(coinciden).map(([n, d]) => <span key={n} className="si-coincide"><Avatar nombre={n} tam={22} />{n} <small>{plural(d, 'día', 'días')}</small></span>)}
        </div>
        : <div className="si-coinciden ok"><Icono n="checkCirculo" /> {t('Nadie de tu equipo falta esos días.')}</div>)}
      <Campo etiqueta={t('Comentario (opcional)')}>
        <textarea className="si-input" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder={t('Ej.: viaje familiar')} />
      </Campo>
    </Modal>
  );
}

function CalendarioEquipo({version, yo}) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [cal, error] = useDatos('vac.calendario', {anio, mes}, [anio, mes, version]);
  return (
    <Tarjeta titulo={<SelectorMes anio={anio} mes={mes} onCambiar={(a, m) => { setAnio(a); setMes(m); }} />}
      accion={<div className="si-leyenda">
        {Object.entries(TIPOS_AUSENCIA).map(([k, ti]) => <span key={k}><i style={{background: ti.color}} />{ti.nombre}</span>)}
        <span><i className="pendiente" />{t('Pendiente')}</span><span><i className="festivo" />{t('Festivo')}</span>
      </div>}>
      {error && <Fallo>{error}</Fallo>}
      {!cal ? <Cargando /> : <Rejilla cal={cal} hoy={iso(hoy)} yo={yo} />}
    </Tarjeta>
  );
}

function Rejilla({cal, hoy}) {
  const dias = Array.from({length: cal.dias}, (_, i) => `${cal.anio}-${dosCifras(cal.mes)}-${dosCifras(i + 1)}`);
  const festivos = Object.fromEntries(cal.festivos.map((f) => [f.fecha, f.nombre]));
  const ausentes = (d) => cal.personas.filter((p) => p.ausencias.some((a) => a.estado === 'APROBADA' && a.desde <= d && a.hasta >= d)).length;
  return (
    <div className="si-tabla-envoltura">
      <table className="si-calendario">
        <thead>
          <tr>
            <th className="si-cal-persona" />
            {dias.map((d) => {
              const w = new Date(d + 'T00:00:00').getDay();
              return <th key={d} className={`${w === 0 || w === 6 ? 'finde' : ''}${festivos[d] ? ' festivo' : ''}${d === hoy ? ' hoy' : ''}`} title={festivos[d] || ''}>
                <small>{SEMANA_D()[w]}</small>{Number(d.slice(8))}
              </th>;
            })}
          </tr>
        </thead>
        <tbody>
          {cal.personas.map((p) => (
            <tr key={p.usuario} className={p.yo ? 'si-yo' : ''}>
              <th className="si-cal-persona"><div className="si-cal-quien"><Avatar nombre={p.nombre} tam={28} />
                <div><strong>{p.yo ? t('Yo') : p.nombre}</strong><small>{p.puesto}</small></div></div></th>
              {dias.map((d) => {
                const w = new Date(d + 'T00:00:00').getDay();
                const a = p.ausencias.find((x) => x.desde <= d && x.hasta >= d);
                const libre = w === 0 || w === 6 || festivos[d];
                return (
                  <td key={d} className={`${libre ? 'finde' : ''}${festivos[d] ? ' festivo' : ''}${d === hoy ? ' hoy' : ''}`}
                    title={a ? `${p.nombre}: ${TIPOS_AUSENCIA[a.tipo].nombre} (${ESTADOS[a.estado].nombre.toLowerCase()})` : festivos[d] || ''}>
                    {a && !libre && <span className={`si-cal-aus${a.estado === 'PENDIENTE' ? ' pendiente' : ''}`}
                      style={{'--c': TIPOS_AUSENCIA[a.tipo].color}} />}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="si-cal-total">
            <th className="si-cal-persona"><small>{t('Ausentes')}</small></th>
            {dias.map((d) => { const n = ausentes(d); return <td key={d}>{n ? n : ''}</td>; })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
