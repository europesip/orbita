// ÓRBITA: cabecera común y aplicación de cada Script Application (data-app).
import React, {useEffect, useMemo, useState} from 'react';
import {Avatar, Boton, Campo, Cargando, Fallo, Modal, Suite, crearApi, leerConfig, useAvisos, useDatos, useSuite} from './ui.jsx';
import {Campana, RUTAS, urlApp} from './social.jsx';
import {Fichaje} from './Fichaje.jsx';
import {Vacaciones} from './Vacaciones.jsx';
import {Aprobaciones} from './Aprobaciones.jsx';
import {Gastos} from './Gastos.jsx';
import {Inicio} from './Inicio.jsx';
import {Kiosco} from './Kiosco.jsx';
import {Comunicacion} from './Comunicacion.jsx';
import {OrbitaIcono, PRODUCTO} from './marca.jsx';
import {Asistente} from './asistente.jsx';
import {fijarIdioma, t} from './i18n.js';
import {ayudante, enEdicion, guardarAjustes, idiomasDx, leerAjustes, vigilarEdicion} from './preferencias.js';

const APPS = {
  inicio: {titulo: 'Mi intranet', subtitulo: 'Tu día de un vistazo', icono: '🏠', Vista: Inicio},
  fichaje: {titulo: 'Fichaje', subtitulo: 'Registro de jornada', icono: '⏱', Vista: Fichaje},
  vacaciones: {titulo: 'Vacaciones y ausencias', subtitulo: 'Saldo, solicitudes y calendario del equipo', icono: '🌴', Vista: Vacaciones},
  aprobaciones: {titulo: 'Aprobaciones', subtitulo: 'Solicitudes de tu equipo', icono: '✔', Vista: Aprobaciones},
  gastos: {titulo: 'Gastos y viajes', subtitulo: 'Notas de gasto, tickets y solicitudes de viaje', icono: '🧾', Vista: Gastos},
  comunicacion: {titulo: 'Comunicación con RRHH', subtitulo: 'Comunicados, consultas a RRHH y pulso', icono: '📣', Vista: Comunicacion},
};
const ROLES = {RRHH: 'RRHH', RESPONSABLE: 'Responsable', EMPLEADO: 'Empleado', ADMINISTRACION: 'Administración'};

export function App({app, url, raiz}) {
  const api = useMemo(() => crearApi(url), [url]);
  const [avisar, avisos] = useAvisos();
  const h = useMemo(() => ayudante(raiz), [raiz]);
  // Configuración de la instalación (GET /config: páginas en DX, clave del quiosco, valores ui.* del chart...) y
  // ajustes de esta instancia en la página (preferencias de la Script Application, que cambia quien edita la página)
  const [base, setBase] = useState(null);
  const [ajustes, setAjustes] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => {
    Promise.all([leerConfig(url), leerAjustes(h)]).then(([c, a]) => {
      RUTAS.paginas = c.paginas;
      RUTAS.quiosco = c.quiosco;
      setAjustes(a);
      setBase(c);
    }).catch((e) => setError(e.message));
  }, [url, h]);
  const config = useMemo(() => {
    if (!base) return null;
    const dx = idiomasDx(h);
    fijarIdioma(ajustes.idioma, base.idioma, dx.usuario, dx.pagina);
    return {...base, cabecera: {...base.cabecera, ...ajustes.cabecera}, pie: ajustes.pie !== undefined ? ajustes.pie : base.pie};
  }, [base, ajustes, h]);
  if (error) return <Fallo>{error}</Fallo>;
  if (!config) return <Cargando />;
  const instancia = h ? {base, ajustes, guardar: async (a) => { await guardarAjustes(h, a); setAjustes(a); }} : null;
  return (
    <Suite.Provider value={{api, avisar, config, base: url, instancia}}>
      {app === 'kiosco' ? <Kiosco clave={config.claveQuiosco} raiz={raiz} /> : <Contenido app={APPS[app] ? app : 'fichaje'} />}
      {avisos}
    </Suite.Provider>
  );
}

const PARTES = [['titulo', 'Título de la aplicación'], ['inicio', 'Enlace a «Mi intranet»'], ['asistente', 'Botón del asistente de IA'],
  ['avisos', 'Campana de avisos'], ['usuario', 'Nombre y foto del usuario']];

