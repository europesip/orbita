// Mis documentos: la documentación de cada empleado. Nóminas (con sus importes y el año de un vistazo), informes de
// cotización, certificados de retenciones, contratos y certificados que publica la empresa, con «recibí» cuando se
// pide; y los documentos que el empleado envía a RRHH. RRHH y Administración publican (de uno en uno o en lote, con
// los importes de las nóminas en un CSV); RRHH revisa lo que envía la plantilla. El responsable no ve nada de su equipo.
import React, {useEffect, useMemo, useState} from 'react';
import {
  Avatar, Boton, Campo, Cargando, Fallo, Insignia, Modal, Pestanas, Tarjeta, Vacio, centimosDe, euros, fecha, nombreMes, plural, useDatos, useSuite,
} from './ui.jsx';
import {Barras} from './graficos.jsx';
import {haceCuanto} from './social.jsx';
import {Icono} from './iconos.jsx';
import {locale, t} from './i18n.js';

/** Categorías: nombre, icono y color. */
export const CATEGORIAS_DOC = {
  NOMINA: {nombre: 'Nómina|documento', plural: 'Nóminas', icono: 'euro', color: '#0550dc'},
  COTIZACION: {nombre: 'Informe de cotización', plural: 'Cotizaciones', icono: 'grafico', color: '#13838f'},
  RETENCIONES: {nombre: 'Certificado de retenciones', plural: 'Retenciones', icono: 'recibo', color: '#6f5bd6'},
  CONTRATO: {nombre: 'Contrato', plural: 'Contratos', icono: 'firmar', color: '#002c56'},
  CERTIFICADO: {nombre: 'Certificado', plural: 'Certificados', icono: 'documento', color: '#b45000'},
  OTRO: {nombre: 'Documento', plural: 'Otros', icono: 'clip', color: '#5c5c5c'},
  JUSTIFICANTE: {nombre: 'Justificante', plural: 'Justificantes', icono: 'salud', color: '#c2307a'},
  TITULACION: {nombre: 'Titulación', plural: 'Titulaciones', icono: 'bombilla', color: '#6f5bd6'},
  BANCARIO: {nombre: 'Datos bancarios', plural: 'Datos bancarios', icono: 'tarjeta', color: '#0550dc'},
  PERSONAL: {nombre: 'Documento personal', plural: 'Personales', icono: 'persona', color: '#13838f'},
};
const ENVIABLES = ['JUSTIFICANTE', 'TITULACION', 'BANCARIO', 'PERSONAL', 'OTRO'];
const PUBLICABLES = ['NOMINA', 'COTIZACION', 'RETENCIONES', 'CONTRATO', 'CERTIFICADO', 'OTRO'];
const ESTADO_ENVIO = {PENDIENTE: {nombre: 'Pendiente de revisar', tono: 'ambar'}, REVISADO: {nombre: 'Revisado', tono: 'verde'},
  RECHAZADO: {nombre: 'Devuelto', tono: 'rojo'}};
const PESTANAS = ['mios', 'enviar', 'gestion', 'bandeja'];
const MAX = 6 * 1024 * 1024;
const cat = (c) => CATEGORIAS_DOC[c] || CATEGORIAS_DOC.OTRO;

/** «octubre de 2026», «2025». */
export function textoPeriodo(p) {
  if (!p) return '';
  if (p.length === 4) return p;
  return nombreMes(Number(p.slice(0, 4)), Number(p.slice(5, 7)));
}
/** Título del documento: el que puso ÓRBITA se compone en el idioma de la interfaz; el que escribió una persona, tal cual. */
export function tituloDoc(x) {
  if (!x.tituloAuto) return x.titulo;
  const tipo = x.nomina && x.nomina.extra ? t('Paga extra') : t(cat(x.categoria).nombre);
  return x.periodo ? t('{tipo} de {periodo}', {tipo, periodo: textoPeriodo(x.periodo)}) : tipo;
}
const mesCorto = (p) => new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1, 1).toLocaleDateString(locale(), {month: 'short'}).replace('.', '');
const dia = (iso) => (iso ? fecha(iso.slice(0, 10), {day: 'numeric', month: 'short', year: 'numeric'}) : '');
const kb = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Lee un fichero como data URL (base64) para enviarlo a la API. */
function leerFichero(f) {
  return new Promise((ok, mal) => {
    if (f.size > MAX) { mal(new Error(t('«{nombre}» ocupa más de 6 MB.', {nombre: f.name}))); return; }
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => mal(new Error(t('No se ha podido leer «{nombre}».', {nombre: f.name})));
    r.readAsDataURL(f);
  });
}

const pestanaDelEnlace = () => {
  const h = (typeof window !== 'undefined' && window.location.hash || '').replace('#', '');
  return PESTANAS.includes(h) ? h : 'mios';
};

// =========================================================================================== Aplicación

export function Documentos() {
  const [pest, setPest] = useState(pestanaDelEnlace);
  const [res, error, recargar] = useDatos('docs.resumen', {}, []);
  useEffect(() => {
    const cambio = () => setPest(pestanaDelEnlace());
    window.addEventListener('hashchange', cambio);
    return () => window.removeEventListener('hashchange', cambio);
  }, []);
  const cambiar = (p) => { setPest(p); if (window.history.replaceState) window.history.replaceState(null, '', `#${p}`); };
  if (error) return <Fallo>{error}</Fallo>;
  if (!res) return <Cargando />;
  return (
    <>
      <Pestanas activa={pest} onCambiar={cambiar} pestanas={[
        {id: 'mios', nombre: t('Mis documentos'), cuenta: res.nuevos + res.porAcusar},
        {id: 'enviar', nombre: t('Enviar a RRHH'), cuenta: res.enviadosPendientes},
        res.gestor && {id: 'gestion', nombre: t('Publicar')},
        res.rrhh && {id: 'bandeja', nombre: t('Recibidos de la plantilla'), cuenta: res.bandeja},
      ]} />
      {pest === 'mios' && <MisDocumentos res={res} onCambio={recargar} />}
      {pest === 'enviar' && <EnviarRrhh onCambio={recargar} />}
      {pest === 'gestion' && res.gestor && <Gestion onCambio={recargar} />}
      {pest === 'bandeja' && res.rrhh && <Bandeja onCambio={recargar} />}
    </>
  );
}

