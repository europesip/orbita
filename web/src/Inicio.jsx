// Mi intranet: página de inicio de la suite con el resumen de todas las aplicaciones.
import React, {useState} from 'react';
import {
  Avatar, Boton, Cargando, Fallo, ICONOS_GASTO, Insignia, MARCAS, Tarjeta, TIPOS_AUSENCIA, Vacio,
  dosCifras, euros, eurosRedondo, fecha, horas, hm, plural, rango, useDatos, useReloj, useSuite,
} from './ui.jsx';
import {Icono} from './iconos.jsx';
import {Anillo, Barras} from './graficos.jsx';
import {VALORES_RECONOCIMIENTO, haceCuanto, textoAviso, urlApp, urlAviso} from './social.jsx';
import {FilaCelebracion} from './Personas.jsx';
import {IconoApp} from './marca.jsx';
import {textoPeriodo} from './Documentos.jsx';
import {locale, t} from './i18n.js';

// Paleta categórica de DX (distinguible entre sí), la misma que en Gastos
const COLORES_GASTO = {COMIDA: '#0b5fff', HOTEL: '#13838f', TRANSPORTE: '#b95000', KILOMETRAJE: '#6f5bd6', PARKING: '#c2307a', OTROS: '#287d3c'};

function saludo(d) {
  const h = d.getHours();
  return t(h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches');
}

/** Comunicación con RRHH en Mi intranet: lo pendiente de leer o confirmar, el pulso y las consultas. */
function ComunicacionRrhh({c}) {
  const url = (p) => `${urlApp('comunicacion')}#${p}`;
  const filas = [];
  if (c.comunicado) {
    filas.push(<li key="c"><a href={url('comunicados')}><span className="si-aviso-icono"><Icono n={c.comunicado.confirmar ? 'firmar' : 'megafono'} /></span>
      <span><strong>{c.comunicado.titulo}</strong><small>{c.comunicado.confirmar
        ? (c.comunicado.limite ? t('Confirma que lo has leído antes del {fecha}', {fecha: fecha(c.comunicado.limite, {day: 'numeric', month: 'long'})}) : t('Confirma que lo has leído'))
        : t('Comunicado nuevo de RRHH')}</small></span></a></li>);
  }
  if (c.encuestasPendientes > 0) {
    filas.push(<li key="p"><a href={urlApp('encuestas')}><span className="si-aviso-icono"><Icono n="grafico" /></span>
      <span><strong>{plural(c.encuestasPendientes, 'encuesta de pulso por responder', 'encuestas de pulso por responder')}</strong><small>{t('Anónima, un minuto')}</small></span></a></li>);
  }
  if (c.consultasAbiertas > 0) {
    filas.push(<li key="q"><a href={url('consultas')}><span className="si-aviso-icono"><Icono n="chat" /></span>
      <span><strong>{plural(c.consultasAbiertas, 'consulta abierta con RRHH', 'consultas abiertas con RRHH')}</strong><small>{t('Mira si te han respondido')}</small></span></a></li>);
  }
  if (c.rrhh && c.consultasSinAtender > 0) {
    filas.push(<li key="r"><a href={url('consultas')}><span className="si-aviso-icono"><Icono n="bandeja" /></span>
      <span><strong>{plural(c.consultasSinAtender, 'consulta de la plantilla sin atender', 'consultas de la plantilla sin atender')}</strong><small>{t('Bandeja de RRHH')}</small></span></a></li>);
  }
  return (
    <Tarjeta titulo={t('Comunicación con RRHH')} accion={<a className="si-enlace" href={urlApp('comunicacion')}>{t('Comunicación')} <Icono n="derecha" /></a>}>
      {filas.length ? <ul className="si-lista si-mini-lista">{filas}</ul> : <Vacio icono="bandeja">{t('Nada pendiente con RRHH.')}</Vacio>}
    </Tarjeta>
  );
}

/** Personas en Mi intranet: el último reconocimiento recibido y las celebraciones de las dos próximas semanas. */
function PersonasInicio({p}) {
  const r = p.reconocimiento;
  const v = r && (VALORES_RECONOCIMIENTO[r.valor] || VALORES_RECONOCIMIENTO.EQUIPO);
  return (
    <Tarjeta titulo={t('Personas')} accion={<a className="si-enlace" href={urlApp('personas')}>{t('Directorio')} <Icono n="derecha" /></a>}>
      {r && (
        <a className="si-pe-recibido" href={`${urlApp('personas')}#reconocimientos`} style={{'--valor': v.color}}>
          <span className="si-pe-valor"><Icono n={v.icono} /> {t(v.nombre)}</span>
          <q>{r.texto}</q>
          <small>{t('{nombre} te dio las gracias', {nombre: r.de.nombre})} · {haceCuanto(r.creado)}</small>
        </a>
      )}
      {p.celebraciones.length ? (
        <ul className="si-lista si-mini-lista">
          {p.celebraciones.map((c) => <FilaCelebracion key={`${c.tipo}-${c.usuario}`} c={c} href={`${urlApp('personas')}#persona=${encodeURIComponent(c.usuario)}`} />)}
        </ul>
      ) : !r && <Vacio icono="tarta">{t('Sin celebraciones en las próximas dos semanas.')}</Vacio>}
    </Tarjeta>
  );
}

export function Inicio() {
  const [d, error, , fijar] = useDatos('inicio.resumen', {}, []);
  const ahora = useReloj(30000);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const yo = d.yo;
  const responsable = yo.tieneEquipo;
  const ultima = d.semanas[d.semanas.length - 1];
  return (
    <div className="si-inicio">
      <section className="si-bienvenida">
        <div>
          <h2>{saludo(ahora)}, {yo.nombre.split(' ')[0]}</h2>
          <p>{ahora.toLocaleDateString(locale(), {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'})}</p>
          <div className="si-fila">
            {d.avisos.noLeidos > 0 && <Insignia tono="ambar"><Icono n="campana" /> {plural(d.avisos.noLeidos, 'aviso sin leer', 'avisos sin leer')}</Insignia>}
            {responsable && d.numPendientes > 0 && <Insignia tono="violeta"><Icono n="aprobar" /> {t('{n} de tu equipo por revisar', {n: plural(d.numPendientes, 'solicitud', 'solicitudes')})}</Insignia>}
            {d.proxima && <Insignia tono="azul"><Icono n="calendario" /> {t('Próxima ausencia:')} {rango(d.proxima.desde, d.proxima.hasta)}</Insignia>}
            {d.documentos && d.documentos.porAcusar > 0 && <a href={`${urlApp('documentos')}#mios`}><Insignia tono="ambar">
              <Icono n="firmar" /> {plural(d.documentos.porAcusar, 'documento por firmar', 'documentos por firmar')}</Insignia></a>}
            {d.documentos && d.documentos.ultima && !d.documentos.ultima.leido && <a href={`${urlApp('documentos')}#mios`}><Insignia tono="azul">
              <Icono n="euro" /> {t('Tu nómina de {mes} ya está disponible', {mes: textoPeriodo(d.documentos.ultima.periodo)})}</Insignia></a>}
            {d.comunicacion && d.comunicacion.comunicadosPorConfirmar > 0 && <a href={`${urlApp('comunicacion')}#comunicados`}><Insignia tono="ambar">
              <Icono n="firmar" /> {plural(d.comunicacion.comunicadosPorConfirmar, 'comunicado por confirmar', 'comunicados por confirmar')}</Insignia></a>}
          </div>
        </div>
        <FichajeRapido est={d.fichaje} onCambio={(f) => fijar({...d, fichaje: f})} />
      </section>

      <div className="si-kpis">
        <Kpi titulo={t('Horas esta semana')} app="fichaje" valor={horas(ultima.minutos)} pie={t('de {h} teóricas', {h: horas(ultima.objetivo)})}
          barra={ultima.objetivo ? ultima.minutos / ultima.objetivo : 0} />
        <Kpi titulo={t('Vacaciones {anio}', {anio: new Date().getFullYear()})} app="vacaciones" valor={plural(d.vacaciones.disponibles, 'día', 'días')}
          pie={t('disponibles de {total} · {pend} pendientes', {total: d.vacaciones.total, pend: d.vacaciones.pendientes})}
          grafico={<Anillo tam={64} grosor={9} segmentos={[
            {valor: d.vacaciones.aprobados, color: 'var(--si-azul)', etiqueta: t('{n} aprobados', {n: d.vacaciones.aprobados})},
            {valor: d.vacaciones.pendientes, color: '#b3cdff', etiqueta: t('{n} pendientes', {n: d.vacaciones.pendientes})},
            {valor: d.vacaciones.disponibles, color: '#e7e7ed', etiqueta: t('{n} disponibles', {n: d.vacaciones.disponibles})},
          ]} />} />
        <Kpi titulo={t('Gastos por cobrar')} app="gastos" valor={euros(d.gastos.pendienteCobro + d.gastos.pendienteAprobar)}
          pie={t('{importe} esperando aprobación', {importe: euros(d.gastos.pendienteAprobar)})} />
        {responsable
          ? <Kpi titulo={t('Por aprobar')} app="aprobaciones" valor={String(d.numPendientes)} pie={t('solicitudes de tu equipo')} destacado={d.numPendientes > 0} />
          : <Kpi titulo={t('Asuntos propios')} app="vacaciones" valor={plural(d.propios.disponibles, 'día', 'días')} pie={t('disponibles de {total}', {total: d.propios.total})} />}
      </div>

      <div className="si-inicio-rejilla">
        <Tarjeta titulo={t('Mis horas de las últimas semanas')} className="si-ancho-2"
          accion={<a className="si-enlace" href={urlApp('fichaje')}>{t('Ver mi registro')} <Icono n="derecha" /></a>}>
          <Barras formato={(m) => hm(m)} datos={d.semanas.map((s, i) => ({
            etiqueta: i === d.semanas.length - 1 ? t('Esta') : fecha(s.lunes, {day: 'numeric', month: 'short'}),
            valor: s.minutos, objetivo: s.objetivo, enCurso: i === d.semanas.length - 1, titulo: t('Semana del {lunes}: {h} de {obj}', {lunes: fecha(s.lunes, {day: 'numeric', month: 'long'}), h: horas(s.minutos), obj: horas(s.objetivo)}),
          }))} />
          <p className="si-leyenda"><span><i style={{background: 'var(--si-acento)'}} />{t('Trabajado')}</span><span><i className="si-raya" />{t('Jornada teórica')}</span>
            <span><i style={{background: 'var(--si-ambar)'}} />{t('Por debajo')}</span></p>
        </Tarjeta>
        <Tarjeta titulo={t('Mis gastos en {anio}', {anio: new Date().getFullYear()})} accion={<a className="si-enlace" href={urlApp('gastos')}>{t('Gastos')} <Icono n="derecha" /></a>}>
          {!d.gastosPorCategoria.length ? <Vacio icono="recibo">{t('Aún no tienes gastos este año.')}</Vacio> : (
            <div className="si-gasto-anual">
              <Anillo tam={132} grosor={18} centro={eurosRedondo(d.gastosPorCategoria.reduce((s, x) => s + x.importe, 0))} sub={t('en el año')}
                segmentos={d.gastosPorCategoria.map((g) => ({valor: g.importe, color: COLORES_GASTO[g.id], etiqueta: `${t(g.nombre)}: ${euros(g.importe)}`}))} />
              <ul className="si-leyenda-vertical">
                {d.gastosPorCategoria.map((g) => <li key={g.id}><i style={{background: COLORES_GASTO[g.id]}} /><Icono n={ICONOS_GASTO[g.id]} /> {t(g.nombre)}<b>{euros(g.importe)}</b></li>)}
              </ul>
            </div>
          )}
        </Tarjeta>

        {responsable && (
          <Tarjeta titulo={t('Pendiente de tu aprobación')} accion={<a className="si-enlace" href={urlApp('aprobaciones')}>{t('Ir a la bandeja')} <Icono n="derecha" /></a>}>
            {!d.pendientes.length ? <Vacio>{t('Todo al día.')}</Vacio> : (
              <ul className="si-lista si-mini-lista">
                {d.pendientes.map((p) => (
                  <li key={p.clase + p.id}>
                    <Avatar nombre={p.persona.nombre} tam={30} />
                    <span><strong>{p.persona.nombre}</strong><small>{resumenPendiente(p)}</small></span>
                    {p.comentarios > 0 && <span className="si-tenue si-comentarios"><Icono n="chat" /> {p.comentarios}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}
        {d.comunicacion && <ComunicacionRrhh c={d.comunicacion} />}
        <Tarjeta titulo={t('Quién falta los próximos 14 días')} accion={<a className="si-enlace" href={urlApp('vacaciones')}>{t('Calendario')} <Icono n="derecha" /></a>}>
          <Fuera dias={d.fuera} />
        </Tarjeta>
        {d.personas && <PersonasInicio p={d.personas} />}
        <Tarjeta titulo={t('Últimos avisos')} className={responsable ? 'si-ancho-2' : 'si-ancho-3'}>
          {!d.avisos.avisos.length ? <Vacio icono="campana">{t('Sin avisos.')}</Vacio> : (
            <ul className="si-lista si-mini-lista">
              {d.avisos.avisos.slice(0, 5).map((a) => (
                <li key={a.id} className={a.leido ? '' : 'si-no-leido'}>
                  <a href={urlAviso(a)}><span>{textoAviso(a)}<small>{haceCuanto(a.creado)}</small></span></a>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <nav className="si-accesos">
        {[['fichaje', 'reloj', 'Fichaje', 'Registro de jornada'], ['vacaciones', 'calendario', 'Vacaciones', 'Ausencias y calendario'],
          ['gastos', 'recibo', 'Gastos y viajes', 'Notas y tickets'], ['aprobaciones', 'aprobar', 'Aprobaciones', 'Bandeja del responsable'],
          ['comunicacion', 'megafono', 'Comunicación', 'Comunicados y consultas'], ['encuestas', 'grafico', 'Encuestas', 'Clima y plan de acción'], ['personas', 'personas', 'Personas', 'Directorio y organigrama'],
          ['documentos', 'documento', 'Mis documentos', 'Nóminas y certificados'], ['kiosco', 'tableta', 'Quiosco', 'Fichar en la entrada']].map(([app, i, tit, s]) => (
          <a key={app} href={urlApp(app)} className="si-acceso">
            <span><IconoApp app={app} tam={40} /></span><strong>{t(tit)}</strong><small>{t(s)}</small>
          </a>
        ))}
      </nav>
    </div>
  );
}

function resumenPendiente(p) {
  switch (p.clase) {
    case 'AUSENCIA': return `${TIPOS_AUSENCIA[p.tipo].nombre} · ${rango(p.desde, p.hasta)}`;
    case 'CORRECCION': return `${t('Corrección de {tipo} ({fecha})', {tipo: MARCAS[p.tipo].toLowerCase(), fecha: fecha(p.fecha)})}`;
    case 'NOTA': return `${t('Nota de gasto')} · ${euros(p.total)}`;
    case 'VIAJE': return t('Viaje a {destino} · {rango}', {destino: p.destino, rango: rango(p.desde, p.hasta)});
    default: return '';
  }
}

function Kpi({titulo, valor, pie, app, barra, grafico, destacado}) {
  return (
    <a className={`si-tarjeta si-kpi-inicio${destacado ? ' destacado' : ''}`} href={urlApp(app)}>
      <div>
        <span className="si-etiqueta">{titulo}</span>
        <strong>{valor}</strong>
        <small>{pie}</small>
        {barra !== undefined && <div className="si-barra fina"><div style={{width: `${Math.min(100, barra * 100)}%`}} /></div>}
      </div>
      {grafico}
    </a>
  );
}

/** Ausencias de los próximos días agrupadas por persona en tramos seguidos. */
function Fuera({dias}) {
  const porPersona = {};
  dias.forEach((d) => { (porPersona[d.nombre] = porPersona[d.nombre] || []).push(d); });
  const filas = Object.entries(porPersona).map(([nombre, l]) => {
    l.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return {nombre, tipo: l[0].tipo, desde: l[0].fecha, hasta: l[l.length - 1].fecha};
  }).sort((a, b) => a.desde.localeCompare(b.desde));
  if (!filas.length) return <Vacio icono="calendario">{t('Nadie del equipo tiene ausencias en las próximas dos semanas.')}</Vacio>;
  return (
    <ul className="si-lista si-mini-lista">
      {filas.map((f) => (
        <li key={f.nombre}>
          <span className="si-tipo-punto" style={{background: TIPOS_AUSENCIA[f.tipo].color}} />
          <span><strong>{f.nombre}</strong><small>{TIPOS_AUSENCIA[f.tipo].nombre} · {rango(f.desde, f.hasta)}</small></span>
        </li>
      ))}
    </ul>
  );
}

/** Fichar desde la página de inicio sin entrar en la aplicación. */
function FichajeRapido({est, onCambio}) {
  const {api, avisar} = useSuite();
  const [enviando, setEnviando] = useState(false);
  const ahora = useReloj();
  const marcar = async (tipo) => {
    setEnviando(true);
    try {
      onCambio(await api('fichaje.marcar', {tipo, modalidad: est.modalidad || 'OFICINA'}));
      avisar(t('{tipo} registrada a las {hora}', {tipo: MARCAS[tipo], hora: `${dosCifras(new Date().getHours())}:${dosCifras(new Date().getMinutes())}`}));
    } catch (e) { avisar(e.message, 'rojo'); } finally { setEnviando(false); }
  };
  const texto = {TRABAJANDO: t('Trabajando desde las {hora}', {hora: est.desde}), PAUSA: t('En pausa desde las {hora}', {hora: est.desde}),
    FUERA: t(est.marcas.length ? 'Jornada terminada' : 'Aún no has fichado hoy')}[est.estado];
  return (
    <div className={`si-fichaje-rapido si-estado-${est.estado.toLowerCase()}`}>
      <span className="si-fr-hora">{dosCifras(ahora.getHours())}:{dosCifras(ahora.getMinutes())}</span>
      <span className="si-fr-estado"><i className="si-fr-punto" />{texto}</span>
      <small>{t('Hoy: {h} de {obj}', {h: horas(est.minutosHoy), obj: horas(est.objetivoHoy)})}</small>
      <div className="si-fila">
        {est.estado === 'FUERA' && <Boton tipo="primario" disabled={enviando} onClick={() => marcar('ENTRADA')}>{t('Fichar entrada')}</Boton>}
        {est.estado === 'TRABAJANDO' && <>
          <Boton disabled={enviando} onClick={() => marcar('PAUSA')}>{t('Pausa')}</Boton>
          <Boton tipo="peligro" disabled={enviando} onClick={() => marcar('SALIDA')}>{t('Fichar salida')}</Boton>
        </>}
        {est.estado === 'PAUSA' && <>
          <Boton tipo="primario" disabled={enviando} onClick={() => marcar('REANUDAR')}>{t('Reanudar')}</Boton>
          <Boton tipo="peligro" disabled={enviando} onClick={() => marcar('SALIDA')}>{t('Fichar salida')}</Boton>
        </>}
      </div>
    </div>
  );
}
