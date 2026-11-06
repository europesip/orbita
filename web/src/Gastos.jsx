// Gastos y viajes: notas de gasto con tickets y política, solicitudes de viaje y pagos (Administración).
import React, {useEffect, useState} from 'react';
import {
  Boton, Campo, Cargando, ESTADOS, Fallo, ICONOS_GASTO, Insignia, Modal, Pestanas, SelectorMes, Tarjeta, Vacio, VerTicket,
  centimosDe, descargar, euros, eurosRedondo, fecha, importeTexto, iso, plural, rango, useDatos, useSuite,
} from './ui.jsx';
import {locale, t} from './i18n.js';
import {leerTicket as leerOCR} from './ocr.js';
import {Anillo, Barras} from './graficos.jsx';
import {BotonConversacion, Conversacion} from './social.jsx';

const nombreCategoria = (politica, id) => t((politica.categorias.find((c) => c.id === id) || {nombre: id}).nombre);

const COLOR_GASTO = {COMIDA: '#f97316', HOTEL: '#8b5cf6', TRANSPORTE: '#0ea5e9', KILOMETRAJE: '#10b981', PARKING: '#64748b', OTROS: '#ec4899'};
const mesCorto = (m) => new Date(2000, m, 1).toLocaleDateString(locale(), {month: 'short'}).replace('.', '');

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
        b = await api('gastos.nuevaNota', {titulo: t('Gastos de {mes}', {mes: hoy.toLocaleDateString(locale(), {month: 'long'})}), viaje: ''});
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
          <span className="si-etiqueta">{t('Tu dinero')}</span>
          <div className="si-flujo">
            <div className="si-flujo-paso ambar"><span>📤</span><small>{t('En aprobación')}</small><strong>{euros(k.pendienteAprobar)}</strong></div>
            <i>›</i>
            <div className="si-flujo-paso verde"><span>✅</span><small>{t('Por cobrar')}</small><strong>{euros(k.pendienteCobro)}</strong></div>
            <i>›</i>
            <div className="si-flujo-paso azul"><span>💶</span><small>{t('Cobrado {anio}', {anio: res.anio})}</small><strong>{euros(k.cobrado)}</strong></div>
          </div>
          <small className="si-tenue">{k.borradores ? `📝 ${t('{n} sin enviar', {n: plural(k.borradores, 'borrador', 'borradores')})}` : t('Sin borradores pendientes')}
            {res.aprobador ? ` · ${t('aprueba {quien}', {quien: res.aprobador.split(' ')[0]})}` : ''}</small>
        </div>
        <div className="si-gas-acciones">
          <button type="button" className="si-escanear" onClick={escanear}>
            <span>📸</span><strong>{t('Escanear ticket')}</strong><small>{t('Foto del ticket y los datos se rellenan solos')}</small>
          </button>
          <button type="button" className="si-gas-secundario" onClick={() => setNuevaNota(true)}>＋ {t('Nueva nota de gasto')}</button>
        </div>
      </div>

      {res.gastadoAnio > 0 && <div className="si-gas-graficos">
        <Tarjeta titulo={t('¿En qué se va el dinero?')} accion={<span className="si-tenue">{res.anio}</span>}>
          <div className="si-gas-cats">
            <Anillo tam={150} grosor={20} centro={eurosRedondo(res.gastadoAnio)} sub={t('este año')}
              segmentos={res.porCategoria.map((c) => ({valor: c.importe, color: COLOR_GASTO[c.id], etiqueta: `${t(c.nombre)}: ${euros(c.importe)}`}))} />
            <ul>
              {[...res.porCategoria].sort((a, b) => b.importe - a.importe).map((c) => (
                <li key={c.id}>
                  <span className="si-cat-icono" style={{background: COLOR_GASTO[c.id] + '22'}}>{ICONOS_GASTO[c.id]}</span>
                  <div><span>{t(c.nombre)}</span><div className="si-cat-barra"><i style={{width: `${(c.importe / res.gastadoAnio) * 100}%`, background: COLOR_GASTO[c.id]}} /></div></div>
                  <strong>{euros(c.importe)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </Tarjeta>
        <Tarjeta titulo={t('Últimos 6 meses')}>
          <Barras alto={150} color="#0ea5e9" formato={(v) => eurosRedondo(v)}
            datos={res.porMes.map((m) => ({etiqueta: mesCorto(Number(m.mes.slice(5)) - 1), valor: m.importe, enCurso: true}))} />
        </Tarjeta>
      </div>}

      <Pestanas activa={pestana} onCambiar={setPestana} pestanas={[
        {id: 'notas', nombre: t('Mis notas de gasto'), cuenta: k.borradores},
        {id: 'viajes', nombre: t('Viajes'), cuenta: res.viajes.filter((v) => v.estado === 'PENDIENTE').length},
        res.puedePagar && {id: 'pagos', nombre: t('Pagos')},
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
      <div className="si-te-cab"><span className="si-te-chip" /><span>{t('SUITE · GASTOS')}</span></div>
      <small>{t('Gastado en {anio}', {anio: res.anio})}</small>
      <strong>{euros(res.gastadoAnio)}</strong>
      <span className="si-te-mes">{t('Este mes')} {euros(mes ? mes.importe : 0)}</span>
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
  if (!notas.length) return <Tarjeta><Vacio icono="🧾">{t('Aún no tienes notas de gasto. Escanea tu primer ticket.')}</Vacio></Tarjeta>;
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
                {(n.categorias || []).slice(0, 4).map((c) => <span key={c} style={{background: COLOR_GASTO[c] + '22'}} title={t(c)}>{ICONOS_GASTO[c]}</span>)}
              </div>
              <span className="si-nt-total">{euros(n.total)}</span>
            </div>
            <div className={`si-nt-pasos${n.estado === 'RECHAZADA' ? ' rechazo' : ''}`} title={t('Borrador › Enviada › Aprobada › Pagada')}>
              {[0, 1, 2, 3].map((i) => <i key={i} className={i <= paso ? 'hecho' : ''} />)}
            </div>
            {n.estado === 'RECHAZADA' && n.comentarioResp && <em className="si-negativo">{n.aprobador}: {n.comentarioResp}</em>}
            {n.estado === 'BORRADOR' && n.sinJustificar > 0 && <em className="si-ambar-texto">⚠ {t('{n} la política', {n: plural(n.sinJustificar, 'gasto supera', 'gastos superan')})}</em>}
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
    <Modal titulo={t('Nueva nota de gasto')} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton><Boton tipo="primario" disabled={!titulo.trim()} onClick={crear}>{t('Crear y añadir gastos')}</Boton></>}>
      <Campo etiqueta={t('Título')}><input className="si-input" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)}
        placeholder={t('Ej.: Visita a clientes en Valencia')} onKeyDown={(e) => { if (e.key === 'Enter' && titulo.trim()) crear(); }} /></Campo>
      {viajes.length > 0 && (
        <Campo etiqueta={t('Viaje asociado (opcional)')}>
          <select className="si-select si-ancho" value={viaje} onChange={(e) => setViaje(e.target.value)}>
            <option value="">{t('Sin viaje')}</option>
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
            <span>{t(rechazo ? 'Rechazada' : nombre)}</span>
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
    if (!window.confirm(t('¿Eliminar este borrador y todos sus gastos?'))) return;
    try { onBorrada(await api('gastos.borrarNota', {id})); } catch (e) { avisar(e.message, 'rojo'); }
  };

  return (
    <Tarjeta className="si-editor">
      <div className="si-editor-cab">
        <button type="button" className="si-enlace" onClick={onVolver}>‹ {t('Mis notas de gasto')}</button>
        <span className="si-tenue">GAS-{String(n.id).padStart(5, '0')}</span>
      </div>
      <div className="si-editor-titulo">
        {editable
          ? <input className="si-input si-titulo-nota" value={titulo} onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => { if (titulo.trim() && titulo !== n.titulo) guardarCabecera({titulo}); }} aria-label={t('Título de la nota')} />
          : <h3>{n.titulo}</h3>}
        {editable && viajes.length > 0
          ? <select className="si-select" value={n.viaje ? n.viaje.id : ''} onChange={(e) => guardarCabecera({viaje: e.target.value})} aria-label={t('Viaje')}>
            <option value="">{t('Sin viaje asociado')}</option>
            {viajes.map((v) => <option key={v.id} value={v.id}>✈ {v.destino} · {rango(v.desde, v.hasta)}</option>)}
          </select>
          : n.viaje && <Insignia tono="azul">✈ {t('Viaje a {destino} · {rango}', {destino: n.viaje.destino, rango: rango(n.viaje.desde, n.viaje.hasta)})}</Insignia>}
      </div>
      <Pasos n={n} />
      {n.estado === 'RECHAZADA' && n.comentarioResp && (
        <div className="si-banner si-banner-rojo"><b>{t('{quien} la ha rechazado:', {quien: n.aprobador})}</b> {n.comentarioResp} <span>{t('Corrígela y vuelve a enviarla.')}</span></div>
      )}
      {n.estado === 'PAGADA' && <div className="si-banner si-banner-azul">{t('Pagada el {fecha} por {quien}.', {fecha: fecha(n.pagado, {day: 'numeric', month: 'long'}), quien: n.pagador})}</div>}

      <LineasNota n={n} politica={res.politica} onTicket={setTicket}
        acciones={editable && ((l) => <>
          <button type="button" className="si-icono-boton" title={t('Editar')} onClick={() => setLinea(l)}>✎</button>
          <button type="button" className="si-icono-boton" title={t('Eliminar')} onClick={() => {
            if (window.confirm(t('¿Eliminar «{desc}»?', {desc: l.descripcion}))) llamar('gastos.borrarLinea', {id: l.id}, t('Gasto eliminado'));
          }}>🗑</button>
        </>)} />
      {editable && <Boton icono="＋" onClick={() => setLinea({})}>{t('Añadir gasto')}</Boton>}

      <footer className="si-editor-pie">
        <div className="si-total"><span>{t('Total')}</span><strong>{euros(n.total)}</strong></div>
        {editable && <div className="si-fila">
          {n.estado === 'BORRADOR' && <Boton tipo="peligro" onClick={borrar}>{t('Eliminar borrador')}</Boton>}
          <Boton tipo="primario" disabled={enviando || !n.numLineas} onClick={enviar}>
            {res.aprobador ? t('Enviar a {quien}', {quien: res.aprobador.split(' ')[0]}) : t('Registrar')} ▸
          </Boton>
        </div>}
      </footer>
      {n.estado !== 'BORRADOR' && (
        <section className="si-seccion-chat">
          <h4>💬 {t('Conversación con {quien}', {quien: n.estado === 'PAGADA' || n.estado === 'APROBADA' ? t('tu responsable y Administración') : res.aprobador || t('tu responsable')})}</h4>
          <Conversacion clase="NOTA" objeto={n.id} compacta />
        </section>
      )}
      {linea && <LineaModal nota={n} linea={linea} politica={res.politica} destacar={escanear && !linea.id} onCerrar={() => setLinea(null)}
        onHecho={(r) => { setLinea(null); fijar(r); avisar(t(linea.id ? 'Gasto actualizado' : 'Gasto añadido')); }} />}
      {ticket && <VerTicket linea={ticket} onCerrar={() => setTicket(null)} />}
    </Tarjeta>
  );
}

/** Miniatura del ticket de una línea (se carga al mostrarse). */
function Miniatura({linea, onClick}) {
  const [tk] = useDatos('gastos.ticket', {id: linea}, [linea]);
  const img = tk && tk.tipo !== 'application/pdf';
  return (
    <button type="button" className="si-miniatura" onClick={onClick} title={t('Ver el ticket')}>
      {img ? <img src={`data:${tk.tipo};base64,${tk.datos}`} alt={t('Ticket')} /> : <span>{tk ? 'PDF' : '…'}</span>}
    </button>
  );
}

/** Tabla de líneas de una nota (la usan el editor, Aprobaciones y Pagos). */
export function LineasNota({n, politica, onTicket, acciones}) {
  if (!n.lineas.length) return <Vacio icono="🧾">{t('Añade el primer gasto de la nota con su ticket.')}</Vacio>;
  return (
    <div className="si-tabla-envoltura">
      <table className="si-tabla si-lineas">
        <thead><tr><th>{t('Fecha')}</th><th>{t('Gasto')}</th><th>{t('Ticket')}</th><th className="si-derecha">{t('Importe')}</th>{acciones && <th />}</tr></thead>
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
                      {l.iva ? ` · ${t('IVA')} ${euros(l.iva)}` : ''}</small>
                    {l.excede && <span className={`si-politica${l.justificacion ? '' : ' sin'}`}>
                      ⚠ {t('Supera la política ({limite})', {limite: euros(l.limite)})}{l.justificacion ? `: ${l.justificacion}` : ` · ${t('falta justificarlo')}`}
                    </span>}
                  </div>
                </div>
              </td>
              <td>{l.ticket
                ? <Miniatura linea={l.id} onClick={() => onTicket(l.id)} />
                : l.categoria === 'KILOMETRAJE' ? <span className="si-tenue">{t('No aplica')}</span> : <span className="si-ambar-texto">{t('Sin ticket')}</span>}</td>
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
    r.onerror = () => mal(new Error(t('No se pudo leer el fichero.')));
    r.readAsDataURL(blob);
  });
  if (file.type === 'application/pdf') {
    if (file.size > 4 * 1024 * 1024) throw new Error(t('El PDF ocupa demasiado (máximo 4 MB).'));
    return {nombre: file.name, tipo: file.type, datos: await base64(file), vista: null};
  }
  if (!file.type.startsWith('image/')) throw new Error(t('Sube una foto del ticket o un PDF.'));
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
  const cent = km_ ? (parseInt(km, 10) || 0) * politica.tarifaKm : centimosDe(importe);
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
      setLeido({error: e.message || t('No se pudo leer el ticket')});
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
    <Modal titulo={t(linea.id ? 'Editar gasto' : 'Añadir gasto')} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton>
        <Boton tipo="primario" disabled={enviando || leyendo !== null || !desc.trim() || cent <= 0 || (excede && !just.trim())} onClick={guardar}>{t('Guardar gasto')}</Boton></>}>
      {!km_ && (
        <div className={`si-subida${arrastrando ? ' encima' : ''}${leyendo !== null ? ' leyendo' : ''}${destacar && !tieneTicket ? ' destacada' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files[0]); }}>
          {ticket && ticket.vista ? <img src={ticket.vista} alt="" /> : <span className="si-subida-icono">{tieneTicket ? '📎' : '📷'}</span>}
          <div>
            <strong>{ticket ? ticket.nombre : linea.ticket && !quitar ? linea.ticket : t('Empieza por el ticket')}</strong>
            <small>{leyendo !== null ? `${t('Leyendo el ticket…')} ${leyendo}%`
              : t(tieneTicket ? 'Se guardará con el gasto' : 'Haz una foto o arrastra la imagen: los datos se rellenan solos')}</small>
            {leyendo !== null && <div className="si-barra fina"><div style={{width: `${Math.max(5, leyendo)}%`}} /></div>}
            <div className="si-fila">
              <label className="si-boton">{tieneTicket ? t('Cambiar') : `📷 ${t('Foto o PDF del ticket')}`}
                <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => elegir(e.target.files[0])} />
              </label>
              {tieneTicket && leyendo === null && <button type="button" className="si-enlace" onClick={() => { setTicket(null); setQuitar(true); setLeido(null); }}>{t('Quitar')}</button>}
            </div>
          </div>
        </div>
      )}
      {leido && (leido.error
        ? <div className="si-banner si-banner-rojo">{t('No se ha podido leer el ticket ({error}). Rellena los datos a mano.', {error: leido.error})}</div>
        : <div className="si-ocr">
          <span>✨ {t('Leído del ticket')}</span>
          {leido.comercio && <Insignia tono="violeta">{leido.comercio}</Insignia>}
          {leido.fecha && <Insignia tono="violeta">{fecha(leido.fecha)}</Insignia>}
          {leido.total !== null && <Insignia tono="violeta">{t('Total')} {euros(leido.total)}</Insignia>}
          {leido.iva !== null && <Insignia tono="violeta">{t('IVA')} {euros(leido.iva)}</Insignia>}
          {leido.categoria && <Insignia tono="violeta">{ICONOS_GASTO[leido.categoria]} {nombreCategoria(politica, leido.categoria)}</Insignia>}
          <small>{t('Revisa que los datos son correctos.')}</small>
        </div>)}
      <div className="si-categorias">
        {politica.categorias.map((x) => (
          <button key={x.id} type="button" className={cat === x.id ? 'activa' : ''} onClick={() => setCat(x.id)}>
            <span>{ICONOS_GASTO[x.id]}</span>{t(x.nombre)}
          </button>
        ))}
      </div>
      <div className="si-rejilla-2">
        <Campo etiqueta={t('Fecha')}><input className="si-input" type="date" value={f} max={iso(new Date())} onChange={(e) => setF(e.target.value)} /></Campo>
        {km_
          ? <Campo etiqueta={t('Kilómetros')}><input className="si-input" type="number" min="1" value={km} onChange={(e) => setKm(e.target.value)} placeholder={t('Ej.: 120')} /></Campo>
          : <Campo etiqueta={t('Importe total (IVA incluido)')}><input className="si-input" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder={euros(0)} /></Campo>}
      </div>
      <Campo etiqueta={t('Descripción')}><input className="si-input" value={desc} onChange={(e) => setDesc(e.target.value)}
        placeholder={t(km_ ? 'Ej.: Madrid – Toledo – Madrid' : 'Ej.: Comida con cliente (Grupo Levante)')} /></Campo>
      {km_
        ? <div className="si-calculo"><strong>{euros(cent)}</strong><span>{km || 0} km × {euros(politica.tarifaKm)} {t('por km')}</span></div>
        : <Campo etiqueta={t('IVA (opcional)')} ayuda={<>{t('Calcular:')} <button type="button" className="si-enlace" onClick={() => ivaDe(10)}>10 %</button> · <button type="button" className="si-enlace" onClick={() => ivaDe(21)}>21 %</button></>}>
          <input className="si-input" inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} placeholder={euros(0)} />
        </Campo>}
      {categoria.limite > 0 && (
        <div className={`si-calculo${excede ? ' aviso' : ''}`}>
          <span>{t('Política de gastos: hasta')} <b>{euros(categoria.limite)}</b> {t(categoria.unidad)}.</span>
          {excede && <strong>{t('Este gasto supera la política: explica el motivo.')}</strong>}
        </div>
      )}
      {(excede || linea.justificacion) && (
        <Campo etiqueta={t('Justificación')}><textarea className="si-input" rows={2} value={just} onChange={(e) => setJust(e.target.value)}
          placeholder={t('Ej.: comida de cierre de contrato con el director de compras')} /></Campo>
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
    if (!window.confirm(t('¿Cancelar el viaje a {destino}?', {destino: v.destino}))) return;
    try { const r = await api('viaje.cancelar', {id: v.id}); avisar(r.mensaje); onCambio(r); } catch (e) { avisar(e.message, 'rojo'); }
  };
  return (
    <Tarjeta titulo={t('Solicitudes de viaje')} accion={<Boton tipo="primario" icono="✈" onClick={() => setNuevo(true)}>{t('Solicitar viaje')}</Boton>}>
      {!res.viajes.length ? <Vacio icono="✈">{t('Pide aquí la aprobación de un viaje antes de hacerlo; después podrás asociarle la nota de gastos.')}</Vacio> : (
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
                    <span>✈ {t('Tarjeta de viaje')} · VIA-{String(v.id).padStart(4, '0')}</span>
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
                      <button type="button" className="si-enlace" onClick={() => cancelar(v)}>{t('Cancelar viaje')}</button>}
                  </div>
                  {chat === v.id && <Conversacion clase="VIAJE" objeto={v.id} compacta />}
                </div>
                <div className="si-emb-talon">
                  <div><small>{t('Ida')}</small><b>{fecha(v.desde)}</b></div>
                  <div><small>{t('Vuelta')}</small><b>{fecha(v.hasta)}</b></div>
                  <div><small>{t('Presupuesto')}</small><b>{euros(v.estimado)}</b></div>
                  <div className="si-emb-gasto">
                    <small>{t('Gastado')} {gastado ? `· ${pct}%` : ''}</small>
                    <b className={pct > 100 ? 'si-negativo' : ''}>{euros(gastado)}</b>
                    <div className="si-cat-barra"><i style={{width: `${Math.min(100, pct)}%`, background: pct > 100 ? 'var(--si-rojo)' : '#0ea5e9'}} /></div>
                  </div>
                  <small className="si-tenue">{v.estado === 'PENDIENTE' ? t('Pedido el {fecha}', {fecha: fecha(v.creado)}) : v.aprobador ? t(v.estado === 'RECHAZADA' ? 'Rechazó {quien}' : 'Aprobó {quien}', {quien: v.aprobador.split(' ')[0]}) : ''}</small>
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
    <Modal titulo={t('Solicitar viaje')} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton><Boton tipo="primario" disabled={!destino.trim() || !motivo.trim() || !estimado}
        onClick={enviar}>{res.aprobador ? t('Enviar a {quien}', {quien: res.aprobador.split(' ')[0]}) : t('Registrar')}</Boton></>}>
      <Campo etiqueta={t('Destino')}><input className="si-input" autoFocus value={destino} onChange={(e) => setDestino(e.target.value)} placeholder={t('Ej.: Barcelona')} /></Campo>
      <div className="si-rejilla-2">
        <Campo etiqueta={t('Ida')}><input className="si-input" type="date" value={desde} min={iso(new Date())}
          onChange={(e) => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value); }} /></Campo>
        <Campo etiqueta={t('Vuelta')}><input className="si-input" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></Campo>
      </div>
      <Campo etiqueta={t('Importe estimado')} ayuda={t('Transporte, alojamiento y dietas previstos.')}>
        <input className="si-input" inputMode="decimal" value={estimado} onChange={(e) => setEstimado(e.target.value)} placeholder={euros(0)} />
      </Campo>
      <Campo etiqueta={t('Motivo')}><textarea className="si-input" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
        placeholder={t('Ej.: reunión con el distribuidor para cerrar el acuerdo anual')} /></Campo>
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
  const alternar = (id) => setSel((s) => { const c = new Set(s); if (c.has(id)) c.delete(id); else c.add(id); return c; });
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
      if (!r.filas) { avisar(t('No hay gastos pagados en ese mes.'), 'ambar'); return; }
      descargar(r.nombre, r.contenido);
      avisar(`${t('Descargado {nombre}', {nombre: r.nombre})} (${plural(r.filas, 'línea', 'líneas')})`);
    } catch (e) { avisar(e.message, 'rojo'); }
  };
  return (
    <>
      <Tarjeta titulo={`${t('Pendiente de pago')} · ${euros(d.totalPorPagar)}`}
        accion={<Boton tipo="exito" disabled={!marcadas.length} onClick={pagar}>
          {marcadas.length ? `${t('Marcar {n} como pagadas', {n: plural(marcadas.length, 'nota', 'notas')})} · ${euros(totalSel)}` : t('Marcar como pagadas')}
        </Boton>}>
        {!d.porPagar.length ? <Vacio>{t('No hay notas aprobadas pendientes de pago.')}</Vacio> : (
          <div className="si-tabla-envoltura">
            <table className="si-tabla">
              <thead><tr>
                <th><input type="checkbox" aria-label={t('Todas')} checked={sel.size === d.porPagar.length}
                  onChange={(e) => setSel(e.target.checked ? new Set(d.porPagar.map((n) => n.id)) : new Set())} /></th>
                <th>{t('Persona')}</th><th>{t('Nota')}</th><th>{t('Aprobada')}</th><th>{t('Avisos|pagos')}</th><th className="si-derecha">{t('Importe')}</th><th />
              </tr></thead>
              <tbody>
                {d.porPagar.map((n) => (
                  <tr key={n.id} className={sel.has(n.id) ? 'si-seleccionada' : ''}>
                    <td><input type="checkbox" checked={sel.has(n.id)} onChange={() => alternar(n.id)} aria-label={t('Seleccionar {titulo}', {titulo: n.titulo})} /></td>
                    <td><strong>{n.persona.nombre}</strong><br /><small>{n.persona.departamento}</small></td>
                    <td>{n.titulo}<br /><small>GAS-{String(n.id).padStart(5, '0')} · {plural(n.numLineas, 'gasto', 'gastos')}</small></td>
                    <td>{fecha(n.resuelto)}<br /><small>{n.aprobador}</small></td>
                    <td>{n.excedidas > 0 && <Insignia tono="ambar">{t('{n} fuera de política', {n: n.excedidas})}</Insignia>}
                      {n.sinTicket > 0 && <Insignia tono="rojo">{t('{n} sin ticket', {n: n.sinTicket})}</Insignia>}</td>
                    <td className="si-derecha"><strong>{euros(n.total)}</strong></td>
                    <td className="si-derecha"><button type="button" className="si-enlace" onClick={() => setVer(n.id)}>{t('Ver')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      <Tarjeta titulo={t('Exportar a contabilidad')} accion={<SelectorMes anio={anio} mes={mes} onCambiar={(a, m) => { setAnio(a); setMes(m); }} />}>
        <p>{t('Fichero CSV con las líneas de las notas pagadas en el mes: empleado, departamento, categoría, base imponible, IVA y total.')}</p>
        <Boton tipo="primario" icono="⤓" onClick={exportar}>{t('Exportar (CSV)')}</Boton>
      </Tarjeta>
      {d.pagadas.length > 0 && (
        <Tarjeta titulo={t('Pagadas recientemente')}>
          <ul className="si-lista si-historial">
            {d.pagadas.map((n) => (
              <li key={n.id}>
                <span className="si-hist-texto"><strong>{n.persona.nombre}</strong> · {n.titulo}</span>
                <strong>{euros(n.total)}</strong>
                <small className="si-tenue">{fecha(n.pagado)} · {n.pagador}</small>
                <button type="button" className="si-enlace" onClick={() => setVer(n.id)}>{t('Ver')}</button>
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
      <Modal ancho titulo={n ? `${n.titulo} · ${n.persona.nombre}` : t('Nota de gasto')} onCerrar={onCerrar}>
        {error && <Fallo>{error}</Fallo>}
        {!n ? <Cargando /> : <div className="si-detalle-nota">
          <Pasos n={n} />
          <LineasNota n={n} politica={politica} onTicket={setTicket} />
          <div className="si-total"><span>{t('Total')}</span><strong>{euros(n.total)}</strong></div>
        </div>}
      </Modal>
      {ticket && <VerTicket linea={ticket} onCerrar={() => setTicket(null)} />}
    </>
  );
}