/** En el modo edición de la página: botón y ventana con los ajustes de esta instancia (preferencias de DX). */
function AjustesInstancia() {
  const {config, instancia, avisar} = useSuite();
  const [edicion, setEdicion] = useState(enEdicion);
  const [abierto, setAbierto] = useState(false);
  useEffect(() => vigilarEdicion(setEdicion), []);
  if (!instancia || !edicion) return null;
  return (
    <div className="si-ajustes-barra">
      <Boton icono="⚙" onClick={() => setAbierto(true)}>{t('Ajustes de esta aplicación')}</Boton>
      {abierto && <VentanaAjustes instancia={instancia} config={config} avisar={avisar} onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

function VentanaAjustes({instancia, config, avisar, onCerrar}) {
  const {base, ajustes} = instancia;
  const [cab, setCab] = useState({...config.cabecera});
  const [pie, setPie] = useState(config.pie !== false);
  const [idioma, setIdioma] = useState(ajustes.idioma || '');
  const [guardando, setGuardando] = useState(false);
  const guardar = async (nuevos) => {
    setGuardando(true);
    try {
      await instancia.guardar(nuevos);
      avisar(t('Ajustes guardados en esta página.'));
      onCerrar();
    } catch (e) { avisar(e.message, 'rojo'); setGuardando(false); }
  };
  // Solo se guarda lo que difiere de los valores del chart: si el chart cambia, las instancias sin ajustes lo siguen
  const cambios = () => {
    const a = {};
    const c = Object.fromEntries(PARTES.map(([k]) => [k, cab[k]]).filter(([k, v]) => v !== (base.cabecera || {})[k]));
    if (Object.keys(c).length) a.cabecera = c;
    if (pie !== (base.pie !== false)) a.pie = pie;
    if (idioma) a.idioma = idioma;
    return a;
  };
  return (
    <Modal titulo={t('Ajustes de esta aplicación')} onCerrar={onCerrar}
      pie={<><Boton disabled={guardando} onClick={() => guardar({})}>{t('Volver a los valores del chart')}</Boton>
        <Boton onClick={onCerrar}>{t('Cancelar')}</Boton>
        <Boton tipo="primario" disabled={guardando} onClick={() => guardar(cambios())}>{t('Guardar')}</Boton></>}>
      <p className="si-tenue">{t('Solo para esta aplicación en esta página. Lo que no cambies sigue los valores ui.* del chart de Helm.')}</p>
      <Campo etiqueta={t('Cabecera')}>
        <div className="si-ajustes-lista">
          {PARTES.map(([k, nombre]) => (
            <label key={k}><input type="checkbox" checked={cab[k] !== false} onChange={(e) => setCab({...cab, [k]: e.target.checked})} /> {t(nombre)}</label>
          ))}
          <label><input type="checkbox" checked={pie} onChange={(e) => setPie(e.target.checked)} /> {t('Pie «ÓRBITA · HCL DX Compose · EuropeSIP»')}</label>
        </div>
      </Campo>
      <Campo etiqueta={t('Idioma')} ayuda={t('Automático: el del perfil de DX del usuario, el de la página o el del navegador.')}>
        <select className="si-select" value={idioma} onChange={(e) => setIdioma(e.target.value)}>
          <option value="">{t('Automático')}</option>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </Campo>
    </Modal>
  );
}

function Contenido({app}) {
  const {config} = useSuite();
  const [yo, error] = useDatos('yo', {}, []);
  // Sin ficha en ÓRBITA (p. ej. wpsadmin) también se pueden cambiar los ajustes de la instancia en el modo edición
  if (error) return <><AjustesInstancia /><Fallo>{error}</Fallo></>;
  if (!yo) return <Cargando />;
  const def = APPS[app];
  const {Vista} = def;
  // Qué mostrar en la cabecera (valores ui.header.* del chart): con un tema de DX que ya muestra el usuario o los
  // avisos, la aplicación no los repite
  const c = {titulo: true, inicio: true, asistente: true, avisos: true, usuario: true, ...(config && config.cabecera)};
  const derecha = (c.inicio && app !== 'inicio') || c.asistente || c.avisos || c.usuario;
  return (
    <div className="si-raiz">
      <AjustesInstancia />
      {(c.titulo || derecha) && (
        <header className="si-cabecera">
          {c.titulo ? (
            <div className="si-marca">
              <OrbitaIcono tam={46} />
              <div>
                <span className="si-producto">{PRODUCTO}</span>
                <h2><span className="si-titulo-icono" aria-hidden="true">{def.icono}</span>{t(def.titulo)}</h2>
                <p>{t(def.subtitulo)}</p>
              </div>
            </div>
          ) : <div />}
          {derecha && (
            <div className="si-usuario">
              {c.inicio && app !== 'inicio' && <a className="si-enlace si-a-inicio" href={urlApp('inicio')}>🏠 {t('Mi intranet')}</a>}
              {c.asistente && <Asistente app={app} yo={yo} />}
              {c.avisos && <Campana inicial={yo.avisos} app={app} />}
              {c.usuario && <div><strong>{yo.nombre}</strong><span>{yo.puesto} · {ROLES[yo.rol] ? t(ROLES[yo.rol]) : yo.rol}</span></div>}
              {c.usuario && <Avatar nombre={yo.nombre} tam={38} />}
            </div>
          )}
        </header>
      )}
      {!c.asistente && <Asistente app={app} yo={yo} boton={false} />}
      <Vista yo={yo} />
      {(!config || config.pie !== false) && <footer className="si-pie">{PRODUCTO} · HCL DX Compose · EuropeSIP
        {' · '}<a href={config.codigoFuente || 'https://github.com/europesip/orbita'} target="_blank" rel="noopener noreferrer">{t('Código fuente')}</a></footer>}
    </div>
  );
}
