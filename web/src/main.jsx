// ÓRBITA: monta la aplicación de cada contenedor .si-app de una Script Application de HCL DX:
//   data-app  qué aplicación (inicio, fichaje, vacaciones, gastos, aprobaciones, kiosco)
//   data-api  base de la API REST, en el mismo host que DX (/orbita-api/v1)
// El resto (páginas del portal, clave del quiosco) lo da la API en GET /config.
import React from 'react';
import {createRoot} from 'react-dom/client';
import './suite.css';
import {App} from './app.jsx';
import {RUTAS} from './social.jsx';

function montar() {
  document.querySelectorAll('.si-app:not([data-iniciado])').forEach((el) => {
    el.dataset.iniciado = '1';
    if (el.dataset.sufijo !== undefined) RUTAS.sufijo = el.dataset.sufijo;   // vista previa fuera de DX
    createRoot(el).render(<App app={el.dataset.app} url={el.dataset.api || '/orbita-api/v1'} raiz={el} />);
  });
}
montar();
// En una Script Application el HTML puede llegar después que el script
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
