// Aprobaciones: bandeja del responsable con ausencias, correcciones de fichaje, notas de gasto y viajes de su equipo.
import React, {useState} from 'react';
import {
  Avatar, Boton, Cargando, ESTADOS, Fallo, ICONOS_GASTO, Insignia, MARCAS, Tarjeta, TIPOS_AUSENCIA, Vacio, VerTicket,
  euros, fecha, plural, rango, useDatos, useSuite,
} from './ui.jsx';
import {BotonConversacion, Conversacion} from './social.jsx';

const COLOR = {CORRECCION: 'var(--si-ambar)', NOTA: 'var(--si-verde)', VIAJE: 'var(--si-turquesa)'};

function resumenHistorial(h) {
  switch (h.clase) {
    case 'CORRECCION': return `Corrección de ${MARCAS[h.tipo].toLowerCase()} (${fecha(h.fecha)})`;
    case 'NOTA': return `Nota de gasto «${h.titulo}» · ${euros(h.total)}`;
    case 'VIAJE': return `Viaje a ${h.destino} · ${rango(h.desde, h.hasta)}`;
    default: return `${TIPOS_AUSENCIA[h.tipo].nombre} · ${rango(h.desde, h.hasta)}`;
  }
}

export function Aprobaciones({yo}) {
  const [datos, error, , fijar] = useDatos('apr.pendientes', {}, []);
  const [filtro, setFiltro] = useState('');
  if (!yo.tieneEquipo) return <Tarjeta><Vacio icono="👥">No tienes personas a tu cargo: aquí verás sus solicitudes cuando las tengas.</Vacio></Tarjeta>;
  if (error) return <Fallo>{error}</Fallo>;
  if (!datos) return <Cargando />;
  const grupos = [['', 'Todas'], ['AUSENCIA', 'Ausencias'], ['CORRECCION', 'Fichajes'], ['NOTA', 'Gastos'], ['VIAJE', 'Viajes']]
    .map(([id, nombre]) => ({id, nombre, n: datos.items.filter((i) => !id || i.clase === id).length}));
  const items = datos.items.filter((i) => !filtro || i.clase === filtro);
  return (
    <>
      <Tarjeta titulo={datos.items.length ? `${plural(datos.items.length, 'solicitud pendiente', 'solicitudes pendientes')}` : 'Pendientes'}
        accion={datos.items.length > 0 && <div className="si-filtros">
          {grupos.filter((g) => !g.id || g.n).map((g) => (
            <button key={g.id} type="button" className={filtro === g.id ? 'activa' : ''} onClick={() => setFiltro(g.id)}>{g.nombre} <span>{g.n}</span></button>
          ))}
        </div>}>
        {items.length
          ? <div className="si-bandeja">{items.map((it) => <Solicitud key={it.clase + it.id} it={it} politica={datos.politica} onHecho={fijar} />)}</div>
          : <Vacio>Todo al día: no hay solicitudes de tu equipo esperando respuesta.</Vacio>}
      </Tarjeta>
      {datos.historial.length > 0 && (
        <Tarjeta titulo="Resueltas recientemente">
          <ul className="si-lista si-historial">
            {datos.historial.map((h) => (
              <li key={h.clase + h.id}>
                <Avatar nombre={h.persona.nombre} tam={28} />
                <span className="si-hist-texto"><strong>{h.persona.nombre}</strong> · {resumenHistorial(h)}</span>
                <Insignia tono={ESTADOS[h.estado].tono}>{ESTADOS[h.estado].nombre}</Insignia>
                <small className="si-tenue">{h.resuelto && fecha(h.resuelto)}</small>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </>
  );
}

function Solicitud({it, politica, onHecho}) {
  const {api, avisar} = useSuite();
  const [rechazando, setRechazando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [chat, setChat] = useState(false);
  const [cuenta, setCuenta] = useState(it.comentarios || 0);
  const resolver = async (decision) => {
    setEnviando(true);
    try {
      const r = await api('apr.resolver', {clase: it.clase, id: it.id, decision, comentario});
      avisar(r.mensaje, decision === 'APROBAR' ? 'verde' : 'ambar');
      onHecho(r);
    } catch (e) { avisar(e.message, 'rojo'); setEnviando(false); }
  };
  const t = it.clase === 'AUSENCIA' ? TIPOS_AUSENCIA[it.tipo] : null;
  return (
    <article className={`si-peticion${it.clase === 'NOTA' ? ' si-peticion-nota' : ''}`} style={{'--c': t ? t.color : COLOR[it.clase]}}>
      <header>
        <Avatar nombre={it.persona.nombre} />
        <div><strong>{it.persona.nombre}</strong><span>{it.persona.puesto}</span></div>
        <small className="si-tenue">{it.clase === 'NOTA' ? 'Enviada' : 'Pedida'} el {fecha(it.creado)}</small>
      </header>
      <div className="si-peticion-cuerpo">
        {it.clase === 'AUSENCIA' && <>
          <h4>{t.nombre} · {plural(it.dias, 'día laborable', 'días laborables')}</h4>
          <p className="si-fechas">{rango(it.desde, it.hasta)}</p>
          {it.comentario && <q>{it.comentario}</q>}
          <div className="si-datos-extra">
            {it.saldoRestante !== undefined && it.saldoRestante !== null &&
              <Insignia tono={it.saldoRestante < 3 ? 'ambar' : 'gris'}>Le quedarán {plural(it.saldoRestante, 'día', 'días')}</Insignia>}
            {it.coincidencias.length === 0
              ? <Insignia tono="verde">Nadie más del equipo falta esos días</Insignia>
              : it.coincidencias.map((c, i) => (
                <Insignia key={i} tono="ambar">⚠ Coincide con {c.nombre} ({rango(c.desde, c.hasta)}{c.estado === 'PENDIENTE' ? ', pendiente' : ''})</Insignia>
              ))}
          </div>
        </>}
        {it.clase === 'CORRECCION' && <>
          <h4>Corrección de fichaje · {MARCAS[it.tipo]} a las {it.hora}</h4>
          <p className="si-fechas">{fecha(it.fecha, {weekday: 'long', day: 'numeric', month: 'long'})}</p>
          <div className="si-marcas-dia">
            <span>Registrado ese día:</span>
            {it.marcas.length ? it.marcas.map((m, i) => <Insignia key={i}>{MARCAS[m.tipo]} {m.hora}</Insignia>) : <em>sin marcas</em>}
          </div>
          {it.motivo && <q>{it.motivo}</q>}
        </>}
        {it.clase === 'NOTA' && <>
          <h4>Nota de gasto · {euros(it.total)}</h4>
          <p className="si-fechas">{it.titulo}{it.viaje ? ` · ✈ ${it.viaje.destino}` : ''}</p>
          <ul className="si-lineas-mini">
            {it.lineas.map((l) => (
              <li key={l.id} className={l.excede ? 'excede' : ''}>
                <span className="si-gasto-icono">{ICONOS_GASTO[l.categoria]}</span>
                <span className="si-lm-desc">
                  {l.descripcion}<small>{fecha(l.fecha)}{l.km ? ` · ${l.km} km` : ''}</small>
                  {l.excede && <em>⚠ Supera la política ({euros(l.limite)}): {l.justificacion}</em>}
                </span>
                {l.ticket ? <button type="button" className="si-enlace" onClick={() => setTicket(l.id)}>📎</button>
                  : <span className="si-tenue" title={l.categoria === 'KILOMETRAJE' ? 'Kilometraje' : 'Sin ticket'}>{l.categoria === 'KILOMETRAJE' ? '' : '—'}</span>}
                <strong>{euros(l.importe)}</strong>
              </li>
            ))}
          </ul>
          <div className="si-datos-extra">
            {it.excedidas === 0 ? <Insignia tono="verde">Dentro de la política</Insignia>
              : <Insignia tono="ambar">{plural(it.excedidas, 'gasto fuera de política (justificado)', 'gastos fuera de política (justificados)')}</Insignia>}
            {it.sinTicket > 0 && <Insignia tono="rojo">{plural(it.sinTicket, 'gasto sin ticket', 'gastos sin ticket')}</Insignia>}
            {it.viaje && <Insignia tono="azul">Viaje estimado en {euros(it.viaje.estimado)}</Insignia>}
          </div>
        </>}
        {it.clase === 'VIAJE' && <>
          <h4>Solicitud de viaje · {it.destino}</h4>
          <p className="si-fechas">{rango(it.desde, it.hasta)}</p>
          {it.motivo && <q>{it.motivo}</q>}
          <div className="si-datos-extra"><Insignia tono="azul">Importe estimado {euros(it.estimado)}</Insignia></div>
        </>}
      </div>
      {chat && <Conversacion clase={it.clase} objeto={it.id} compacta onCuenta={setCuenta} />}
      {rechazando ? (
        <div className="si-rechazo">
          <textarea className="si-input" rows={2} autoFocus value={comentario} onChange={(e) => setComentario(e.target.value)}
            placeholder="Explica el motivo (lo verá en su solicitud)" />
          <div className="si-fila">
            <Boton onClick={() => setRechazando(false)}>Volver</Boton>
            <Boton tipo="peligro" disabled={enviando || !comentario.trim()} onClick={() => resolver('RECHAZAR')}>Rechazar</Boton>
          </div>
        </div>
      ) : (
        <footer className="si-fila">
          {it.clase !== 'CORRECCION' && <BotonConversacion cuenta={cuenta} abierta={chat} onAlternar={() => setChat(!chat)} />}
          <Boton disabled={enviando} onClick={() => setRechazando(true)}>Rechazar</Boton>
          <Boton tipo="exito" disabled={enviando} onClick={() => resolver('APROBAR')}>Aprobar</Boton>
        </footer>
      )}
      {ticket && <VerTicket linea={ticket} onCerrar={() => setTicket(null)} />}
    </article>
  );
}
