// Fichaje: registro de jornada (fichar, mi registro mensual con correcciones, equipo e informes de RRHH).
import React, {useEffect, useState} from 'react';
import QRCode from 'qrcode';
import {
  Avatar, Boton, Campo, Cargando, Fallo, Insignia, MARCAS, Modal, Pestanas, SelectorMes, Tarjeta,
  descargar, dosCifras, fecha, horas, hm, iso, nombreMes, traducido, useDatos, useReloj, useSuite,
} from './ui.jsx';
import {urlApp} from './social.jsx';
import {locale, t} from './i18n.js';
import {OrbitaLogo} from './marca.jsx';
import {Icono} from './iconos.jsx';

const ESTADO_DIA = traducido({
  COMPLETO: {nombre: 'Completo', tono: 'verde'},
  INCOMPLETO: {nombre: 'Falta la salida', tono: 'rojo'},
  SIN_FICHAJE: {nombre: 'Sin fichaje', tono: 'rojo'},
  AUSENCIA: {nombre: 'Ausencia', tono: 'azul'},
  FESTIVO: {nombre: 'Festivo', tono: 'violeta'},
  DESCANSO: {nombre: 'Descanso', tono: 'gris'},
  EN_CURSO: {nombre: 'Hoy', tono: 'ambar'},
  FUTURO: {nombre: '', tono: 'gris'},
});

export function Fichaje({yo}) {
  const [pestana, setPestana] = useState('registro');
  const [version, setVersion] = useState(0);
  return (
    <>
      <PanelHoy onFichado={() => setVersion((v) => v + 1)} />
      <Pestanas activa={pestana} onCambiar={setPestana} pestanas={[
        {id: 'registro', nombre: t('Mi registro')},
        yo.tieneEquipo && {id: 'equipo', nombre: t(yo.rol === 'RRHH' ? 'Plantilla ahora' : 'Mi equipo ahora')},
        yo.rol === 'RRHH' && {id: 'informes', nombre: t('Informes')},
        {id: 'tarjeta', nombre: t('Mi tarjeta de quiosco')},
      ]} />
      {pestana === 'registro' && <Registro yo={yo} version={version} />}
      {pestana === 'equipo' && <Equipo />}
      {pestana === 'informes' && <Informes />}
      {pestana === 'tarjeta' && <MiTarjeta yo={yo} />}
    </>
  );
}

// ---------- Incidencias (motivo de cada pausa) y línea de tiempo del día ----------
export const INCIDENCIAS = traducido({
  DESAYUNO: {nombre: 'Desayuno', icono: 'cafe'},
  COMIDA: {nombre: 'Comida', icono: 'cubiertos'},
  MEDICO: {nombre: 'Médico', icono: 'salud', retribuida: true},
  VISITA: {nombre: 'Visita a cliente', icono: 'coche', retribuida: true},
  GESTION: {nombre: 'Gestión personal', icono: 'nota'},
  OTRA: {nombre: 'Otro motivo', icono: 'pausa'},
});
const incid = (k) => INCIDENCIAS[k] || INCIDENCIAS.OTRA;
const aMin = (h) => { const [a, b] = h.split(':'); return Number(a) * 60 + Number(b); };
const deMin = (m) => `${dosCifras(Math.floor(m / 60) % 24)}:${dosCifras(m % 60)}`;

/** Tramos del día a partir de las marcas: trabajo, pausa o incidencia retribuida. `ahora` (minutos) cierra el tramo abierto. */
function tramos(marcas, ahora) {
  const l = [];
  let ini = null, tipo = null, inc = null;
  for (const m of marcas) {
    const x = aMin(m.hora);
    if (ini !== null) l.push({tipo, inc, desde: ini, hasta: x});
    if (m.tipo === 'ENTRADA' || m.tipo === 'REANUDAR') { tipo = 'trabajo'; inc = null; ini = x; }
    else if (m.tipo === 'PAUSA') { tipo = incid(m.incidencia).retribuida ? 'retribuida' : 'pausa'; inc = m.incidencia; ini = x; }
    else ini = null;
  }
  if (ini !== null) l.push(ahora != null ? {tipo, inc, desde: ini, hasta: Math.max(ini + 1, ahora), abierto: true}
    : {tipo: 'sincierre', desde: ini, hasta: ini + 45});
  return l;
}

