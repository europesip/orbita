// Mi intranet: página de inicio de la suite con el resumen de todas las aplicaciones.
import React, {useState} from 'react';
import {
  Avatar, Boton, Cargando, Fallo, ICONOS_GASTO, Insignia, MARCAS, Tarjeta, TIPOS_AUSENCIA, Vacio,
  dosCifras, euros, fecha, horas, hm, plural, rango, useDatos, useReloj, useSuite,
} from './ui.jsx';
import {Anillo, Barras} from './graficos.jsx';
import {haceCuanto, urlApp} from './social.jsx';

const COLORES_GASTO = {COMIDA: '#f97316', HOTEL: '#6366f1', TRANSPORTE: '#0ea5e9', KILOMETRAJE: '#10b981', PARKING: '#a855f7', OTROS: '#64748b'};

function saludo(d) {
  const h = d.getHours();
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
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
          <p>{ahora.toLocaleDateString('es-ES', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'})}</p>
          <div className="si-fila">
            {d.avisos.noLeidos > 0 && <Insignia tono="ambar">🔔 {plural(d.avisos.noLeidos, 'aviso sin leer', 'avisos sin leer')}</Insignia>}
            {responsable && d.numPendientes > 0 && <Insignia tono="violeta">✔ {plural(d.numPendientes, 'solicitud', 'solicitudes')} de tu equipo por revisar</Insignia>}
            {d.proxima && <Insignia tono="azul">🌴 Próxima ausencia: {rango(d.proxima.desde, d.proxima.hasta)}</Insignia>}
          </div>
        </div>
        <FichajeRapido est={d.fichaje} onCambio={(f) => fijar({...d, fichaje: f})} />
      </section>

      <div className="si-kpis">
        <Kpi titulo="Horas esta semana" app="fichaje" valor={horas(ultima.minutos)} pie={`de ${horas(ultima.objetivo)} teóricas`}
          barra={ultima.objetivo ? ultima.minutos / ultima.objetivo : 0} />
        <Kpi titulo={`Vacaciones ${new Date().getFullYear()}`} app="vacaciones" valor={plural(d.vacaciones.disponibles, 'día', 'días')}
          pie={`disponibles de ${d.vacaciones.total} · ${d.vacaciones.pendientes} pendientes`}
          grafico={<Anillo tam={64} grosor={9} segmentos={[
            {valor: d.vacaciones.aprobados, color: 'var(--si-azul)', etiqueta: `${d.vacaciones.aprobados} aprobados`},
            {valor: d.vacaciones.pendientes, color: '#93c5fd', etiqueta: `${d.vacaciones.pendientes} pendientes`},
            {valor: d.vacaciones.disponibles, color: '#e5e7eb', etiqueta: `${d.vacaciones.disponibles} disponibles`},
          ]} />} />
        <Kpi titulo="Gastos por cobrar" app="gastos" valor={euros(d.gastos.pendienteCobro + d.gastos.pendienteAprobar)}
          pie={`${euros(d.gastos.pendienteAprobar)} esperando aprobación`} />
        {responsable
          ? <Kpi titulo="Por aprobar" app="aprobaciones" valor={String(d.numPendientes)} pie="solicitudes de tu equipo" destacado={d.numPendientes > 0} />
          : <Kpi titulo="Asuntos propios" app="vacaciones" valor={plural(d.propios.disponibles, 'día', 'días')} pie={`disponibles de ${d.propios.total}`} />}
      </div>

      <div className="si-inicio-rejilla">
        <Tarjeta titulo="Mis horas de las últimas semanas" className="si-ancho-2"
          accion={<a className="si-enlace" href={urlApp('fichaje')}>Ver mi registro ›</a>}>
          <Barras formato={(m) => hm(m)} datos={d.semanas.map((s, i) => ({
            etiqueta: i === d.semanas.length - 1 ? 'Esta' : fecha(s.lunes, {day: 'numeric', month: 'short'}),
            valor: s.minutos, objetivo: s.objetivo, enCurso: i === d.semanas.length - 1, titulo: `Semana del ${fecha(s.lunes, {day: 'numeric', month: 'long'})}: ${horas(s.minutos)} de ${horas(s.objetivo)}`,
          }))} />
          <p className="si-leyenda"><span><i style={{background: 'var(--si-acento)'}} />Trabajado</span><span><i className="si-raya" />Jornada teórica</span>
            <span><i style={{background: 'var(--si-ambar)'}} />Por debajo</span></p>
        </Tarjeta>
        <Tarjeta titulo={`Mis gastos en ${new Date().getFullYear()}`} accion={<a className="si-enlace" href={urlApp('gastos')}>Gastos ›</a>}>
          {!d.gastosPorCategoria.length ? <Vacio icono="🧾">Aún no tienes gastos este año.</Vacio> : (
            <div className="si-gasto-anual">
              <Anillo tam={132} grosor={18} centro={euros(d.gastosPorCategoria.reduce((s, x) => s + x.importe, 0)).replace(',00', '')} sub="en el año"
                segmentos={d.gastosPorCategoria.map((g) => ({valor: g.importe, color: COLORES_GASTO[g.id], etiqueta: `${g.nombre}: ${euros(g.importe)}`}))} />
              <ul className="si-leyenda-vertical">
                {d.gastosPorCategoria.map((g) => <li key={g.id}><i style={{background: COLORES_GASTO[g.id]}} />{ICONOS_GASTO[g.id]} {g.nombre}<b>{euros(g.importe)}</b></li>)}
              </ul>
            </div>
          )}
        </Tarjeta>

        {responsable && (
          <Tarjeta titulo="Pendiente de tu aprobación" accion={<a className="si-enlace" href={urlApp('aprobaciones')}>Ir a la bandeja ›</a>}>
            {!d.pendientes.length ? <Vacio>Todo al día.</Vacio> : (
              <ul className="si-lista si-mini-lista">
                {d.pendientes.map((p) => (
                  <li key={p.clase + p.id}>
                    <Avatar nombre={p.persona.nombre} tam={30} />
                    <span><strong>{p.persona.nombre}</strong><small>{resumenPendiente(p)}</small></span>
                    {p.comentarios > 0 && <span className="si-tenue">💬 {p.comentarios}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}
        <Tarjeta titulo="Quién falta los próximos 14 días" accion={<a className="si-enlace" href={urlApp('vacaciones')}>Calendario ›</a>}>
          <Fuera dias={d.fuera} />
        </Tarjeta>
        <Tarjeta titulo="Últimos avisos" className={responsable ? '' : 'si-ancho-2'}>
          {!d.avisos.avisos.length ? <Vacio icono="🔔">Sin avisos.</Vacio> : (
            <ul className="si-lista si-mini-lista">
              {d.avisos.avisos.slice(0, 5).map((a) => (
                <li key={a.id} className={a.leido ? '' : 'si-no-leido'}>
                  <a href={urlApp(a.app)}><span>{a.texto}<small>{haceCuanto(a.creado)}</small></span></a>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <nav className="si-accesos">
        {[['fichaje', '⏱', 'Fichaje', 'Registro de jornada'], ['vacaciones', '🌴', 'Vacaciones', 'Ausencias y calendario'],
          ['gastos', '🧾', 'Gastos y viajes', 'Notas y tickets'], ['aprobaciones', '✔', 'Aprobaciones', 'Bandeja del responsable'],
          ['kiosco', '📟', 'Quiosco', 'Fichar en la entrada']].map(([app, i, t, s]) => (
          <a key={app} href={urlApp(app)} className="si-acceso">
            <span>{i}</span><strong>{t}</strong><small>{s}</small>
          </a>
        ))}
      </nav>
    </div>
  );
}

function resumenPendiente(p) {
  switch (p.clase) {
    case 'AUSENCIA': return `${TIPOS_AUSENCIA[p.tipo].nombre} · ${rango(p.desde, p.hasta)}`;
    case 'CORRECCION': return `Corrección de ${MARCAS[p.tipo].toLowerCase()} · ${fecha(p.fecha)}`;
    case 'NOTA': return `Nota de gasto · ${euros(p.total)}`;
    case 'VIAJE': return `Viaje a ${p.destino} · ${rango(p.desde, p.hasta)}`;
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
  if (!filas.length) return <Vacio icono="🌤">Nadie del equipo tiene ausencias en las próximas dos semanas.</Vacio>;
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
      avisar(`${MARCAS[tipo]} registrada a las ${dosCifras(new Date().getHours())}:${dosCifras(new Date().getMinutes())}`);
    } catch (e) { avisar(e.message, 'rojo'); } finally { setEnviando(false); }
  };
  const texto = {TRABAJANDO: `Trabajando desde las ${est.desde}`, PAUSA: `En pausa desde las ${est.desde}`,
    FUERA: est.marcas.length ? 'Jornada terminada' : 'Aún no has fichado hoy'}[est.estado];
  return (
    <div className={`si-fichaje-rapido si-estado-${est.estado.toLowerCase()}`}>
      <span className="si-fr-hora">{dosCifras(ahora.getHours())}:{dosCifras(ahora.getMinutes())}</span>
      <span className="si-fr-estado">● {texto}</span>
      <small>Hoy: {horas(est.minutosHoy)} de {horas(est.objetivoHoy)}</small>
      <div className="si-fila">
        {est.estado === 'FUERA' && <Boton tipo="primario" disabled={enviando} onClick={() => marcar('ENTRADA')}>Fichar entrada</Boton>}
        {est.estado === 'TRABAJANDO' && <>
          <Boton disabled={enviando} onClick={() => marcar('PAUSA')}>Pausa</Boton>
          <Boton tipo="peligro" disabled={enviando} onClick={() => marcar('SALIDA')}>Fichar salida</Boton>
        </>}
        {est.estado === 'PAUSA' && <>
          <Boton tipo="primario" disabled={enviando} onClick={() => marcar('REANUDAR')}>Reanudar</Boton>
          <Boton tipo="peligro" disabled={enviando} onClick={() => marcar('SALIDA')}>Fichar salida</Boton>
        </>}
      </div>
    </div>
  );
}
