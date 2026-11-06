// Gastos y viajes: notas de gasto con tickets y política, solicitudes de viaje y pagos (Administración).
import React, {useEffect, useState} from 'react';
import {
  Boton, Campo, Cargando, ESTADOS, Fallo, ICONOS_GASTO, Insignia, Modal, Pestanas, SelectorMes, Tarjeta, Vacio, VerTicket,
  descargar, euros, fecha, importeTexto, iso, plural, rango, useDatos, useSuite,
} from './ui.jsx';
import {leerTicket as leerOCR} from './ocr.js';
import {Anillo, Barras} from './graficos.jsx';
import {BotonConversacion, Conversacion} from './social.jsx';

const nombreCategoria = (politica, id) => (politica.categorias.find((c) => c.id === id) || {nombre: id}).nombre;

const COLOR_GASTO = {COMIDA: '#f97316', HOTEL: '#8b5cf6', TRANSPORTE: '#0ea5e9', KILOMETRAJE: '#10b981', PARKING: '#64748b', OTROS: '#ec4899'};
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function Gastos({yo}) {
  const [res, error, recargar, fijar] = useDatos('gastos.resumen', {}, []);
  const [pestana, setPestana] = useState('notas');
  const [abierta, setAbierta] = useState(null); // {id, escanear}
  const [nuevaNota, setNuevaNota] = useState(false);
  const {api, avisar} = useSuite();
  if (error) return <Fallo>{error}</Fallo>;
  if (!res) return <Cargando />;
  if (abierta) {
    return <EditorNota id={abierta.id} escanear={abierta.escanear} res={res} onVolver={() => { setAbierta(null); recargar(); }}
      onBorrada={(r) => { setAbierta(null); fijar(r); avisar(r.mensaje); }} />;
  }
  // «Escanear ticket»: añade el gasto al borrador más reciente (o crea uno para este mes) y abre la cámara
  const escanear = async () => {
    try {
      let b = res.notas.find((n) => n.estado === 'BORRADOR');
      if (!b) {
        const hoy = new Date();
        b = await api('gastos.nuevaNota', {titulo: `Gastos de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][hoy.getMonth()]}`, viaje: ''});
      }
      setAbierta({id: b.id, escanear: true});
    } catch (e) { avisar(e.message, 'rojo'); }
  };
  const k = res.kpi;
  return (
    <>
      <div className="si-gas-cabecera">
        <TarjetaEmpresa yo={yo} res={res} />
        <div className="si-gas-flujo">
          <span className="si-etiqueta">Tu dinero</span>
          <div className="si-flujo">
            <div className="si-flujo-paso ambar"><span>📤</span><small>En aprobación</small><strong>{euros(k.pendienteAprobar)}</strong></div>
            <i>›</i>
            <div className="si-flujo-paso verde"><span>✅</span><small>Por cobrar</small><strong>{euros(k.pendienteCobro)}</strong></div>
            <i>›</i>
            <div className="si-flujo-paso azul"><span>💶</span><small>Cobrado {res.anio}</small><strong>{euros(k.cobrado)}</strong></div>
          </div>
          <small className="si-tenue">{k.borradores ? `📝 ${plural(k.borradores, 'borrador', 'borradores')} sin enviar` : 'Sin borradores pendientes'}
            {res.aprobador ? ` · aprueba ${res.aprobador.split(' ')[0]}` : ''}</small>
        </div>
        <div className="si-gas-acciones">
          <button type="button" className="si-escanear" onClick={escanear}>
            <span>📸</span><strong>Escanear ticket</strong><small>Foto del ticket y los datos se rellenan solos</small>
          </button>
          <button type="button" className="si-gas-secundario" onClick={() => setNuevaNota(true)}>＋ Nueva nota de gasto</button>
        </div>
      </div>

      {res.gastadoAnio > 0 && <div className="si-gas-graficos">
        <Tarjeta titulo="¿En qué se va el dinero?" accion={<span className="si-tenue">{res.anio}</span>}>
          <div className="si-gas-cats">
            <Anillo tam={150} grosor={20} centro={euros(res.gastadoAnio).replace(/,\d\d/, '')} sub="este año"
              segmentos={res.porCategoria.map((c) => ({valor: c.importe, color: COLOR_GASTO[c.id], etiqueta: `${c.nombre}: ${euros(c.importe)}`}))} />
            <ul>
              {[...res.porCategoria].sort((a, b) => b.importe - a.importe).map((c) => (
                <li key={c.id}>
                  <span className="si-cat-icono" style={{background: COLOR_GASTO[c.id] + '22'}}>{ICONOS_GASTO[c.id]}</span>
                  <div><span>{c.nombre}</span><div className="si-cat-barra"><i style={{width: `${(c.importe / res.gastadoAnio) * 100}%`, background: COLOR_GASTO[c.id]}} /></div></div>
                  <strong>{euros(c.importe)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Últimos 6 meses">
          <Barras alto={150} color="#0ea5e9" formato={(v) => euros(v).replace(/,\d\d/, '')}
            datos={res.porMes.map((m) => ({etiqueta: MES_CORTO[Number(m.mes.slice(5)) - 1], valor: m.importe, enCurso: true}))} />
        </Tarjeta>
      </div>}

      <Pestanas activa={pestana} onCambiar={setPestana} pestanas={[
        {id: 'notas', nombre: 'Mis notas de gasto', cuenta: k.borradores},
        {id: 'viajes', nombre: 'Viajes', cuenta: res.viajes.filter((v) => v.estado === 'PENDIENTE').length},
        res.puedePagar && {id: 'pagos', nombre: 'Pagos'},
      ]} />
      {pestana === 'notas' && <ListaNotas notas={res.notas} onAbrir={(id) => setAbierta({id})} />}
      {pestana === 'viajes' && <Viajes res={res} onCambio={fijar} />}
      {pestana === 'pagos' && <Pagos politica={res.politica} />}
      {nuevaNota && <NuevaNota res={res} onCerrar={() => setNuevaNota(false)} onCreada={(n) => { setNuevaNota(false); setAbierta({id: n.id}); }} />}
    </>
  );
}

/** Tarjeta de empresa (al estilo de las tarjetas de gasto corporativas). */
function TarjetaEmpresa({yo, res}) {
  const mes = res.porMes[res.porMes.length - 1];
  return (
    <div className="si-tarjeta-empresa">
      <div className="si-te-cab"><span className="si-te-chip" /><span>SUITE · GASTOS</span></div>
      <small>Gastado en {res.anio}</small>
      <strong>{euros(res.gastadoAnio)}</strong>
      <span className="si-te-mes">Este mes {euros(mes ? mes.importe : 0)}</span>
      <div className="si-te-pie">
        <span>{yo.nombre.toUpperCase()}</span>
        <span>•••• {String(1000 + ((yo.usuario.length * 739) % 9000)).slice(0, 4)}</span>
      </div>
    </div>
  );
}

const PASO_NUM = {BORRADOR: 0, ENVIADA: 1, APROBADA: 2, RECHAZADA: 2, PAGADA: 3};

// ---------- Mis notas ----------
function ListaNotas({notas, onAbrir}) {
  if (!notas.length) return <Tarjeta><Vacio icono="🧾">Aún no tienes notas de gasto. Escanea tu primer ticket.</Vacio></Tarjeta>;
  return (
    <div className="si-notas-tarjetas">
      {notas.map((n) => {
        const paso = PASO_NUM[n.estado];
        return (
          <button key={n.id} type="button" className={`si-nota-tarjeta estado-${n.estado.toLowerCase()}`} onClick={() => onAbrir(n.id)}>
            <div className="si-nt-cab">
              <Insignia tono={ESTADOS[n.estado].tono}>{ESTADOS[n.estado].nombre}</Insignia>
              <span className="si-tenue">GAS-{String(n.id).padStart(5, '0')}</span>
            </div>
            <strong className="si-nt-titulo">{n.titulo}</strong>
            <span className="si-nt-sub">{n.viaje ? `✈ ${n.viaje.destino} · ` : ''}{plural(n.numLineas, 'gasto', 'gastos')} · {fecha(n.enviado || n.creado)}</span>
            <div className="si-nt-medio">
              <div className="si-nt-iconos">
                {(n.categorias || []).slice(0, 4).map((c) => <span key={c} style={{background: COLOR_GASTO[c] + '22'}} title={c}>{ICONOS_GASTO[c]}</span>)}
              </div>
              <span className="si-nt-total">{euros(n.total)}</span>
            </div>
            <div className={`si-nt-pasos${n.estado === 'RECHAZADA' ? ' rechazo' : ''}`} title="Borrador › Enviada › Aprobada › Pagada">
              {[0, 1, 2, 3].map((i) => <i key={i} className={i <= paso ? 'hecho' : ''} />)}
            </div>
            {n.estado === 'RECHAZADA' && n.comentarioResp && <em className="si-negativo">{n.aprobador}: {n.comentarioResp}</em>}
            {n.estado === 'BORRADOR' && n.sinJustificar > 0 && <em className="si-ambar-texto">⚠ {plural(n.sinJustificar, 'gasto supera', 'gastos superan')} la política</em>}
            {n.comentarios > 0 && <em className="si-tenue">💬 {plural(n.comentarios, 'comentario', 'comentarios')}</em>}
          </button>
        );
      })}
    </div>
  );
}

function NuevaNota({res, onCerrar, onCreada}) {
  const {api, avisar} = useSuite();
  const [titulo, setTitulo] = useState('');
  const [viaje, setViaje] = useState('');
  const crear = async () => {
    try { onCreada(await api('gastos.nuevaNota', {titulo, viaje})); } catch (e) { avisar(e.message, 'rojo'); }
  };
  const viajes = res.viajes.filter((v) => v.estado === 'APROBADA');
  return (
    <Modal titulo="Nueva nota de gasto" onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>Cancelar</Boton><Boton tipo="primario" disabled={!titulo.trim()} onClick={crear}>Crear y añadir gastos</Boton></>}>
      <Campo etiqueta="Título"><input className="si-input" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)}
        placeholder="Ej.: Visita a clientes en Valencia" onKeyDown={(e) => { if (e.key === 'Enter' && titulo.trim()) crear(); }} /></Campo>
      {viajes.length > 0 && (
        <Campo etiqueta="Viaje asociado (opcional)">
          <select className="si-select si-ancho" value={viaje} onChange={(e) => setViaje(e.target.value)}>
            <option value="">Sin viaje</option>
            {viajes.map((v) => <option key={v.id} value={v.id}>{v.destino} · {rango(v.desde, v.hasta)}</option>)}
          </select>
        </Campo>
      )}
    </Modal>
  );
}

// ---------- Editor de una nota ----------
const PASOS = [['BORRADOR', 'Borrador', 'creado'], ['ENVIADA', 'Enviada', 'enviado'], ['APROBADA', 'Aprobada', 'resuelto'], ['PAGADA', 'Pagada', 'pagado']];

function Pasos({n}) {
  const orden = {BORRADOR: 0, ENVIADA: 1, APROBADA: 2, PAGADA: 3, RECHAZADA: 2};
  const actual = orden[n.estado];
  return (
    <ol className="si-pasos">
      {PASOS.map(([id, nombre, campo], i) => {
        const rechazo = n.estado === 'RECHAZADA' && i === 2;
        const hecho = i < actual || (i === actual && !rechazo);
        return (
          <li key={id} className={`${hecho ? 'hecho' : ''}${i === actual ? ' actual' : ''}${rechazo ? ' rechazo' : ''}`}>
            <span className="si-paso-punto">{rechazo ? '✕' : hecho ? '✓' : i + 1}</span>
            <span>{rechazo ? 'Rechazada' : nombre}</span>
            <small>{rechazo ? fecha(n.resuelto) : hecho && n[campo] ? fecha(n[campo]) : ''}</small>
          </li>
        );
      })}
    </ol>
  );
}

function EditorNota({id, escanear, res, onVolver, onBorrada}) {
  const {api, avisar} = useSuite();
  const [n, error, , fijar] = useDatos('gastos.nota', {id}, [id]);
  const [linea, setLinea] = useState(escanear ? {} : null);
  const [ticket, setTicket] = useState(null);
  const [titulo, setTitulo] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (n) setTitulo(n.titulo); }, [n && n.titulo]); // eslint-disable-line
  if (error) return <Fallo>{error}</Fallo>;
  if (!n) return <Cargando />;
  const editable = n.estado === 'BORRADOR' || n.estado === 'RECHAZADA';
  const viajes = res.viajes.filter((v) => v.estado === 'APROBADA');
  const llamar = async (op, params, msg) => {
    try {
      const r = await api(op, params);
      fijar(r);
      if (msg || r.mensaje) avisar(msg || r.mensaje);
      return r;
    } catch (e) { avisar(e.message, 'rojo'); return null; }
  };
  const guardarCabecera = (cambios) => llamar('gastos.guardarNota', {id, titulo, viaje: n.viaje ? n.viaje.id : '', ...cambios});
  const enviar = async () => {
    setEnviando(true);
    await llamar('gastos.enviar', {id});
    setEnviando(false);
  };
  const borrar = async () => {
    if (!window.confirm('¿Eliminar este borrador y todos sus gastos?')) return;
    try { onBorrada(await api('gastos.borrarNota', {id})); } catch (e) { avisar(e.message, 'rojo'); }
  };

  return (
    <Tarjeta className="si-editor">
      <div className="si-editor-cab">
        <button type="button" className="si-enlace" onClick={onVolver}>‹ Mis notas de gasto</button>
        <span className="si-tenue">GAS-{String(n.id).padStart(5, '0')}</span>
      </div>
      <div className="si-editor-titulo">
        {editable
          ? <input className="si-input si-titulo-nota" value={titulo} onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => { if (titulo.trim() && titulo !== n.titulo) guardarCabecera({titulo}); }} aria-label="Título de la nota" />
          : <h3>{n.titulo}</h3>}
        {editable && viajes.length > 0
          ? <select className="si-select" value={n.viaje ? n.viaje.id : ''} onChange={(e) => guardarCabecera({viaje: e.target.value})} aria-label="Viaje">
            <option value="">Sin viaje asociado</option>
            {viajes.map((v) => <option key={v.id} value={v.id}>✈ {v.destino} · {rango(v.desde, v.hasta)}</option>)}
          </select>
          : n.viaje && <Insignia tono="azul">✈ Viaje a {n.viaje.destino} · {rango(n.viaje.desde, n.viaje.hasta)}</Insignia>}
      </div>
      <Pasos n={n} />
      {n.estado === 'RECHAZADA' && n.comentarioResp && (
        <div className="si-banner si-banner-rojo"><b>{n.aprobador} la ha rechazado:</b> {n.comentarioResp} <span>Corrígela y vuelve a enviarla.</span></div>
      )}
      {n.estado === 'PAGADA' && <div className="si-banner si-banner-azul">Pagada el {fecha(n.pagado, {day: 'numeric', month: 'long'})} por {n.pagador}.</div>}

      <LineasNota n={n} politica={res.politica} onTicket={setTicket}
        acciones={editable && ((l) => <>
          <button type="button" className="si-icono-boton" title="Editar" onClick={() => setLinea(l)}>✎</button>
          <button type="button" className="si-icono-boton" title="Eliminar" onClick={() => {
            if (window.confirm(`¿Eliminar «${l.descripcion}»?`)) llamar('gastos.borrarLinea', {id: l.id}, 'Gasto eliminado');
          }}>🗑</button>
        </>)} />
      {editable && <Boton icono="＋" onClick={() => setLinea({})}>Añadir gasto</Boton>}

      <footer className="si-editor-pie">
        <div className="si-total"><span>Total</span><strong>{euros(n.total)}</strong></div>
        {editable && <div className="si-fila">
          {n.estado === 'BORRADOR' && <Boton tipo="peligro" onClick={borrar}>Eliminar borrador</Boton>}
          <Boton tipo="primario" disabled={enviando || !n.numLineas} onClick={enviar}>
            {res.aprobador ? `Enviar a ${res.aprobador.split(' ')[0]}` : 'Registrar'} ▸
          </Boton>
        </div>}
      </footer>
      {n.estado !== 'BORRADOR' && (
        <section className="si-seccion-chat">
          <h4>💬 Conversación con {n.estado === 'PAGADA' || n.estado === 'APROBADA' ? 'tu responsable y Administración' : res.aprobador || 'tu responsable'}</h4>
          <Conversacion clase="NOTA" objeto={n.id} compacta />
        </section>
      )}
      {linea && <LineaModal nota={n} linea={linea} politica={res.politica} destacar={escanear && !linea.id} onCerrar={() => setLinea(null)}
        onHecho={(r) => { setLinea(null); fijar(r); avisar(linea.id ? 'Gasto actualizado' : 'Gasto añadido'); }} />}
      {ticket && <VerTicket linea={ticket} onCerrar={() => setTicket(null)} />}
    </Tarjeta>
  );
}