/** Barra horizontal de la jornada (de `de` a `a` horas) con los tramos, la hora actual y la salida prevista. */
function LineaDia({marcas, ahora, prevista, mini, de = 7, a = 21}) {
  const tr = tramos(marcas, ahora);
  if (tr.length) {
    de = Math.min(de, Math.floor(tr[0].desde / 60));
    a = Math.max(a, Math.ceil(Math.max(tr[tr.length - 1].hasta, prevista || 0) / 60));
  }
  const ini = de * 60, fin = a * 60;
  const pos = (m) => `${((Math.min(Math.max(m, ini), fin) - ini) / (fin - ini)) * 100}%`;
  const ancho = (x) => `${((Math.min(x.hasta, fin) - Math.max(x.desde, ini)) / (fin - ini)) * 100}%`;
  const titulo = (x) => x.tipo === 'trabajo' ? `${t('Trabajo')} ${deMin(x.desde)}–${x.abierto ? t('ahora') : deMin(x.hasta)}`
    : x.tipo === 'sincierre' ? t('Sin fichaje de salida desde {hora}', {hora: deMin(x.desde)})
      : `${incid(x.inc).nombre} ${deMin(x.desde)}–${x.abierto ? t('ahora') : deMin(x.hasta)}`;
  const marcasHora = [];
  for (let h = de; h <= a; h += mini ? 4 : 2) marcasHora.push(h);
  return (
    <div className={`si-linea${mini ? ' mini' : ''}`}>
      <div className="si-linea-pista">
        {tr.map((x, i) => (
          <div key={i} className={`si-tramo si-tramo-${x.tipo}${x.abierto ? ' abierto' : ''}`} title={titulo(x)}
            style={{left: pos(x.desde), width: ancho(x)}}>
            {!mini && x.tipo !== 'trabajo' && x.tipo !== 'sincierre' && x.hasta - x.desde >= 25 && <Icono n={incid(x.inc).icono} />}
          </div>
        ))}
        {prevista != null && <div className="si-linea-prevista" style={{left: pos(prevista)}} title={`${t('Salida prevista')} ${deMin(prevista)}`} />}
        {ahora != null && !mini && <div className="si-linea-ahora" style={{left: pos(ahora)}} />}
      </div>
      {!mini && <div className="si-linea-horas">{marcasHora.map((h) => <span key={h} style={{left: pos(h * 60)}}>{h}h</span>)}</div>}
    </div>
  );
}

/** Ubicación del dispositivo (el navegador pide permiso la primera vez). */
const ubicar = () => new Promise((ok) => {
  if (!navigator.geolocation) { ok(null); return; }
  navigator.geolocation.getCurrentPosition(
    (p) => ok({lat: p.coords.latitude, lon: p.coords.longitude, precision: Math.round(p.coords.accuracy)}),
    () => ok(null), {enableHighAccuracy: true, timeout: 6000, maximumAge: 120000});
});
const urlMapa = (g) => `https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lon}#map=17/${g.lat}/${g.lon}`;

/** Botón redondo de fichar con el anillo de la jornada cumplida. */
function BotonFichar({estado, pct, minHoy, disabled, onClick}) {
  const conf = {
    FUERA: {clase: 'entrar', icono: 'entrar', texto: t('Entrar')},
    TRABAJANDO: {clase: 'salir', icono: 'salir', texto: t('Salir')},
    PAUSA: {clase: 'volver', icono: 'play', texto: t('Volver|pausa')},
  }[estado];
  const r = 98, l = 2 * Math.PI * r;
  return (
    <div className="si-fichar-boton">
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <circle cx="110" cy="110" r={r} className="si-anillo-fondo" />
        <circle cx="110" cy="110" r={r} className="si-anillo" strokeDasharray={l} strokeDashoffset={l * (1 - pct / 100)}
          transform="rotate(-90 110 110)" />
      </svg>
      <button type="button" className={`si-redondo ${conf.clase}`} disabled={disabled} onClick={onClick}>
        <span className="si-redondo-icono"><Icono n={conf.icono} /></span>
        <strong>{conf.texto}</strong>
        <small>{horas(minHoy)} · {pct}%</small>
      </button>
    </div>
  );
}