// =========================================================================================== Mis documentos

function MisDocumentos({res, onCambio}) {
  const [filtro, setFiltro] = useState('');
  const [anio, setAnio] = useState('');
  const [d, error, recargar] = useDatos('docs.lista', {}, []);
  const [ver, setVer] = useState(null);
  const cambio = () => { recargar(); onCambio(); };
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const empresa = d.documentos.filter((x) => x.origen === 'EMPRESA');
  const porFirmar = empresa.filter((x) => x.pideAcuse && !x.acuse);
  const anios = [...new Set(empresa.map((x) => (x.periodo || x.creado).slice(0, 4)))].sort().reverse();
  const cuenta = (c) => empresa.filter((x) => x.categoria === c).length;
  const lista = empresa.filter((x) => (!filtro || x.categoria === filtro) && (!anio || (x.periodo || x.creado).startsWith(anio)));
  return (
    <>
      {porFirmar.length > 0 && (
        <section className="si-tareas" aria-label={t('Pendiente de firmar')}>
          <header><Icono n="firmar" /><strong>{plural(porFirmar.length, 'documento espera tu recibí', 'documentos esperan tu recibí')}</strong></header>
          <ul>
            {porFirmar.map((x) => (
              <li key={x.id}>
                <span className="si-crece"><strong>{tituloDoc(x)}</strong><small>{t('Publicado el {fecha} por {quien}', {fecha: dia(x.creado), quien: x.subidoPor})}</small></span>
                <Boton onClick={() => setVer(x)}>{t('Ver y firmar')}</Boton>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="si-do-cabecera">
        <UltimaNomina u={res.ultima} onVer={setVer} />
        <AnioNominas a={res.anio} />
      </div>
      <div className="si-seccion-cab">
        <h3>{t('Documentos de la empresa')}</h3>
        <select className="si-select" value={anio} onChange={(e) => setAnio(e.target.value)} aria-label={t('Año')}>
          <option value="">{t('Todos los años')}</option>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="si-pe-filtros" role="group" aria-label={t('Tipo de documento')}>
        <button type="button" className={`si-pe-chip${!filtro ? ' activa' : ''}`} aria-pressed={!filtro} onClick={() => setFiltro('')}>{t('Todos')} <strong>{empresa.length}</strong></button>
        {PUBLICABLES.filter((c) => cuenta(c)).map((c) => (
          <button key={c} type="button" className={`si-pe-chip${filtro === c ? ' activa' : ''}`} aria-pressed={filtro === c} onClick={() => setFiltro(filtro === c ? '' : c)}>
            <span style={{color: cat(c).color}}><Icono n={cat(c).icono} /></span>{t(cat(c).plural)} <strong>{cuenta(c)}</strong>
          </button>
        ))}
      </div>
      <ListaDocumentos docs={lista} onVer={setVer} vacio={t('No hay documentos con ese filtro.')} />
      {ver && <Visor doc={ver} onCerrar={() => setVer(null)} onCambio={cambio} />}
    </>
  );
}

function UltimaNomina({u, onVer}) {
  if (!u) return <Tarjeta titulo={t('Tu última nómina')}><Vacio icono="euro">{t('Todavía no tienes nóminas.')}</Vacio></Tarjeta>;
  const n = u.nomina, ant = u.anterior;
  const dif = ant ? n.neto - ant.neto : null;
  const partes = [{v: n.neto, c: 'var(--si-acento)', e: t('Neto')}, {v: n.irpf, c: '#6f5bd6', e: t('IRPF')}, {v: n.ss, c: '#13838f', e: t('Seguridad Social')},
    {v: n.otras, c: '#8d8d8d', e: t('Otras deducciones')}].filter((x) => x.v > 0);
  return (
    <Tarjeta titulo={t('Tu última nómina')} className="si-do-ultima"
      accion={<Boton icono="ojo" onClick={() => onVer(u)}>{t('Ver nómina')}</Boton>}>
      <p className="si-do-mes">{textoPeriodo(u.periodo)}{!u.leido && <Insignia tono="azul">{t('Nueva')}</Insignia>}</p>
      <p className="si-do-neto">{euros(n.neto)}<small>{t('netos')}</small></p>
      {dif !== null && dif !== 0 && (
        <p className={`si-do-dif ${dif > 0 ? 'si-positivo' : 'si-negativo'}`}>
          {dif > 0 ? '▲' : '▼'} {t('{importe} que el mes anterior', {importe: `${dif > 0 ? '+' : '−'}${euros(Math.abs(dif))}`})}
        </p>
      )}
      <div className="si-do-reparto" role="img" aria-label={t('Reparto del bruto')}>
        {partes.map((x) => <i key={x.e} style={{flex: x.v, background: x.c}} title={`${x.e}: ${euros(x.v)}`} />)}
      </div>
      <dl className="si-do-cifras">
        <div><dt>{t('Bruto')}</dt><dd>{euros(n.bruto)}</dd></div>
        <div><dt><i style={{background: '#6f5bd6'}} />{t('IRPF')}</dt><dd>−{euros(n.irpf)}</dd></div>
        <div><dt><i style={{background: '#13838f'}} />{t('Seguridad Social')}</dt><dd>−{euros(n.ss)}</dd></div>
        {n.otras > 0 && <div><dt><i style={{background: '#8d8d8d'}} />{t('Otras deducciones')}</dt><dd>−{euros(n.otras)}</dd></div>}
      </dl>
    </Tarjeta>
  );
}

function AnioNominas({a}) {
  if (!a || !a.nominas.length) return <Tarjeta titulo={t('Tu año')}><Vacio icono="grafico">{t('Sin nóminas este año.')}</Vacio></Tarjeta>;
  // Una barra por mes; la paga extra se suma a su mes y se marca
  const meses = [];
  for (const m of a.nominas) {
    const prev = meses.find((x) => x.periodo === m.periodo);
    if (prev) { prev.neto += m.neto; prev.extra = prev.extra || m.extra; } else meses.push({...m});
  }
  return (
    <Tarjeta titulo={t('Tu año {anio}', {anio: a.anio})} className="si-do-anio">
      <Barras alto={130} formato={(v) => euros(v)} datos={meses.map((m) => ({
        etiqueta: `${mesCorto(m.periodo)}${m.extra ? '+' : ''}`, valor: m.neto,
        titulo: `${textoPeriodo(m.periodo)}: ${euros(m.neto)}${m.extra ? ` (${t('con paga extra')})` : ''}`,
      }))} />
      <dl className="si-do-totales">
        <div><dt>{t('Bruto')}</dt><dd>{euros(a.total.bruto)}</dd></div>
        <div><dt>{t('IRPF')}</dt><dd>{euros(a.total.irpf)}<small>{t('{n} % de media', {n: String(a.total.irpfMedio).replace('.', locale() === 'es-ES' ? ',' : '.')})}</small></dd></div>
        <div><dt>{t('Seguridad Social')}</dt><dd>{euros(a.total.ss)}</dd></div>
        <div><dt>{t('Neto')}</dt><dd><strong>{euros(a.total.neto)}</strong></dd></div>
      </dl>
    </Tarjeta>
  );
}

/** Lista de documentos agrupada por año. */
function ListaDocumentos({docs, onVer, vacio, conPersona, onRetirar}) {
  if (!docs.length) return <Vacio icono="documento">{vacio}</Vacio>;
  const grupos = [];
  for (const x of docs) {
    const a = (x.periodo || x.creado).slice(0, 4);
    const g = grupos.find((y) => y.anio === a);
    if (g) g.docs.push(x); else grupos.push({anio: a, docs: [x]});
  }
  return grupos.map((g) => (
    <section key={g.anio} className="si-do-grupo">
      <h4>{g.anio}</h4>
      <ul className="si-do-lista">
        {g.docs.map((x) => (
          <li key={x.id} className={!x.leido && x.origen === 'EMPRESA' && !conPersona ? 'si-do-nuevo' : ''}>
            <span className="si-do-icono" style={{color: cat(x.categoria).color, background: `color-mix(in srgb, ${cat(x.categoria).color} 10%, #fff)`}}>
              <Icono n={cat(x.categoria).icono} />
            </span>
            <button type="button" className="si-do-titulo" onClick={() => onVer(x)}>
              <strong>{tituloDoc(x)}</strong>
              <small>{[conPersona && x.persona, t(cat(x.categoria).nombre), t('publicado el {fecha}', {fecha: dia(x.creado)}), kb(x.tamano)].filter(Boolean).join(' · ')}</small>
            </button>
            {x.nomina && <span className="si-do-importe">{euros(x.nomina.neto)}<small>{t('neto')}</small></span>}
            <span className="si-do-marcas">
              {!x.leido && x.origen === 'EMPRESA' && <Insignia tono="azul">{conPersona ? t('Sin abrir') : t('Nuevo')}</Insignia>}
              {x.pideAcuse && (x.acuse ? <Insignia tono="verde"><Icono n="check" /> {t('Recibí {fecha}', {fecha: dia(x.acuse)})}</Insignia>
                : <Insignia tono="ambar"><Icono n="firmar" /> {t('Falta el recibí')}</Insignia>)}
            </span>
            <span className="si-do-acciones">
              <button type="button" className="si-icono-boton" onClick={() => onVer(x)} aria-label={t('Ver')} title={t('Ver')}><Icono n="ojo" /></button>
              {onRetirar && !x.acuse && <button type="button" className="si-icono-boton" onClick={() => onRetirar(x)} aria-label={t('Retirar')} title={t('Retirar')}><Icono n="papelera" /></button>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  ));
}

/** Visor del documento (PDF o imagen), con descarga y, si se pide, el recibí. */
function Visor({doc, onCerrar, onCambio}) {
  const {api, avisar} = useSuite();
  const [f, error] = useDatos('docs.fichero', {id: doc.id}, [doc.id]);
  const [firmado, setFirmado] = useState(!!doc.acuse);
  const [firmando, setFirmando] = useState(false);
  const url = useMemo(() => {
    if (!f) return null;
    const bin = atob(f.datos);
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([b], {type: f.tipo}));
  }, [f]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  // Abrirlo lo marca como leído en el servidor: la lista se actualiza al cerrar
  const cerrar = () => { onCambio && onCambio(); onCerrar(); };
  const firmar = async () => {
    setFirmando(true);
    try { const r = await api('docs.acuse', {id: doc.id}); avisar(r.mensaje); setFirmado(true); } catch (e) { avisar(e.message, 'rojo'); }
    setFirmando(false);
  };
  const pideFirma = doc.pideAcuse && !firmado && doc.mio !== false;
  return (
    <Modal titulo={tituloDoc(doc)} onCerrar={cerrar} ancho
      pie={<>
        {url && <a className="si-boton si-boton-secundario" href={url} download={f.nombre}><span className="si-icono"><Icono n="descargar" /></span>{t('Descargar')}</a>}
        {url && <a className="si-boton si-boton-secundario" href={url} target="_blank" rel="noopener noreferrer"><span className="si-icono"><Icono n="externo" /></span>{t('Abrir en otra pestaña')}</a>}
        {pideFirma && <Boton tipo="primario" icono="firmar" disabled={firmando || !f} onClick={firmar}>{t('Firmar el recibí')}</Boton>}
        <Boton onClick={cerrar}>{t('Cerrar')}</Boton>
      </>}>
      {doc.nomina && (
        <div className="si-do-visor-cifras">
          <span>{t('Bruto')} <strong>{euros(doc.nomina.bruto)}</strong></span>
          <span>{t('IRPF')} <strong>−{euros(doc.nomina.irpf)}</strong></span>
          <span>{t('Seguridad Social')} <strong>−{euros(doc.nomina.ss)}</strong></span>
          {doc.nomina.otras > 0 && <span>{t('Otras')} <strong>−{euros(doc.nomina.otras)}</strong></span>}
          <span className="si-do-visor-neto">{t('Neto')} <strong>{euros(doc.nomina.neto)}</strong></span>
        </div>
      )}
      {doc.comentario && <p className="si-do-nota"><Icono n="chat" /> {doc.comentario}</p>}
      {pideFirma && <p className="si-mensaje-barra si-mb-aviso"><Icono n="firmar" /><span>{t('Con el recibí confirmas que has recibido este documento, no que estés de acuerdo con su contenido.')}</span></p>}
      {firmado && doc.pideAcuse && <p className="si-mensaje-barra si-mb-ok"><Icono n="checkCirculo" /><span>{t('Recibí firmado.')}</span></p>}
      {error ? <Fallo>{error}</Fallo> : !url ? <Cargando /> : f.tipo === 'application/pdf'
        ? <object className="si-do-pdf" data={url} type="application/pdf"><p>{t('Tu navegador no muestra el PDF aquí: descárgalo.')}</p></object>
        : <img className="si-ticket-img" src={url} alt={tituloDoc(doc)} />}
    </Modal>
  );
}

// =========================================================================================== Enviar a RRHH

function SelectorFichero({fichero, onElegir, multiple, aceptar = 'application/pdf,image/jpeg,image/png'}) {
  const [encima, setEncima] = useState(false);
  const elegir = (lista) => { const fs = [...lista]; if (fs.length) onElegir(multiple ? fs : fs[0]); };
  const texto = multiple ? (fichero && fichero.length ? plural(fichero.length, 'fichero elegido', 'ficheros elegidos') : null) : fichero && fichero.name;
  return (
    <label className={`si-do-soltar${encima ? ' encima' : ''}${texto ? ' elegido' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)}
      onDrop={(e) => { e.preventDefault(); setEncima(false); elegir(e.dataTransfer.files); }}>
      <Icono n="subir" />
      <span>{texto || (multiple ? t('Arrastra aquí los PDF o pulsa para elegirlos') : t('Arrastra aquí el fichero o pulsa para elegirlo'))}</span>
      <small>{t('PDF, JPG o PNG · máximo 6 MB por fichero')}</small>
      <input type="file" accept={aceptar} multiple={multiple} onChange={(e) => elegir(e.target.files)} />
    </label>
  );
}

function EnviarRrhh({onCambio}) {
  const {api, avisar} = useSuite();
  const [d, error, recargar] = useDatos('docs.lista', {}, []);
  const [f, setF] = useState({categoria: 'JUSTIFICANTE', titulo: '', comentario: ''});
  const [fichero, setFichero] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [ver, setVer] = useState(null);
  const enviar = async () => {
    setEnviando(true);
    try {
      const datos = await leerFichero(fichero);
      const r = await api('docs.enviar', {...f, nombre: fichero.name, datos});
      avisar(r.mensaje);
      setF({categoria: f.categoria, titulo: '', comentario: ''});
      setFichero(null);
      recargar();
      onCambio();
    } catch (e) { avisar(e.message, 'rojo'); }
    setEnviando(false);
  };
  const retirar = async (x) => {
    if (!window.confirm(t('¿Retirar «{titulo}»?', {titulo: x.titulo}))) return;
    try { const r = await api('docs.borrar', {id: x.id}); avisar(r.mensaje); recargar(); onCambio(); } catch (e) { avisar(e.message, 'rojo'); }
  };
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const mios = d.documentos.filter((x) => x.origen === 'EMPLEADO');
  return (
    <div className="si-do-enviar">
      <Tarjeta titulo={t('Enviar un documento a RRHH')}>
        <p className="si-tenue">{t('Justificantes, titulaciones, el certificado de tu cuenta bancaria… Solo lo ve RRHH, no tu responsable.')}</p>
        <Campo etiqueta={t('¿Qué envías?')}>
          <div className="si-do-tipos" role="radiogroup">
            {ENVIABLES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={f.categoria === c} className={f.categoria === c ? 'activa' : ''}
                style={{'--valor': cat(c).color}} onClick={() => setF({...f, categoria: c})}>
                <Icono n={cat(c).icono} /><span>{t(cat(c).nombre)}</span>
              </button>
            ))}
          </div>
        </Campo>
        <Campo etiqueta={t('Título')}><input className="si-input" value={f.titulo} maxLength={160} onChange={(e) => setF({...f, titulo: e.target.value})}
          placeholder={t('Por ejemplo, «Justificante médico del 3 de noviembre»')} /></Campo>
        <SelectorFichero fichero={fichero} onElegir={setFichero} />
        <Campo etiqueta={t('Comentario para RRHH (opcional)')}><textarea className="si-input" rows={2} maxLength={500} value={f.comentario}
          onChange={(e) => setF({...f, comentario: e.target.value})} /></Campo>
        <div className="si-fila si-al-final">
          <Boton tipo="primario" icono="enviar" disabled={enviando || !fichero || !f.titulo.trim()} onClick={enviar}>{t('Enviar a RRHH')}</Boton>
        </div>
      </Tarjeta>
      <Tarjeta titulo={t('Lo que has enviado')}>
        {!mios.length ? <Vacio icono="bandeja">{t('Aún no has enviado nada a RRHH.')}</Vacio> : (
          <ul className="si-do-lista si-do-enviados">
            {mios.map((x) => (
              <li key={x.id}>
                <span className="si-do-icono" style={{color: cat(x.categoria).color, background: `color-mix(in srgb, ${cat(x.categoria).color} 10%, #fff)`}}><Icono n={cat(x.categoria).icono} /></span>
                <button type="button" className="si-do-titulo" onClick={() => setVer(x)}>
                  <strong>{tituloDoc(x)}</strong>
                  <small>{t(cat(x.categoria).nombre)} · {t('enviado {cuando}', {cuando: haceCuanto(x.creado)})}</small>
                  {x.comentarioRrhh && <span className={`si-do-respuesta si-do-${x.estado.toLowerCase()}`}><Icono n="chat" /> {x.revisadoPor}: {x.comentarioRrhh}</span>}
                </button>
                <Insignia tono={ESTADO_ENVIO[x.estado].tono}>{t(ESTADO_ENVIO[x.estado].nombre)}</Insignia>
                {x.estado === 'PENDIENTE' && <button type="button" className="si-icono-boton" onClick={() => retirar(x)} aria-label={t('Retirar')} title={t('Retirar')}><Icono n="papelera" /></button>}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      {ver && <Visor doc={ver} onCerrar={() => setVer(null)} />}
    </div>
  );
}

// =========================================================================================== Publicar (RRHH y Administración)

function Gestion({onCambio}) {
  const {api, avisar} = useSuite();
  const [d, error, recargar] = useDatos('docs.gestion', {}, []);
  const [uno, setUno] = useState(null);
  const [lote, setLote] = useState(false);
  const [persona, setPersona] = useState(null);
  const [ver, setVer] = useState(null);
  const [q, setQ] = useState('');
  const cambio = () => { recargar(); onCambio(); };
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  const retirar = async (x) => {
    if (!window.confirm(t('¿Retirar «{titulo}» de {persona}?', {titulo: tituloDoc(x), persona: x.persona}))) return;
    try { const r = await api('docs.borrar', {id: x.id}); avisar(r.mensaje); cambio(); } catch (e) { avisar(e.message, 'rojo'); }
  };
  const filtradas = d.plantilla.filter((p) => !q || `${p.nombre} ${p.departamento} ${p.usuario}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <section className="si-do-publicar">
        <div>
          <h3>{t('Publicar documentos a la plantilla')}</h3>
          <p className="si-tenue">{t('Cada persona ve solo los suyos y recibe un aviso. Las nóminas guardan también sus importes.')}</p>
        </div>
        <div className="si-fila">
          <Boton icono="subir" onClick={() => setUno({})}>{t('Publicar un documento')}</Boton>
          <Boton tipo="primario" icono="lista" onClick={() => setLote(true)}>{t('Publicar en lote')}</Boton>
        </div>
      </section>
      <div className="si-do-gestion">
        <Tarjeta titulo={t('Plantilla')} accion={<label className="si-buscador"><Icono n="buscar" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t('Buscar persona')} aria-label={t('Buscar persona')} /></label>}>
          <div className="si-tabla-envoltura">
            <table className="si-tabla">
              <thead><tr><th>{t('Persona')}</th><th>{t('Última nómina')}</th><th>{t('Sin abrir')}</th><th>{t('Sin recibí')}</th><th /></tr></thead>
              <tbody>
                {filtradas.map((p) => (
                  <tr key={p.usuario}>
                    <td><span className="si-fila"><Avatar nombre={p.nombre} tam={28} /><span><strong>{p.nombre}</strong><br /><small>{p.departamento}</small></span></span></td>
                    <td>{p.ultimaNomina ? textoPeriodo(p.ultimaNomina) : <span className="si-tenue">—</span>}
                      {p.ultimaNomina && p.ultimaNomina < d.mesAnterior && <> <Insignia tono="ambar">{t('Atrasada')}</Insignia></>}</td>
                    <td>{p.sinLeer || ''}</td>
                    <td>{p.sinRecibi ? <Insignia tono="ambar">{p.sinRecibi}</Insignia> : ''}</td>
                    <td className="si-derecha">
                      <Boton onClick={() => setPersona(p)}>{t('Documentos')}</Boton>{' '}
                      <Boton icono="mas" onClick={() => setUno({usuario: p.usuario})} aria-label={t('Publicar a {nombre}', {nombre: p.nombre})} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
        <Tarjeta titulo={t('Publicado últimamente')}>
          <ListaDocumentos docs={d.recientes.slice(0, 15)} onVer={setVer} conPersona onRetirar={retirar} vacio={t('Aún no has publicado nada.')} />
        </Tarjeta>
      </div>
      {uno && <PublicarUno d={d} inicial={uno} onCerrar={() => setUno(null)} onHecho={cambio} />}
      {lote && <PublicarLote d={d} onCerrar={() => setLote(false)} onHecho={cambio} />}
      {persona && <DocumentosDe p={persona} onCerrar={() => setPersona(null)} onRetirar={retirar} />}
      {ver && <Visor doc={{...ver, mio: false}} onCerrar={() => setVer(null)} />}
    </>
  );
}

function DocumentosDe({p, onCerrar, onRetirar}) {
  const [d, error, recargar] = useDatos('docs.lista', {usuario: p.usuario}, [p.usuario]);
  const [ver, setVer] = useState(null);
  return (
    <Modal titulo={t('Documentos de {nombre}', {nombre: p.nombre})} onCerrar={onCerrar} ancho>
      {error ? <Fallo>{error}</Fallo> : !d ? <Cargando /> : (
        <ListaDocumentos docs={d.documentos} onVer={setVer} conPersona onRetirar={async (x) => { await onRetirar(x); recargar(); }}
          vacio={t('{nombre} no tiene documentos.', {nombre: p.nombre})} />
      )}
      {ver && <Visor doc={{...ver, mio: false}} onCerrar={() => setVer(null)} />}
    </Modal>
  );
}

/** Campos de importes de una nómina, con el neto calculado. */
function Importes({v, onCambiar}) {
  const n = ['bruto', 'irpf', 'ss', 'otras'].map((k) => centimosDe(v[k] || '') || 0);
  const neto = n[0] - n[1] - n[2] - n[3];
  const campo = (k, e) => <Campo etiqueta={e}><input className="si-input" inputMode="decimal" value={v[k] || ''} onChange={(x) => onCambiar({...v, [k]: x.target.value})} placeholder="0,00" /></Campo>;
  return (
    <div className="si-do-importes">
      {campo('bruto', t('Bruto'))}{campo('irpf', t('IRPF'))}{campo('ss', t('Seguridad Social'))}{campo('otras', t('Otras deducciones'))}
      <div className="si-do-neto-calc"><span>{t('Neto')}</span><strong className={neto < 0 ? 'si-negativo' : ''}>{n[0] ? euros(neto) : '—'}</strong></div>
    </div>
  );
}

const mesPorDefecto = (d) => d.mesAnterior;

function PublicarUno({d, inicial, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const [f, setF] = useState({usuario: inicial.usuario || '', categoria: 'NOMINA', periodo: mesPorDefecto(d), titulo: '', comentario: '', extra: false, pideAcuse: null});
  const [imp, setImp] = useState({});
  const [fichero, setFichero] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const mensual = f.categoria === 'NOMINA' || f.categoria === 'COTIZACION';
  const acuse = f.pideAcuse === null ? f.categoria === 'CONTRATO' : f.pideAcuse;
  const publicar = async () => {
    setGuardando(true);
    try {
      const datos = await leerFichero(fichero);
      const c = (k) => (imp[k] ? (centimosDe(imp[k]) / 100).toFixed(2) : undefined);
      const r = await api('docs.publicar', {...f, pideAcuse: acuse, nombre: fichero.name, datos,
        ...(f.categoria === 'NOMINA' && imp.bruto ? {bruto: c('bruto'), irpf: c('irpf') || '0', ss: c('ss') || '0', otras: c('otras') || '0'} : {})});
      avisar(r.mensaje);
      onHecho();
      onCerrar();
    } catch (e) { avisar(e.message, 'rojo'); setGuardando(false); }
  };
  return (
    <Modal titulo={t('Publicar un documento')} onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>{t('Cancelar')}</Boton><Boton tipo="primario" icono="enviar" disabled={guardando || !fichero || !f.usuario} onClick={publicar}>{t('Publicar')}</Boton></>}>
      <div className="si-rejilla-2">
        <Campo etiqueta={t('Para')}>
          <select className="si-select" value={f.usuario} onChange={(e) => setF({...f, usuario: e.target.value})}>
            <option value="">{t('Elige a la persona')}</option>
            {d.plantilla.map((p) => <option key={p.usuario} value={p.usuario}>{p.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={t('Tipo')}>
          <select className="si-select" value={f.categoria} onChange={(e) => setF({...f, categoria: e.target.value,
            periodo: e.target.value === 'RETENCIONES' ? String(new Date().getFullYear() - 1) : ['NOMINA', 'COTIZACION'].includes(e.target.value) ? mesPorDefecto(d) : ''})}>
            {d.categorias.map((c) => <option key={c} value={c}>{t(cat(c).nombre)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={mensual ? t('Mes') : f.categoria === 'RETENCIONES' ? t('Año') : t('Periodo (opcional)')}>
          {mensual ? <input className="si-input" type="month" value={f.periodo} onChange={(e) => setF({...f, periodo: e.target.value})} />
            : <input className="si-input" value={f.periodo} onChange={(e) => setF({...f, periodo: e.target.value})} placeholder={f.categoria === 'RETENCIONES' ? 'AAAA' : 'AAAA o AAAA-MM'} />}
        </Campo>
        <Campo etiqueta={t('Título (opcional)')}><input className="si-input" value={f.titulo} maxLength={160} onChange={(e) => setF({...f, titulo: e.target.value})}
          placeholder={f.categoria === 'NOMINA' ? t('Nómina de {mes}', {mes: textoPeriodo(f.periodo)}) : t(cat(f.categoria).nombre)} /></Campo>
      </div>
      <SelectorFichero fichero={fichero} onElegir={setFichero} />
      {f.categoria === 'NOMINA' && (
        <>
          <p className="si-do-ayuda">{t('Importes de la nómina (opcional, recomendado): con ellos la persona ve su año de un vistazo y el asistente puede responder sobre sus nóminas.')}</p>
          <Importes v={imp} onCambiar={setImp} />
          <label className="si-casilla"><input type="checkbox" checked={f.extra} onChange={(e) => setF({...f, extra: e.target.checked})} /> {t('Es una paga extra')}</label>
        </>
      )}
      <label className="si-casilla"><input type="checkbox" checked={acuse} onChange={(e) => setF({...f, pideAcuse: e.target.checked})} /> {t('Pedir el recibí a la persona')}</label>
      <Campo etiqueta={t('Nota para la persona (opcional)')}><textarea className="si-input" rows={2} maxLength={500} value={f.comentario} onChange={(e) => setF({...f, comentario: e.target.value})} /></Campo>
    </Modal>
  );
}

function PublicarLote({d, onCerrar, onHecho}) {
  const {api, avisar} = useSuite();
  const [f, setF] = useState({categoria: 'NOMINA', periodo: mesPorDefecto(d), extra: false, pideAcuse: false});
  const [ficheros, setFicheros] = useState([]);
  const [csv, setCsv] = useState('');
  const [plan, setPlan] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const mensual = f.categoria === 'NOMINA' || f.categoria === 'COTIZACION';
  const asignar = async () => {
    try {
      const r = await api('docs.asignar', {nombres: JSON.stringify(ficheros.map((x) => x.name)), csv: f.categoria === 'NOMINA' ? csv : ''});
      setPlan(r.ficheros.map((x, i) => ({...x, fichero: ficheros[i]})));
    } catch (e) { avisar(e.message, 'rojo'); }
  };
  const publicar = async () => {
    const filas = plan.filter((x) => x.usuario);
    const hechos = [], fallos = [];
    for (let i = 0; i < filas.length; i++) {
      const x = filas[i];
      setProgreso({hecho: i, total: filas.length, nombre: x.fichero.name});
      try {
        const datos = await leerFichero(x.fichero);
        const im = x.importes;
        await api('docs.publicar', {usuario: x.usuario, categoria: f.categoria, periodo: f.periodo, extra: f.extra, pideAcuse: f.pideAcuse,
          nombre: x.fichero.name, datos, ...(f.categoria === 'NOMINA' && im ? {bruto: (im.bruto / 100).toFixed(2), irpf: (im.irpf / 100).toFixed(2),
            ss: (im.ss / 100).toFixed(2), otras: (im.otras / 100).toFixed(2)} : {})});
        hechos.push(x);
      } catch (e) { fallos.push(`${x.fichero.name}: ${e.message}`); }
    }
    setProgreso({hecho: filas.length, total: filas.length, fin: true, fallos, hechos: hechos.length});
    if (hechos.length) { avisar(t('{n} publicados.', {n: plural(hechos.length, 'documento', 'documentos')})); onHecho(); }
  };
  const leerCsv = async (file) => setCsv(await file.text());
  const fijar = (i, usuario) => setPlan(plan.map((x, j) => (j === i ? {...x, usuario, persona: (d.plantilla.find((p) => p.usuario === usuario) || {}).nombre, importes: null} : x)));
  return (
    <Modal titulo={t('Publicar en lote')} onCerrar={onCerrar} ancho
      pie={progreso && progreso.fin ? <Boton tipo="primario" onClick={onCerrar}>{t('Cerrar')}</Boton> : !plan
        ? <><Boton onClick={onCerrar}>{t('Cancelar')}</Boton><Boton tipo="primario" icono="derecha" disabled={!ficheros.length} onClick={asignar}>{t('Asignar ficheros')}</Boton></>
        : <><Boton onClick={() => setPlan(null)} disabled={!!progreso}>{t('Atrás')}</Boton>
          <Boton tipo="primario" icono="enviar" disabled={!!progreso || !plan.some((x) => x.usuario)} onClick={publicar}>
            {t('Publicar {n}', {n: plural(plan.filter((x) => x.usuario).length, 'documento', 'documentos')})}</Boton></>}>
      {progreso ? (
        <div className="si-do-progreso">
          <div className="si-barra"><div style={{width: `${(progreso.hecho / Math.max(1, progreso.total)) * 100}%`}} /></div>
          {progreso.fin ? (
            <>
              <p><strong>{t('{n} publicados.', {n: plural(progreso.hechos, 'documento', 'documentos')})}</strong> {t('Cada persona ha recibido un aviso.')}</p>
              {progreso.fallos.length > 0 && <ul className="si-error">{progreso.fallos.map((x) => <li key={x}>{x}</li>)}</ul>}
            </>
          ) : <p className="si-tenue">{t('Publicando {n} de {total}: {nombre}', {n: progreso.hecho + 1, total: progreso.total, nombre: progreso.nombre})}</p>}
        </div>
      ) : !plan ? (
        <>
          <p className="si-tenue">{t('Un fichero por persona. ÓRBITA reconoce a quién va cada uno por su nombre: tiene que contener el usuario de DX o el nombre y apellidos (por ejemplo, «nomina-2026-10-lucia.martin.pdf» o «Lucia_Martin.pdf»).')}</p>
          <div className="si-rejilla-2">
            <Campo etiqueta={t('Tipo')}>
              <select className="si-select" value={f.categoria} onChange={(e) => setF({...f, categoria: e.target.value,
                periodo: e.target.value === 'RETENCIONES' ? String(new Date().getFullYear() - 1) : mesPorDefecto(d)})}>
                {d.categorias.map((c) => <option key={c} value={c}>{t(cat(c).nombre)}</option>)}
              </select>
            </Campo>
            <Campo etiqueta={mensual ? t('Mes') : t('Periodo')}>
              {mensual ? <input className="si-input" type="month" value={f.periodo} onChange={(e) => setF({...f, periodo: e.target.value})} />
                : <input className="si-input" value={f.periodo} onChange={(e) => setF({...f, periodo: e.target.value})} placeholder="AAAA" />}
            </Campo>
          </div>
          <SelectorFichero fichero={ficheros} onElegir={setFicheros} multiple aceptar="application/pdf" />
          {f.categoria === 'NOMINA' && (
            <>
              <Campo etiqueta={t('Importes de las nóminas (CSV, opcional)')}
                ayuda={t('Una línea por persona: usuario;bruto;irpf;ss;otras (otras es opcional). Puedes pegarlo o elegir el fichero.')}>
                <textarea className="si-input si-do-csv" rows={4} value={csv} onChange={(e) => setCsv(e.target.value)}
                  placeholder={'usuario;bruto;irpf;ss;otras\nlucia.martin;2428,57;340,00;157,86;0'} />
              </Campo>
              <label className="si-enlace si-do-csv-fichero"><Icono n="subir" /> {t('Elegir fichero CSV')}
                <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => e.target.files[0] && leerCsv(e.target.files[0])} /></label>
              <label className="si-casilla"><input type="checkbox" checked={f.extra} onChange={(e) => setF({...f, extra: e.target.checked})} /> {t('Son pagas extra')}</label>
            </>
          )}
          <label className="si-casilla"><input type="checkbox" checked={f.pideAcuse} onChange={(e) => setF({...f, pideAcuse: e.target.checked})} /> {t('Pedir el recibí a cada persona')}</label>
        </>
      ) : (
        <>
          <p>{t('{a} de {n} ficheros asignados. Revisa a quién va cada uno; los que no tienen persona no se publican.', {a: plan.filter((x) => x.usuario).length, n: plan.length})}</p>
          <div className="si-tabla-envoltura">
            <table className="si-tabla">
              <thead><tr><th>{t('Fichero')}</th><th>{t('Para')}</th>{f.categoria === 'NOMINA' && <th className="si-derecha">{t('Neto')}</th>}</tr></thead>
              <tbody>
                {plan.map((x, i) => (
                  <tr key={x.nombre + i} className={x.usuario ? '' : 'si-do-sin'}>
                    <td><Icono n="documento" /> {x.nombre}</td>
                    <td>
                      <select className="si-select" value={x.usuario || ''} onChange={(e) => fijar(i, e.target.value)}>
                        <option value="">{t('Sin asignar: no se publica')}</option>
                        {d.plantilla.map((p) => <option key={p.usuario} value={p.usuario}>{p.nombre}</option>)}
                      </select>
                    </td>
                    {f.categoria === 'NOMINA' && <td className="si-derecha">{x.importes ? euros(x.importes.neto) : <span className="si-tenue">{t('sin importes')}</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// =========================================================================================== Bandeja de RRHH

function Bandeja({onCambio}) {
  const {api, avisar} = useSuite();
  const [d, error, recargar] = useDatos('docs.bandeja', {}, []);
  const [ver, setVer] = useState(null);
  const [devolver, setDevolver] = useState(null);
  const [motivo, setMotivo] = useState('');
  const resolver = async (x, estado, comentario) => {
    try {
      const r = await api('docs.revisar', {id: x.id, estado, comentario});
      avisar(r.mensaje);
      setDevolver(null);
      setMotivo('');
      recargar();
      onCambio();
    } catch (e) { avisar(e.message, 'rojo'); }
  };
  if (error) return <Fallo>{error}</Fallo>;
  if (!d) return <Cargando />;
  return (
    <>
      <div className="si-seccion-cab"><h3>{t('Pendientes de revisar')} <span className="si-tenue">· {d.pendientes.length}</span></h3></div>
      {!d.pendientes.length ? <Vacio>{t('Nada pendiente: todo revisado.')}</Vacio> : (
        <ul className="si-do-bandeja">
          {d.pendientes.map((x) => (
            <li key={x.id} style={{'--valor': cat(x.categoria).color}}>
              <header>
                <span className="si-fila"><Avatar nombre={x.persona} tam={32} /><span><strong>{x.persona}</strong><br /><small>{haceCuanto(x.creado)}</small></span></span>
                <span className="si-pe-valor"><Icono n={cat(x.categoria).icono} /> {t(cat(x.categoria).nombre)}</span>
              </header>
              <button type="button" className="si-do-titulo" onClick={() => setVer(x)}><strong>{tituloDoc(x)}</strong><small>{x.nombre} · {kb(x.tamano)}</small></button>
              {x.comentario && <q>{x.comentario}</q>}
              <footer>
                <Boton icono="ojo" onClick={() => setVer(x)}>{t('Ver')}</Boton>
                <Boton onClick={() => setDevolver(x)}>{t('Devolver')}</Boton>
                <Boton tipo="primario" icono="check" onClick={() => resolver(x, 'REVISADO', null)}>{t('Revisado')}</Boton>
              </footer>
            </li>
          ))}
        </ul>
      )}
      {d.revisados.length > 0 && (
        <Tarjeta titulo={t('Revisados últimamente')}>
          <ul className="si-lista si-mini-lista">
            {d.revisados.map((x) => (
              <li key={x.id}>
                <span className="si-do-icono" style={{color: cat(x.categoria).color}}><Icono n={cat(x.categoria).icono} /></span>
                <span><strong>{x.persona} · {tituloDoc(x)}</strong><small>{t(ESTADO_ENVIO[x.estado].nombre)} · {x.revisadoPor} · {haceCuanto(x.revisado)}{x.comentarioRrhh ? ` · ${x.comentarioRrhh}` : ''}</small></span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
      {ver && <Visor doc={{...ver, mio: false}} onCerrar={() => setVer(null)} />}
      {devolver && (
        <Modal titulo={t('Devolver «{titulo}»', {titulo: devolver.titulo})} onCerrar={() => setDevolver(null)}
          pie={<><Boton onClick={() => setDevolver(null)}>{t('Cancelar')}</Boton><Boton tipo="primario" disabled={!motivo.trim()} onClick={() => resolver(devolver, 'RECHAZADO', motivo)}>{t('Devolver')}</Boton></>}>
          <Campo etiqueta={t('Motivo (lo verá {nombre})', {nombre: devolver.persona})}>
            <textarea className="si-input" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          </Campo>
        </Modal>
      )}
    </>
  );
}
