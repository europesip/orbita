// ÓRBITA: cabecera común y aplicación de cada Script Application (data-app).
import React, {useMemo} from 'react';
import {Avatar, Cargando, Fallo, Suite, crearApi, useAvisos, useDatos} from './ui.jsx';
import {Campana, urlApp} from './social.jsx';
import {Fichaje} from './Fichaje.jsx';
import {Vacaciones} from './Vacaciones.jsx';
import {Aprobaciones} from './Aprobaciones.jsx';
import {Gastos} from './Gastos.jsx';
import {Inicio} from './Inicio.jsx';
import {Kiosco} from './Kiosco.jsx';
import {OrbitaIcono, PRODUCTO} from './marca.jsx';
import {Asistente} from './asistente.jsx';

const APPS = {
  inicio: {titulo: 'Mi intranet', subtitulo: 'Tu día de un vistazo', icono: '🏠', Vista: Inicio},
  fichaje: {titulo: 'Fichaje', subtitulo: 'Registro de jornada', icono: '⏱', Vista: Fichaje},
  vacaciones: {titulo: 'Vacaciones y ausencias', subtitulo: 'Saldo, solicitudes y calendario del equipo', icono: '🌴', Vista: Vacaciones},
  aprobaciones: {titulo: 'Aprobaciones', subtitulo: 'Solicitudes de tu equipo', icono: '✔', Vista: Aprobaciones},
  gastos: {titulo: 'Gastos y viajes', subtitulo: 'Notas de gasto, tickets y solicitudes de viaje', icono: '🧾', Vista: Gastos},
};
const ROLES = {RRHH: 'RRHH', RESPONSABLE: 'Responsable', EMPLEADO: 'Empleado', ADMINISTRACION: 'Administración'};

export function App({app, url, clave, raiz}) {
  const api = useMemo(() => crearApi(url), [url]);
  const [avisar, avisos] = useAvisos();
  return (
    <Suite.Provider value={{api, avisar}}>
      {app === 'kiosco' ? <Kiosco clave={clave} raiz={raiz} /> : <Contenido app={APPS[app] ? app : 'fichaje'} />}
      {avisos}
    </Suite.Provider>
  );
}

function Contenido({app}) {
  const [yo, error] = useDatos('yo', {}, []);
  if (error) return <Fallo>{error}</Fallo>;
  if (!yo) return <Cargando />;
  const def = APPS[app];
  const {Vista} = def;
  return (
    <div className="si-raiz">
      <header className="si-cabecera">
        <div className="si-marca">
          <OrbitaIcono tam={46} />
          <div>
            <span className="si-producto">{PRODUCTO}</span>
            <h2><span className="si-titulo-icono" aria-hidden="true">{def.icono}</span>{def.titulo}</h2>
            <p>{def.subtitulo}</p>
          </div>
        </div>
        <div className="si-usuario">
          {app !== 'inicio' && <a className="si-enlace si-a-inicio" href={urlApp('inicio')}>🏠 Mi intranet</a>}
          <Asistente app={app} yo={yo} />
          <Campana inicial={yo.avisos} app={app} />
          <div><strong>{yo.nombre}</strong><span>{yo.puesto} · {ROLES[yo.rol] || yo.rol}</span></div>
          <Avatar nombre={yo.nombre} tam={38} />
        </div>
      </header>
      <Vista yo={yo} />
      <footer className="si-pie">{PRODUCTO} · HCL DX Compose · EuropeSIP</footer>
    </div>
  );
}