// ---------- Hoy: fichar ----------
function PanelHoy({onFichado}) {
  const {api, avisar} = useSuite();
  const [est, error, recargar, fijar] = useDatos('fichaje.estado', {}, []);
  const [cargadoEn, setCargadoEn] = useState(Date.now());
  const [modalidad, setModalidad] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [geo, setGeo] = useState({estado: 'buscando'});
  const ahora = useReloj();
  useEffect(() => { if (est) { setCargadoEn(Date.now()); if (!modalidad) setModalidad(est.modalidad); } }, [est]); // eslint-disable-line
  useEffect(() => { ubicar().then((g) => setGeo(g ? {estado: 'ok', ...g} : {estado: 'no'})); }, []);
  if (error) return <Fallo>{error}</Fallo>;
  if (!est) return <Cargando />;

  const vivo = est.cuenta ? Math.floor((ahora.getTime() - cargadoEn) / 60000) : 0;
  const minHoy = est.minutosHoy + vivo;
  const pct = est.objetivoHoy ? Math.min(100, Math.round((minHoy / est.objetivoHoy) * 100)) : 0;
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const enMarcha = est.estado !== 'FUERA';
  // Salida prevista: lo que falta de jornada desde ahora (si se está en una pausa no retribuida, cuenta desde que se vuelva)
  const prevista = enMarcha && est.objetivoHoy > minHoy ? minAhora + (est.objetivoHoy - minHoy) : null;
  const minPausa = est.estado === 'PAUSA' && est.desde ? Math.max(0, minAhora - aMin(est.desde)) : 0;

  const marcar = async (tipo, incidencia) => {
    setEnviando(true);
    try {
      // Ubicación en el momento de fichar (si el navegador la da a tiempo; si no, la última conocida)
      const g = (await ubicar()) || (geo.estado === 'ok' ? geo : null);
      if (g) setGeo({estado: 'ok', ...g});
      const r = await api('fichaje.marcar', {tipo, incidencia: incidencia || '', modalidad: modalidad || 'OFICINA',
        ...(g ? {lat: g.lat, lon: g.lon, precision: g.precision} : {})});
      fijar(r);
      onFichado();
      const hora =`${dosCifras(new Date().getHours())}:${dosCifras(new Date().getMinutes())}`;
      avisar(tipo === 'PAUSA' ? t('Pausa por {motivo} a las {hora}', {motivo: incid(incidencia).nombre.toLowerCase(), hora})
        : t('{tipo} registrada a las {hora}', {tipo: MARCAS[tipo], hora}) + (g ? ` · ${t('con ubicación')}` : ''));
    } catch (e) {
      avisar(e.message, 'rojo');
      recargar();
    } finally {
      setEnviando(false);
    }
  };
  const principal = {FUERA: 'ENTRADA', TRABAJANDO: 'SALIDA', PAUSA: 'REANUDAR'}[est.estado];
  const estadoTexto = {
    TRABAJANDO: <><i className="si-punto verde" />{t('Trabajando desde las {hora}', {hora: est.desde})}</>,
    PAUSA: <><i className="si-punto ambar" /><Icono n={incid(est.incidencia).icono} /> {t('{motivo} desde las {hora}', {motivo: incid(est.incidencia).nombre, hora: est.desde})} · {horas(minPausa)}</>,
    FUERA: <><i className="si-punto gris" />{t(est.marcas.length ? 'Jornada terminada' : 'Aún no has fichado hoy')}</>,
  }[est.estado];
  const maxSemana = Math.max(480, ...est.semana.map((d) => d.minutos));
  const pctSemana = est.objetivoSemana ? Math.min(100, Math.round(((est.minutosSemana + vivo) / est.objetivoSemana) * 100)) : 0;

  return (
    <>
    <div className="si-hoy">
      <section className="si-fichar">
        <div className="si-fichar-cab">
          <div>
            <span className="si-hora">{dosCifras(ahora.getHours())}:{dosCifras(ahora.getMinutes())}<small>:{dosCifras(ahora.getSeconds())}</small></span>
            <span className="si-fecha">{ahora.toLocaleDateString(locale(), {weekday: 'long', day: 'numeric', month: 'long'})}</span>
          </div>
          <span className="si-fichar-estado">{estadoTexto}</span>
        </div>
        {est.festivoHoy || est.ausenciaHoy
          ? <p className="si-nota">{est.festivoHoy ? t('Hoy es festivo: {nombre}.', {nombre: est.festivoHoy}) : t('Hoy tienes una ausencia aprobada.')}</p>
          : null}

        <div className="si-fichar-centro">
          <BotonFichar estado={est.estado} pct={pct} minHoy={minHoy} disabled={enviando} onClick={() => marcar(principal)} />
          <div className="si-fichar-lado">
            {est.estado === 'FUERA' && <>
              <span className="si-etiqueta">{t('¿Dónde trabajas hoy?')}</span>
              <div className="si-modalidad" role="radiogroup" aria-label={t('Modalidad')}>
                {[['OFICINA', 'oficina', t('Oficina')], ['TELETRABAJO', 'inicio', t('Teletrabajo')]].map(([v, ic, texto]) => (
                  <button key={v} type="button" role="radio" aria-checked={modalidad === v} className={modalidad === v ? 'activa' : ''}
                    onClick={() => setModalidad(v)}><Icono n={ic} /> {texto}</button>
                ))}
              </div>
            </>}
            {est.estado === 'TRABAJANDO' && <>
              <span className="si-etiqueta">{t('Hacer una pausa')}</span>
              <div className="si-incidencias">
                {Object.entries(INCIDENCIAS).map(([k, v]) => (
                  <button key={k} type="button" disabled={enviando} onClick={() => marcar('PAUSA', k)}
                    title={t(v.retribuida ? 'Cuenta como tiempo de trabajo' : 'No cuenta como tiempo de trabajo')}>
                    <Icono n={v.icono} />{v.nombre}{v.retribuida && <em>{t('retribuida')}</em>}
                  </button>
                ))}
              </div>
            </>}
            {est.estado === 'PAUSA' && <>
              <span className="si-etiqueta">{t(incid(est.incidencia).retribuida ? 'Incidencia retribuida: el tiempo cuenta como trabajo' : 'Pausa: el tiempo no cuenta como trabajo')}</span>
              <button type="button" className="si-fichar-secundario" disabled={enviando} onClick={() => marcar('SALIDA')}><Icono n="salir" /> {t('Terminar la jornada')}</button>
            </>}
            <span className={`si-geo si-geo-${geo.estado}`}>
              <Icono n="ubicacion" /> {geo.estado === 'ok' ? <>{t('Ubicación lista')} · ±{geo.precision} m</>
                : geo.estado === 'buscando' ? t('Buscando ubicación…') : t('Sin ubicación: se fichará igualmente')}
            </span>
          </div>
        </div>
      </section>

      <Tarjeta titulo={t('Mi jornada de hoy')} className="si-jornada"
        accion={<span className="si-tenue">{est.entrada ? `${t('Entrada')} ${est.entrada}` : ''}{prevista != null ? ` · ${t('Salida prevista')} ${deMin(prevista)}` : ''}</span>}>
        <LineaDia marcas={est.marcas} ahora={enMarcha ? minAhora : null} prevista={prevista} />
        <div className="si-leyenda">
          <span><i className="si-tramo-trabajo" />{t('Trabajo')}</span><span><i className="si-tramo-pausa" />{t('Pausa')}</span>
          <span><i className="si-tramo-retribuida" />{t('Incidencia retribuida')}</span><span><i className="si-leyenda-prevista" />{t('Salida prevista')}</span>
        </div>
        {est.marcas.length
          ? <ol className="si-marcajes">{[...est.marcas].reverse().map((m, i) => (
            <li key={i} className={`si-marcaje-${m.tipo.toLowerCase()}`}>
              <span className="si-marcaje-hora">{m.hora}</span>
              <span className="si-marcaje-icono"><Icono n={m.tipo === 'PAUSA' ? incid(m.incidencia).icono : {ENTRADA: 'entrar', REANUDAR: 'play', SALIDA: 'salir'}[m.tipo]} /></span>
              <span className="si-marcaje-texto">
                <strong>{m.tipo === 'PAUSA' ? `${t('Pausa')} · ${incid(m.incidencia).nombre}` : MARCAS[m.tipo]}</strong>
                <small>
                  {m.modalidad === 'TELETRABAJO' ? <><Icono n="inicio" /> {t('Teletrabajo')}</> : <><Icono n="oficina" /> {t('Oficina')}</>}
                  {' · '}{t(m.origen === 'KIOSCO' ? 'Quiosco' : m.origen === 'CORRECCION' ? 'Corrección' : 'Web')}
                  {m.geo && <> · <a href={urlMapa(m.geo)} target="_blank" rel="noreferrer"><Icono n="ubicacion" /> ±{m.geo.precision} m</a></>}
                </small>
              </span>
            </li>
          ))}</ol>
          : <p className="si-tenue si-vacio-jornada">{t('Pulsa «Entrar» para empezar la jornada.')}</p>}
      </Tarjeta>
    </div>

    <div className="si-kpis-fichaje">
      <div className="si-kpi-f"><span>{t('Trabajado hoy')}</span><strong>{horas(minHoy)}</strong>
        <small>{t('de {total}', {total: horas(est.objetivoHoy)})}{est.pausasHoy ? ` · ${t('{n} min de pausa', {n: est.pausasHoy})}` : ''}</small>
        <div className="si-barra fina"><div style={{width: `${pct}%`}} /></div></div>
      <div className="si-kpi-f"><span>{t('Esta semana')}</span><strong>{horas(est.minutosSemana + vivo)}</strong>
        <small>{t('de {total}', {total: horas(est.objetivoSemana)})}</small>
        <div className="si-barra fina"><div style={{width: `${pctSemana}%`}} /></div></div>
      <div className="si-kpi-f"><span>{t('Saldo del mes')}</span>
        <strong className={est.saldoMes < 0 ? 'si-negativo' : 'si-positivo'}>{est.saldoMes < 0 ? '−' : '+'}{horas(Math.abs(est.saldoMes))}</strong>
        <small>{t(est.saldoMes < 0 ? 'por debajo de tu jornada' : 'a tu favor (bolsa de horas)')}</small></div>
      <div className={`si-kpi-f${est.incidenciasMes ? ' alerta' : ''}`}><span>{t('Incidencias de fichaje')}</span><strong>{est.incidenciasMes}</strong>
        <small>{t(est.incidenciasMes ? 'días sin cerrar este mes: corrígelos abajo' : 'todo en orden este mes')}</small></div>
    </div>

    <div className="si-hoy-2">
      <Tarjeta titulo={t('Esta semana')} className="si-semana">
        <div className="si-progreso-cab"><strong>{horas(est.minutosSemana + vivo)}</strong><span>{t('de {total}', {total: horas(est.objetivoSemana)})}</span></div>
        <div className="si-barras">
          {est.semana.map((d) => {
            const min = d.fecha === iso(ahora) ? d.minutos + vivo : d.minutos;
            return (
              <div key={d.fecha} className="si-dia-barra" title={d.festivo || (d.ausencia ? t('Ausencia') : `${hm(min)} ${t('de {total}', {total: hm(d.objetivo)})}`)}>
                <div className="si-col">
                  {d.objetivo > 0 && <div className="si-objetivo" style={{bottom: `${(d.objetivo / maxSemana) * 100}%`}} />}
                  <div className={`si-relleno${d.festivo || d.ausencia ? ' libre' : ''}`}
                    style={{height: d.festivo || d.ausencia ? '100%' : `${(min / maxSemana) * 100}%`}} />
                </div>
                <span>{fecha(d.fecha, {weekday: 'short'}).replace('.', '')}</span>
                <small>{d.festivo ? t('Festivo') : d.ausencia ? t('Ausente') : min ? hm(min) : '–'}</small>
              </div>
            );
          })}
        </div>
      </Tarjeta>
    </div>
    </>
  );
}

