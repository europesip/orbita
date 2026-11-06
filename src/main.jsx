// ÓRBITA: monta la aplicación de cada contenedor .si-app (data-app). Sirve igual dentro de un portlet del
// Portal 8.5 (data-api = URL de recurso del portlet) que como Script Application de HCL DX Compose (data-api = URL
// del servicio REST suite-api). data-paginas / data-quiosco / data-sufijo indican dónde están las demás páginas.
import React from 'react';
import {createRoot} from 'react-dom/client';
import './suite.css';
import {App} from './app.jsx';
import {RUTAS} from './social.jsx';

function montar() {
  document.querySelectorAll('.si-app:not([data-iniciado])').forEach((el) => {
    el.dataset.iniciado = '1';
    if (el.dataset.paginas) RUTAS.paginas = el.dataset.paginas;
    if (el.dataset.quiosco) RUTAS.quiosco = el.dataset.quiosco;
    if (el.dataset.sufijo !== undefined) RUTAS.sufijo = el.dataset.sufijo;
    createRoot(el).render(<App app={el.dataset.app} url={el.dataset.api} clave={el.dataset.clave} raiz={el} />);
  });
}
montar();
// En una Script Application el HTML puede llegar después que el script
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
