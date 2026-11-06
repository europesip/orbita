// ÓRBITA: cabecera común y aplicación de cada Script Application (data-app).
import React, {useEffect, useMemo, useState} from 'react';
import {Avatar, Cargando, Fallo, Suite, crearApi, leerConfig, useAvisos, useDatos, useSuite} from './ui.jsx';
import {Campana, RUTAS, urlApp} from './social.jsx';
import {Fichaje} from './Fichaje.jsx';
import {Vacaciones} from './Vacaciones.jsx';
import {Aprobaciones} from './Aprobaciones.jsx';
import {Gastos} from './Gastos.jsx';
import {Inicio} from './Inicio.jsx';
import {Kiosco} from './Kiosco.jsx';
import {OrbitaIcono, PRODUCTO} from './marca.jsx';
import {Asistente} from './asistente.jsx';
import {fijarIdioma, t} from './i18n.js';

const APPS = {
  inicio: {titulo: 'Mi intranet', subtitulo: 'Tu día de un vistazo', icono: '🏠', Vista: Inicio},
  fichaje: {titulo: 'Fichaje', subtitulo: 'Registro de jornada', icono: '⏱', Vista: Fichaje},
  vacaciones: {titulo: 'Vacaciones y ausencias', subtitulo: 'Saldo, solicitudes y calendario del equipo', icono: '🌴', Vista: Vacaciones},
  aprobaciones: {titulo: 'Aprobaciones', subtitulo: 'Solicitudes de tu equipo', icono: '✔', Vista: Aprobaciones},
  gastos: {titulo: 'Gastos y viajes', subtitulo: 'Notas de gasto, tickets y solicitudes de viaje', icono: '🧾', Vista: Gastos},
};
const ROLES = {RRHH: 'RRHH', RESPONSABLE: 'Responsable', EMPLEADO: 'Empleado', ADMINISTRACION: 'Administración'};

export function App({app, url, raiz}) {
  const api = useMemo(() => crearApi(url), [url]);
  const [avisar, avisos] = useAvisos();
  // Configuración de la instalación (dónde están las páginas en DX, la clave del quiosco...) y el idioma del perfil de DX
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    leerConfig(url).then((c) => {
      RUTAS.paginas = c.paginas;
      RUTAS.quiosco = c.quiosco;
      fijarIdioma(c.idioma);
      setConfig(c);
    }).catch((e) => setError(e.message));
  }, [url]);
  if (error) return <Fallo>{error}</Fallo>;
  if (!config) return <Cargando />;
  return (
    <Suite.Provider value={{api, avisar, config, base: url}}>
      {app === 'kiosco' ? <Kiosco clave={config.claveQuiosco} raiz={raiz} /> : <Contenido app={APPS[app] ? app : 'fichaje'} />}
      {avisos}
    </Suite.Provider>
  );
}

function Contenido({app}) {
  const {config} = useSuite();
  const [yo, error] = useDatos('yo', {}, []);
  if (error) return <Fallo>{error}</Fallo>;
  if (!yo) return <Cargando />;
  const def = APPS[app];
  const {Vista} = def;
  // Qué mostrar en la cabecera (valores ui.header.* del chart): con un tema de DX que ya muestra el usuario o los
  // avisos, la aplicación no los repite
  const c = {titulo: true, inicio: true, asistente: true, avisos: true, usuario: true, ...(config && config.cabecera)};
  const derecha = (c.inicio && app !== 'inicio') || c.asistente || c.avisos || c.usuario;
  return (
    <div className="si-raiz">
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
      <Vista yo={yo} />
      {(!config || config.pie !== false) && <footer className="si-pie">{PRODUCTO} · HCL DX Compose · EuropeSIP</footer>}
    </div>
  );
}