// ---------- Mi registro (y el de las personas a cargo) ----------
function Registro({yo, version}) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [persona, setPersona] = useState('');
  const [equipo] = useDatos(yo.tieneEquipo ? 'fichaje.equipo' : 'yo', {}, []);
  const [datos, error, recargar] = useDatos('fichaje.mes', {anio, mes, usuario: persona}, [anio, mes, persona, version]);
  const [corregir, setCorregir] = useState(null);
  const {api, avisar} = useSuite();
  const propio = !persona || persona === yo.usuario;
  const minAhora = hoy.getHours() * 60 + hoy.getMinutes();

  const exportar = async () => {
    try {
      const r = await api('fichaje.csv', {anio, mes, ambito: 'yo'});
      descargar(r.nombre, r.contenido);
    } catch (e) { avisar(e.message, 'rojo'); }
  };

  return (
    <Tarjeta titulo={<SelectorMes anio={anio} mes={mes} onCambiar={(a, m) => { setAnio(a); setMes(m); }} />}
      accion={<div className="si-fila">
        {yo.tieneEquipo && Array.isArray(equipo) && (
          <select className="si-select" value={persona} onChange={(e) => setPersona(e.target.value)} aria-label={t('Persona')}>
            <option value="">{t('Mi registro')}</option>
            {equipo.map((p) => <option key={p.usuario} value={p.usuario}>{p.nombre}</option>)}
          </select>
        )}
        {propio && <Boton icono="descargar" onClick={exportar}>{t('Descargar CSV')}</Boton>}
      </div>}>
      {error && <Fallo>{error}</Fallo>}
      {!datos ? <Cargando /> : <>
        <div className="si-totales">
          <div><span>{t('Trabajado')}</span><strong>{horas(datos.minutos)}</strong></div>
          <div><span>{t('Teórico hasta hoy')}</span><strong>{horas(datos.objetivoHastaHoy)}</strong></div>
          <div><span>{t('Diferencia')}</span>
            <strong className={datos.minutos - datos.objetivoHastaHoy < 0 ? 'si-negativo' : 'si-positivo'}>
              {datos.minutos - datos.objetivoHastaHoy < 0 ? '−' : '+'}{horas(Math.abs(datos.minutos - datos.objetivoHastaHoy))}
            </strong></div>
          <div><span>{t('Incidencias')}</span><strong>{datos.dias.filter((d) => d.estado === 'INCOMPLETO' || d.estado === 'SIN_FICHAJE').length}</strong></div>
        </div>
        <div className="si-tabla-envoltura">
          <table className="si-tabla">
            <thead><tr><th>{t('Día')}</th><th className="si-col-linea">{t('Jornada')} <small className="si-tenue">7h – 21h</small></th><th>{t('Entrada')}</th><th>{t('Salida')}</th><th>{t('Pausas')}</th><th>{t('Trabajado')}</th><th>{t('Modalidad')}</th><th>{t('Estado')}</th><th /></tr></thead>
            <tbody>
              {datos.dias.filter((d) => d.estado !== 'FUTURO').reverse().map((d) => {
                const e = ESTADO_DIA[d.estado];
                const apagado = d.estado === 'DESCANSO' || d.estado === 'FESTIVO';
                const abierto = d.estado === 'EN_CURSO' && d.marcas.length && d.marcas[d.marcas.length - 1].tipo !== 'SALIDA';
                const retrib = [...new Set(d.marcas.filter((m) => m.tipo === 'PAUSA' && incid(m.incidencia).retribuida).map((m) => m.incidencia))];
                return (
                  <tr key={d.fecha} className={apagado ? 'si-apagado' : ''}>
                    <td className="si-dia">{fecha(d.fecha)}</td>
                    <td className="si-col-linea">{d.marcas.length ? <LineaDia mini marcas={d.marcas} ahora={abierto ? minAhora : null} /> : null}</td>
                    <td>{d.entrada || '–'}</td>
                    <td>{d.salida || (d.estado === 'INCOMPLETO' ? <span className="si-negativo">—</span> : '–')}</td>
                    <td>{d.pausas ? `${d.pausas} min` : '–'}</td>
                    <td><strong>{d.minutos ? hm(d.minutos) : '–'}</strong>{d.objetivo > 0 && <small className="si-tenue"> / {hm(d.objetivo)}</small>}</td>
                    <td className="si-modalidad-celda">{d.modalidad === 'TELETRABAJO' ? <><Icono n="inicio" /> {t('Teletrabajo')}</> : d.modalidad ? <><Icono n="oficina" /> {t('Oficina')}</> : ''}</td>
                    <td>
                      <Insignia tono={e.tono}>{d.festivo || (d.estado === 'AUSENCIA' ? nombreAusencia(d.ausencia) : e.nombre)}</Insignia>
                      {retrib.map((k) => <Insignia key={k} tono="azul"><Icono n={incid(k).icono} /> {incid(k).nombre}</Insignia>)}
                      {d.corregido && <Insignia tono="azul">{t('Corregido')}</Insignia>}
                      {d.correccionPendiente && <Insignia tono="ambar">{t('Corrección pendiente')}</Insignia>}
                    </td>
                    <td className="si-derecha">
                      {propio && !apagado && d.estado !== 'AUSENCIA' && !d.correccionPendiente && (
                        <button type="button" onClick={() => setCorregir(d)}
                          className={`si-enlace si-corregir${d.estado === 'INCOMPLETO' || d.estado === 'SIN_FICHAJE' ? ' si-incidencia' : ''}`}>
                          {t(d.estado === 'INCOMPLETO' || d.estado === 'SIN_FICHAJE' ? 'Corregir' : 'Solicitar corrección')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="si-tenue si-legal">{t('Los fichajes no se pueden modificar: las correcciones las aprueba tu responsable y quedan registradas como tales (registro de jornada, art. 34.9 del Estatuto de los Trabajadores).')}</p>
      </>}
      {corregir && <Correccion dia={corregir} onCerrar={() => setCorregir(null)} onHecho={() => { setCorregir(null); recargar(); }} />}
    </Tarjeta>
  );
}

const nombreAusencia = (tipo) => t({VACACIONES: 'Vacaciones', ASUNTOS_PROPIOS: 'Asuntos propios', PERMISO: 'Permiso', BAJA: 'Baja médica'}[tipo] || 'Ausencia');

function Correccion({dia, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const [tipo, setTipo] = useState(dia.estado === 'INCOMPLETO' ? 'SALIDA' : 'ENTRADA');
  const [hora, setHora] = useState(dia.estado === 'INCOMPLETO' ? '18:00' : '09:00');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await api('fichaje.correccion', {fecha: dia.fecha, tipo, hora, motivo});
      avisar(r.mensaje);
      onHecho();
    } catch (e) { avisar(e.message, 'rojo'); setEnviando(false); }
  };
  return (
    <Modal titulo={t('Corregir el {fecha}', {fecha: fecha(dia.fecha, {weekday: 'long', day: 'numeric', month: 'long'})})} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton><Boton tipo="primario" disabled={enviando || !motivo.trim()} onClick={enviar}>{t('Enviar corrección')}</Boton></>}>
      <div className="si-marcas-dia">
        <span>{t('Marcas registradas:')}</span>
        {dia.marcas.length ? dia.marcas.map((m, i) => <Insignia key={i}>{m.tipo === 'PAUSA' ? <><Icono n={incid(m.incidencia).icono} /> {t('Pausa')}</> : MARCAS[m.tipo]} {m.hora}</Insignia>) : <em>{t('ninguna')}</em>}
      </div>
      <div className="si-rejilla-2">
        <Campo etiqueta={t('Marca que falta o es incorrecta')}>
          <select className="si-select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(MARCAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={t('Hora correcta')}><input className="si-input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Campo>
      </div>
      <Campo etiqueta={t('Motivo')} ayuda={t('Lo verá tu responsable al aprobarla.')}>
        <textarea className="si-input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
          placeholder={t('Ej.: olvidé fichar la salida al terminar una reunión fuera de la oficina.')} />
      </Campo>
    </Modal>
  );
}

// ---------- Equipo ahora ----------
function Equipo() {
  const [equipo, error, recargar] = useDatos('fichaje.equipo', {}, []);
  useEffect(() => { const id = setInterval(recargar, 60000); return () => clearInterval(id); }, [recargar]);
  if (error) return <Fallo>{error}</Fallo>;
  if (!equipo) return <Cargando />;
  const n = (e) => equipo.filter((p) => p.estado === e).length;
  return (
    <Tarjeta titulo={t('Ahora mismo')} accion={<div className="si-fila">
      <Insignia tono="verde">{t('{n} trabajando', {n: n('TRABAJANDO')})}</Insignia><Insignia tono="ambar">{t('{n} en pausa', {n: n('PAUSA')})}</Insignia>
      <Insignia tono="gris">{t('{n} fuera', {n: n('FUERA')})}</Insignia><Insignia tono="azul">{t('{n} ausentes', {n: n('AUSENTE')})}</Insignia>
    </div>}>
      <div className="si-equipo">
        {equipo.map((p) => {
          const pct = p.objetivoSemana ? Math.min(100, Math.round((p.minutosSemana / p.objetivoSemana) * 100)) : 0;
          return (
            <div key={p.usuario} className={`si-persona si-estado-${p.estado.toLowerCase()}`}>
              <Avatar nombre={p.nombre} />
              <div className="si-persona-datos">
                <strong>{p.nombre}</strong><span>{p.puesto}</span>
                <em>{{
                  TRABAJANDO: t('Trabajando desde las {hora}', {hora: p.desde}) + (p.modalidad === 'TELETRABAJO' ? ` · ${t('Teletrabajo')}` : ''),
                  PAUSA: <><Icono n={incid(p.incidencia).icono} /> {t('{motivo} desde las {hora}', {motivo: incid(p.incidencia).nombre, hora: p.desde})}</>,
                  FUERA: p.desde ? t('Salió a las {hora}', {hora: p.desde}) : t('Sin fichar hoy'),
                  AUSENTE: t('Ausencia aprobada'),
                }[p.estado]}</em>
              </div>
              <div className="si-persona-horas">
                <span>{t('Hoy')} <strong>{hm(p.minutosHoy)}</strong></span>
                <span>{t('Semana')} <strong>{hm(p.minutosSemana)}</strong></span>
                <div className="si-barra fina"><div style={{width: `${pct}%`}} /></div>
              </div>
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}

// ---------- Informes (RRHH) ----------
function Informes() {
  const {api, avisar} = useSuite();
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const exportar = async (ambito) => {
    try {
      const r = await api('fichaje.csv', {anio, mes, ambito});
      descargar(r.nombre, r.contenido);
      avisar(t('Descargado {nombre}', {nombre: r.nombre}));
    } catch (e) { avisar(e.message, 'rojo'); }
  };
  return (
    <Tarjeta titulo={t('Registro de jornada')} accion={<SelectorMes anio={anio} mes={mes} onCambiar={(a, m) => { setAnio(a); setMes(m); }} />}>
      <p>{t('Exporta el registro diario de jornada de')} <strong>{nombreMes(anio, mes)}</strong>{t(': hora de entrada y salida, pausas, tiempo trabajado, modalidad e incidencias de cada persona. Es el registro que se debe conservar cuatro años y poner a disposición de la plantilla, sus representantes y la Inspección de Trabajo.')}</p>
      <div className="si-fila">
        <Boton tipo="primario" icono="descargar" onClick={() => exportar('todos')}>{t('Toda la plantilla (CSV)')}</Boton>
        <Boton icono="descargar" onClick={() => exportar('yo')}>{t('Solo mi registro')}</Boton>
      </div>
      <hr className="si-separador" />
      <p className="si-tenue">{t('Demo: deja la suite como recién instalada (fichajes de las últimas semanas, vacaciones y solicitudes pendientes).')}</p>
      <div className="si-fila"><Boton tipo="peligro" onClick={async () => {
        if (!window.confirm(t('¿Borrar todos los cambios y restaurar los datos de demostración?'))) return;
        try { await api('demo.reiniciar'); window.location.reload(); } catch (e) { avisar(e.message, 'rojo'); }
      }}>{t('Restaurar datos de demostración')}</Boton></div>
    </Tarjeta>
  );
}

// ---------- Mi tarjeta de quiosco ----------
function MiTarjeta({yo}) {
  const [qr, setQr] = useState(null);
  useEffect(() => {
    QRCode.toDataURL(yo.tarjeta || yo.usuario, {width: 220, margin: 1, color: {dark: '#272833', light: '#ffffff'}}).then(setQr);
  }, [yo.tarjeta, yo.usuario]);
  return (
    <Tarjeta titulo={t('Mi tarjeta de quiosco')}>
      <div className="si-mi-tarjeta">
        <div className="si-carnet">
          <div className="si-carnet-cab"><OrbitaLogo tam={22} claro /></div>
          <div className="si-carnet-cuerpo">
            <Avatar nombre={yo.nombre} tam={54} />
            <div><strong>{yo.nombre}</strong><span>{yo.puesto}</span><span>{yo.departamento}</span></div>
          </div>
          {qr && <img src={qr} alt={t('Código de fichaje de {nombre}', {nombre: yo.nombre})} />}
          <small>{yo.tarjeta}</small>
        </div>
        <div className="si-mi-tarjeta-texto">
          <h4>{t('Ficha en la entrada sin iniciar sesión')}</h4>
          <p>{t('En el quiosco de fichaje de la oficina puedes identificarte de dos formas:')}</p>
          <ol>
            <li>{t('Acerca este código QR a la cámara del quiosco (desde el móvil o impreso en tu tarjeta).')}</li>
            <li>{t('O teclea tu PIN personal:')} <span className="si-pin">{yo.pin}</span></li>
          </ol>
          <p className="si-tenue">{t('El fichaje queda en tu registro de jornada como «Quiosco», igual que si fichases desde aquí.')}</p>
          <a className="si-boton" href={urlApp('kiosco')} target="_blank" rel="noreferrer">{t('Abrir el quiosco')} <Icono n="externo" /></a>
        </div>
      </div>
    </Tarjeta>
  );
}