/** Miniatura del ticket de una línea (se carga al mostrarse). */
function Miniatura({linea, onClick}) {
  const [t] = useDatos('gastos.ticket', {id: linea}, [linea]);
  const img = t && t.tipo !== 'application/pdf';
  return (
    <button type="button" className="si-miniatura" onClick={onClick} title="Ver el ticket">
      {img ? <img src={`data:${t.tipo};base64,${t.datos}`} alt="Ticket" /> : <span>{t ? 'PDF' : '…'}</span>}
    </button>
  );
}

/** Tabla de líneas de una nota (la usan el editor, Aprobaciones y Pagos). */
export function LineasNota({n, politica, onTicket, acciones}) {
  if (!n.lineas.length) return <Vacio icono="🧾">Añade el primer gasto de la nota con su ticket.</Vacio>;
  return (
    <div className="si-tabla-envoltura">
      <table className="si-tabla si-lineas">
        <thead><tr><th>Fecha</th><th>Gasto</th><th>Ticket</th><th className="si-derecha">Importe</th>{acciones && <th />}</tr></thead>
        <tbody>
          {n.lineas.map((l) => (
            <tr key={l.id}>
              <td className="si-dia">{fecha(l.fecha)}</td>
              <td>
                <div className="si-gasto">
                  <span className="si-gasto-icono" title={nombreCategoria(politica, l.categoria)}>{ICONOS_GASTO[l.categoria]}</span>
                  <div>
                    <strong>{l.descripcion}</strong>
                    <small>{nombreCategoria(politica, l.categoria)}{l.km ? ` · ${l.km} km × ${euros(politica.tarifaKm)}` : ''}
                      {l.iva ? ` · IVA ${euros(l.iva)}` : ''}</small>
                    {l.excede && <span className={`si-politica${l.justificacion ? '' : ' sin'}`}>
                      ⚠ Supera la política ({euros(l.limite)}){l.justificacion ? `: ${l.justificacion}` : ' · falta justificarlo'}
                    </span>}
                  </div>
                </div>
              </td>
              <td>{l.ticket
                ? <Miniatura linea={l.id} onClick={() => onTicket(l.id)} />
                : l.categoria === 'KILOMETRAJE' ? <span className="si-tenue">No aplica</span> : <span className="si-ambar-texto">Sin ticket</span>}</td>
              <td className="si-derecha"><strong>{euros(l.importe)}</strong></td>
              {acciones && <td className="si-derecha si-acciones-linea">{acciones(l)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Añadir / editar un gasto ----------
async function leerTicket(file) {
  const base64 = (blob) => new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = () => mal(new Error('No se pudo leer el fichero.'));
    r.readAsDataURL(blob);
  });
  if (file.type === 'application/pdf') {
    if (file.size > 4 * 1024 * 1024) throw new Error('El PDF ocupa demasiado (máximo 4 MB).');
    return {nombre: file.name, tipo: file.type, datos: await base64(file), vista: null};
  }
  if (!file.type.startsWith('image/')) throw new Error('Sube una foto del ticket o un PDF.');
  // Las fotos del móvil se reducen a 1400 px y JPEG para que el ticket ocupe poco
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.82));
  return {nombre: file.name.replace(/\.[^.]+$/, '') + '.jpg', tipo: 'image/jpeg', datos: await base64(blob), vista: URL.createObjectURL(blob)};
}

function LineaModal({nota, linea, politica, destacar, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const [cat, setCat] = useState(linea.categoria || 'COMIDA');
  const [f, setF] = useState(linea.fecha || iso(new Date()));
  const [desc, setDesc] = useState(linea.descripcion || '');
  const [importe, setImporte] = useState(importeTexto(linea.importe));
  const [iva, setIva] = useState(importeTexto(linea.iva));
  const [km, setKm] = useState(linea.km ? String(linea.km) : '');
  const [just, setJust] = useState(linea.justificacion || '');
  const [ticket, setTicket] = useState(null);
  const [quitar, setQuitar] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [leyendo, setLeyendo] = useState(null); // progreso del OCR (0-100) o null
  const [leido, setLeido] = useState(null);
  const categoria = politica.categorias.find((x) => x.id === cat);
  const km_ = cat === 'KILOMETRAJE';
  const cent = km_ ? (parseInt(km, 10) || 0) * politica.tarifaKm : Math.round(parseFloat((importe || '0').replace(/\./g, '').replace(',', '.')) * 100) || 0;
  const excede = categoria.limite > 0 && cent > categoria.limite;
  const ivaDe = (pct) => setIva(importeTexto(cent - Math.round(cent / (1 + pct / 100))));
  const elegir = async (file) => {
    if (!file) return;
    try { setTicket(await leerTicket(file)); setQuitar(false); } catch (e) { avisar(e.message, 'rojo'); return; }
    if (!file.type.startsWith('image/')) return;
    // Lectura automática: rellena categoría, fecha, importe, IVA y comercio a partir de la foto
    setLeido(null);
    setLeyendo(0);
    try {
      const r = await leerOCR(file, setLeyendo);
      if (r.categoria) setCat(r.categoria);
      if (r.fecha && r.fecha <= iso(new Date())) setF(r.fecha);
      if (r.total) setImporte(importeTexto(r.total));
      if (r.iva) setIva(importeTexto(r.iva));
      if (r.comercio) setDesc((d) => d.trim() || r.comercio);
      setLeido(r);
    } catch (e) {
      setLeido({error: e.message || 'No se pudo leer el ticket'});
    } finally { setLeyendo(null); }
  };
  const guardar = async () => {
    setEnviando(true);
    try {
      const r = await api('gastos.guardarLinea', {
        nota: nota.id, id: linea.id || '', fecha: f, categoria: cat, descripcion: desc, importe, iva, km, justificacion: just,
        ...(ticket ? {ticketNombre: ticket.nombre, ticketTipo: ticket.tipo, ticketDatos: ticket.datos} : {}),
        ...(quitar ? {quitarTicket: '1'} : {}),
      });
      onHecho(r);
    } catch (e) { avisar(e.message, 'rojo'); setEnviando(false); }
  };
  const tieneTicket = ticket || (linea.ticket && !quitar);
  return (
    <Modal titulo={linea.id ? 'Editar gasto' : 'Añadir gasto'} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton tipo="primario" disabled={enviando || leyendo !== null || !desc.trim() || cent <= 0 || (excede && !just.trim())} onClick={guardar}>Guardar gasto</Boton></>}>
      {!km_ && (
        <div className={`si-subida${arrastrando ? ' encima' : ''}${leyendo !== null ? ' leyendo' : ''}${destacar && !tieneTicket ? ' destacada' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files[0]); }}>
          {ticket && ticket.vista ? <img src={ticket.vista} alt="" /> : <span className="si-subida-icono">{tieneTicket ? '📎' : '📷'}</span>}
          <div>
            <strong>{ticket ? ticket.nombre : linea.ticket && !quitar ? linea.ticket : 'Empieza por el ticket'}</strong>
            <small>{leyendo !== null ? `Leyendo el ticket… ${leyendo}%`
              : tieneTicket ? 'Se guardará con el gasto' : 'Haz una foto o arrastra la imagen: los datos se rellenan solos'}</small>
            {leyendo !== null && <div className="si-barra fina"><div style={{width: `${Math.max(5, leyendo)}%`}} /></div>}
            <div className="si-fila">
              <label className="si-boton">{tieneTicket ? 'Cambiar' : '📷 Foto o PDF del ticket'}
                <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => elegir(e.target.files[0])} />
              </label>
              {tieneTicket && leyendo === null && <button type="button" className="si-enlace" onClick={() => { setTicket(null); setQuitar(true); setLeido(null); }}>Quitar</button>}
            </div>
          </div>
        </div>
      )}
      {leido && (leido.error
        ? <div className="si-banner si-banner-rojo">No se ha podido leer el ticket ({leido.error}). Rellena los datos a mano.</div>
        : <div className="si-ocr">
          <span>✨ Leído del ticket</span>
          {leido.comercio && <Insignia tono="violeta">{leido.comercio}</Insignia>}
          {leido.fecha && <Insignia tono="violeta">{fecha(leido.fecha)}</Insignia>}
          {leido.total !== null && <Insignia tono="violeta">Total {euros(leido.total)}</Insignia>}
          {leido.iva !== null && <Insignia tono="violeta">IVA {euros(leido.iva)}</Insignia>}
          {leido.categoria && <Insignia tono="violeta">{ICONOS_GASTO[leido.categoria]} {nombreCategoria(politica, leido.categoria)}</Insignia>}
          <small>Revisa que los datos son correctos.</small>
        </div>)}
      <div className="si-categorias">
        {politica.categorias.map((x) => (
          <button key={x.id} type="button" className={cat === x.id ? 'activa' : ''} onClick={() => setCat(x.id)}>
            <span>{ICONOS_GASTO[x.id]}</span>{x.nombre}
          </button>
        ))}
      </div>
      <div className="si-rejilla-2">
        <Campo etiqueta="Fecha"><input className="si-input" type="date" value={f} max={iso(new Date())} onChange={(e) => setF(e.target.value)} /></Campo>
        {km_
          ? <Campo etiqueta="Kilómetros"><input className="si-input" type="number" min="1" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Ej.: 120" /></Campo>
          : <Campo etiqueta="Importe total (IVA incluido)"><input className="si-input" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0,00 €" /></Campo>}
      </div>
      <Campo etiqueta="Descripción"><input className="si-input" value={desc} onChange={(e) => setDesc(e.target.value)}
        placeholder={km_ ? 'Ej.: Madrid – Toledo – Madrid' : 'Ej.: Comida con cliente (Grupo Levante)'} /></Campo>
      {km_
        ? <div className="si-calculo"><strong>{euros(cent)}</strong><span>{km || 0} km × {euros(politica.tarifaKm)} por km</span></div>
        : <Campo etiqueta="IVA (opcional)" ayuda={<>Calcular: <button type="button" className="si-enlace" onClick={() => ivaDe(10)}>10 %</button> · <button type="button" className="si-enlace" onClick={() => ivaDe(21)}>21 %</button></>}>
          <input className="si-input" inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} placeholder="0,00 €" />
        </Campo>}
      {categoria.limite > 0 && (
        <div className={`si-calculo${excede ? ' aviso' : ''}`}>
          <span>Política de gastos: hasta <b>{euros(categoria.limite)}</b> {categoria.unidad}.</span>
          {excede && <strong>Este gasto supera la política: explica el motivo.</strong>}
        </div>
      )}
      {(excede || linea.justificacion) && (
        <Campo etiqueta="Justificación"><textarea className="si-input" rows={2} value={just} onChange={(e) => setJust(e.target.value)}
          placeholder="Ej.: comida de cierre de contrato con el director de compras" /></Campo>
      )}
    </Modal>
  );
}

// ---------- Viajes ----------
function Viajes({res, onCambio}) {
  const {api, avisar} = useSuite();
  const [nuevo, setNuevo] = useState(false);
  const [chat, setChat] = useState(null);
  const hoy = iso(new Date());
  const cancelar = async (v) => {
    if (!window.confirm(`¿Cancelar el viaje a ${v.destino}?`)) return;
    try { const r = await api('viaje.cancelar', {id: v.id}); avisar(r.mensaje); onCambio(r); } catch (e) { avisar(e.message, 'rojo'); }
  };
  return (
    <Tarjeta titulo="Solicitudes de viaje" accion={<Boton tipo="primario" icono="✈" onClick={() => setNuevo(true)}>Solicitar viaje</Boton>}>
      {!res.viajes.length ? <Vacio icono="✈">Pide aquí la aprobación de un viaje antes de hacerlo; después podrás asociarle la nota de gastos.</Vacio> : (
        <div className="si-embarques">
          {res.viajes.map((v) => {
            const e = ESTADOS[v.estado];
            const gastado = res.notas.filter((n) => n.viaje && n.viaje.id === v.id).reduce((s, n) => s + n.total, 0);
            const pct = v.estimado ? Math.round((gastado / v.estimado) * 100) : 0;
            const codigo = v.destino.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
            return (
              <div key={v.id} className={`si-embarque${v.estado === 'CANCELADA' || v.estado === 'RECHAZADA' ? ' si-apagado' : ''}`}>
                <div className="si-emb-principal">
                  <div className="si-emb-cab">
                    <span>✈ Tarjeta de viaje · VIA-{String(v.id).padStart(4, '0')}</span>
                    <Insignia tono={e.tono}>{e.nombre}</Insignia>
                  </div>
                  <div className="si-emb-ruta">
                    <div><b>MAD</b><small>Madrid</small></div>
                    <span className="si-emb-avion"><i />✈<i /></span>
                    <div><b>{codigo}</b><small>{v.destino}</small></div>
                  </div>
                  <q>{v.motivo}</q>
                  {v.comentarioResp && <p className="si-respuesta"><b>{v.aprobador}:</b> {v.comentarioResp}</p>}
                  <div className="si-fila">
                    <BotonConversacion cuenta={v.comentarios} abierta={chat === v.id} onAlternar={() => setChat(chat === v.id ? null : v.id)} />
                    {(v.estado === 'PENDIENTE' || (v.estado === 'APROBADA' && v.desde > hoy)) &&
                      <button type="button" className="si-enlace" onClick={() => cancelar(v)}>Cancelar viaje</button>}
                  </div>
                  {chat === v.id && <Conversacion clase="VIAJE" objeto={v.id} compacta />}
                </div>
                <div className="si-emb-talon">
                  <div><small>Ida</small><b>{fecha(v.desde)}</b></div>
                  <div><small>Vuelta</small><b>{fecha(v.hasta)}</b></div>
                  <div><small>Presupuesto</small><b>{euros(v.estimado)}</b></div>
                  <div className="si-emb-gasto">
                    <small>Gastado {gastado ? `· ${pct}%` : ''}</small>
                    <b className={pct > 100 ? 'si-negativo' : ''}>{euros(gastado)}</b>
                    <div className="si-cat-barra"><i style={{width: `${Math.min(100, pct)}%`, background: pct > 100 ? 'var(--si-rojo)' : '#0ea5e9'}} /></div>
                  </div>
                  <small className="si-tenue">{v.estado === 'PENDIENTE' ? `Pedido el ${fecha(v.creado)}` : v.aprobador ? `${v.estado === 'RECHAZADA' ? 'Rechazó' : 'Aprobó'} ${v.aprobador.split(' ')[0]}` : ''}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {nuevo && <SolicitarViaje res={res} onCerrar={() => setNuevo(false)} onHecho={(r) => { setNuevo(false); onCambio(r); }} />}
    </Tarjeta>
  );
}

function SolicitarViaje({res, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const manana = new Date();
  manana.setDate(manana.getDate() + 7);
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [desde, setDesde] = useState(iso(manana));
  const [hasta, setHasta] = useState(iso(manana));
  const [estimado, setEstimado] = useState('');
  const enviar = async () => {
    try { const r = await api('viaje.solicitar', {destino, motivo, desde, hasta, estimado}); avisar(r.mensaje); onHecho(r); } catch (e) { avisar(e.message, 'rojo'); }
  };
  return (
    <Modal titulo="Solicitar viaje" onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>Cancelar</Boton><Boton tipo="primario" disabled={!destino.trim() || !motivo.trim() || !estimado}
        onClick={enviar}>{res.aprobador ? `Enviar a ${res.aprobador.split(' ')[0]}` : 'Registrar'}</Boton></>}>
      <Campo etiqueta="Destino"><input className="si-input" autoFocus value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Ej.: Barcelona" /></Campo>
      <div className="si-rejilla-2">
        <Campo etiqueta="Ida"><input className="si-input" type="date" value={desde} min={iso(new Date())}
          onChange={(e) => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value); }} /></Campo>
        <Campo etiqueta="Vuelta"><input className="si-input" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="Importe estimado" ayuda="Transporte, alojamiento y dietas previstos.">
        <input className="si-input" inputMode="decimal" value={estimado} onChange={(e) => setEstimado(e.target.value)} placeholder="0,00 €" />
      </Campo>
      <Campo etiqueta="Motivo"><textarea className="si-input" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej.: reunión con el distribuidor para cerrar el acuerdo anual" /></Campo>
    </Modal>
  );
}

// ---------- Pagos (Administración) ----------
function Pagos({politica}) {
  const {api, avisar} = useSuite();
  const [d, error, , fijar] = useDatos('gastos.pagos', {}, []);
  const [sel, setSel] = useState(new Set());
  const [ver, setVer] = useState(null);
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const marcadas = d.porPagar.filter((n) => sel.has(n.id));
  const totalSel = marcadas.reduce((s, n) => s + n.total, 0);
  const alternar = (id) => setSel((s) => { const t = new Set(s); if (t.has(id)) t.delete(id); else t.add(id); return t; });
  const pagar = async () => {
    try {
      const r = await api('gastos.pagar', {ids: [...sel].join(',')});
      setSel(new Set());
      fijar(r);
      avisar(r.mensaje);
    } catch (e) { avisar(e.message, 'rojo'); }
  };
  const exportar = async () => {
    try {
      const r = await api('gastos.exportar', {anio, mes});
      if (!r.filas) { avisar('No hay gastos pagados en ese mes.', 'ambar'); return; }
      descargar(r.nombre, r.contenido);
      avisar(`Descargado ${r.nombre} (${plural(r.filas, 'línea', 'líneas')})`);
    } catch (e) { avisar(e.message, 'rojo'); }
  };
  return (
    <>
      <Tarjeta titulo={`Pendiente de pago · ${euros(d.totalPorPagar)}`}
        accion={<Boton tipo="exito" disabled={!marcadas.length} onClick={pagar}>
          {marcadas.length ? `Marcar ${plural(marcadas.length, 'nota', 'notas')} como pagadas · ${euros(totalSel)}` : 'Marcar como pagadas'}
        </Boton>}>
        {!d.porPagar.length ? <Vacio>No hay notas aprobadas pendientes de pago.</Vacio> : (
          <div className="si-tabla-envoltura">
            <table className="si-tabla">
              <thead><tr>
                <th><input type="checkbox" aria-label="Todas" checked={sel.size === d.porPagar.length}
                  onChange={(e) => setSel(e.target.checked ? new Set(d.porPagar.map((n) => n.id)) : new Set())} /></th>
                <th>Persona</th><th>Nota</th><th>Aprobada</th><th>Avisos</th><th className="si-derecha">Importe</th><th />
              </tr></thead>
              <tbody>
                {d.porPagar.map((n) => (
                  <tr key={n.id} className={sel.has(n.id) ? 'si-seleccionada' : ''}>
                    <td><input type="checkbox" checked={sel.has(n.id)} onChange={() => alternar(n.id)} aria-label={`Seleccionar ${n.titulo}`} /></td>
                    <td><strong>{n.persona.nombre}</strong><br /><small>{n.persona.departamento}</small></td>
                    <td>{n.titulo}<br /><small>GAS-{String(n.id).padStart(5, '0')} · {plural(n.numLineas, 'gasto', 'gastos')}</small></td>
                    <td>{fecha(n.resuelto)}<br /><small>{n.aprobador}</small></td>
                    <td>{n.excedidas > 0 && <Insignia tono="ambar">{n.excedidas} fuera de política</Insignia>}
                      {n.sinTicket > 0 && <Insignia tono="rojo">{n.sinTicket} sin ticket</Insignia>}</td>
                    <td className="si-derecha"><strong>{euros(n.total)}</strong></td>
                    <td className="si-derecha"><button type="button" className="si-enlace" onClick={() => setVer(n.id)}>Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      <Tarjeta titulo="Exportar a contabilidad" accion={<SelectorMes anio={anio} mes={mes} onCambiar={(a, m) => { setAnio(a); setMes(m); }} />}>
        <p>Fichero CSV con las líneas de las notas <strong>pagadas</strong> en el mes: empleado, departamento, categoría, base imponible, IVA y total.</p>
        <Boton tipo="primario" icono="⤓" onClick={exportar}>Exportar (CSV)</Boton>
      </Tarjeta>
      {d.pagadas.length > 0 && (
        <Tarjeta titulo="Pagadas recientemente">
          <ul className="si-lista si-historial">
            {d.pagadas.map((n) => (
              <li key={n.id}>
                <span className="si-hist-texto"><strong>{n.persona.nombre}</strong> · {n.titulo}</span>
                <strong>{euros(n.total)}</strong>
                <small className="si-tenue">{fecha(n.pagado)} · {n.pagador}</small>
                <button type="button" className="si-enlace" onClick={() => setVer(n.id)}>Ver</button>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
      {ver && <DetalleNota id={ver} politica={politica} onCerrar={() => setVer(null)} />}
    </>
  );
}

/** Nota de gasto en modo lectura (con sus tickets), en una ventana. */
export function DetalleNota({id, politica, onCerrar}) {
  const [n, error] = useDatos('gastos.nota', {id}, [id]);
  const [ticket, setTicket] = useState(null);
  return (
    <>
      <Modal ancho titulo={n ? `${n.titulo} · ${n.persona.nombre}` : 'Nota de gasto'} onCerrar={onCerrar}>
        {error && <Fallo>{error}</Fallo>}
        {!n ? <Cargando /> : <div className="si-detalle-nota">
          <Pasos n={n} />
          <LineasNota n={n} politica={politica} onTicket={setTicket} />
          <div className="si-total"><span>Total</span><strong>{euros(n.total)}</strong></div>
        </div>}
      </Modal>
      {ticket && <VerTicket linea={ticket} onCerrar={() => setTicket(null)} />}
    </>
  );
}
