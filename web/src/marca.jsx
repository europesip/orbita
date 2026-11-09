// Marca de ÓRBITA: icono (SVG en línea, sin ficheros aparte que WCM tenga que servir) y logotipo.
// El mismo dibujo está en marca/orbita.svg para documentación y presentaciones.
import React, {useId} from 'react';

export const PRODUCTO = 'ÓRBITA';

/** Icono: planeta con anillo orbital inclinado y un satélite, sobre fondo degradado. */
export function OrbitaIcono({tam = 44, titulo = PRODUCTO}) {
  const id = useId().replace(/:/g, '');   // ids únicos: puede haber varios iconos en la misma página de DX
  const f = `orb-f-${id}`, p = `orb-p-${id}`, s = `orb-s-${id}`;
  return (
    <svg className="si-orbita-icono" width={tam} height={tam} viewBox="0 0 64 64" role="img" aria-label={titulo}>
      <defs>
        <linearGradient id={f} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b5fff" />
          <stop offset=".55" stopColor="#004ad7" />
          <stop offset="1" stopColor="#004ad7" />
        </linearGradient>
        <radialGradient id={p} cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#dce8ff" />
          <stop offset="1" stopColor="#80acff" />
        </radialGradient>
        <radialGradient id={s} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#b3cdff" />
          <stop offset="1" stopColor="#4b9bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${f})`} />
      <circle cx="13" cy="14" r="1.1" fill="#fff" opacity=".7" />
      <circle cx="52" cy="11" r=".8" fill="#fff" opacity=".55" />
      <circle cx="49" cy="54" r="1" fill="#fff" opacity=".45" />
      <g transform="rotate(-25 32 32)">
        {/* mitad trasera de la órbita, por detrás del planeta */}
        <path d="M8 32 A24 9 0 0 1 56 32" fill="none" stroke="#fff" strokeWidth="2.4" strokeOpacity=".45" strokeLinecap="round" />
        <circle cx="32" cy="32" r="11.5" fill={`url(#${p})`} />
        {/* mitad delantera, por encima del planeta */}
        <path d="M8 32 A24 9 0 0 0 56 32" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="51.7" cy="37.2" r="6.5" fill={`url(#${s})`} />
        <circle cx="51.7" cy="37.2" r="3.4" fill="#4b9bff" stroke="#fff" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

/** Logotipo: icono + nombre. */
export function OrbitaLogo({tam = 32, claro = false}) {
  return (
    <span className={`si-orbita-logo${claro ? ' si-orbita-claro' : ''}`}>
      <OrbitaIcono tam={tam} />
      <span className="si-orbita-nombre" style={{fontSize: Math.round(tam * 0.5)}}>{PRODUCTO}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Iconos de las aplicaciones, con el estilo de la marca: el cuadrado redondeado con el degradado azul del icono de
// ÓRBITA, la órbita inclinada al fondo (tenue), las estrellas y el satélite, y el dibujo de cada aplicación en blanco.
// Dibujos propios en una cuadrícula de 64×64 (trazo de 3,4).

const DIBUJO_APP = {
  // Mi intranet: casa
  inicio: <><path d="M18 32 32 20l14 12v13a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2Z" /><path d="M28 47v-9h8v9" /></>,
  // Fichaje: reloj con la aguja marcando
  fichaje: <><circle cx="32" cy="33" r="13" /><path d="M32 26v7l5 4" /><path d="M28 16h8" /></>,
  // Vacaciones: sol sobre el horizonte
  vacaciones: <><circle cx="32" cy="33" r="6.5" /><path d="M32 19v4M20.7 23.7l2.8 2.8M43.3 23.7l-2.8 2.8M17 33h4M43 33h4" /><path d="M17 45h30M23 50h18" /></>,
  // Gastos y viajes: ticket con el borde dentado
  gastos: <><path d="M22 16h20v31l-3.3-2.4-3.4 2.4-3.3-2.4-3.3 2.4-3.4-2.4L22 47Z" /><path d="M27 24h10M27 30h10M27 36h6" /></>,
  // Aprobaciones: documento con una marca de visto bueno
  aprobaciones: <><path d="M38 16H23a2 2 0 0 0-2 2v28a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V21Z" /><path d="M38 16v5h5" /><path d="m26.5 33 4.5 4.5 8-8.5" /></>,
  // Comunicación con RRHH: megáfono con ondas
  comunicacion: <><path d="M17 29v7h5l13 8V21l-13 8Z" /><path d="m22 36 2 9h4l-1-8" /><path d="M41 27.5a6.5 6.5 0 0 1 0 9.5M45 23.5a12 12 0 0 1 0 17.5" /></>,
  // Personas: dos personas
  personas: <><circle cx="27" cy="27" r="5.5" /><path d="M16.5 46a10.5 10.5 0 0 1 21 0" /><circle cx="40.5" cy="29" r="4.2" /><path d="M39 37.5a8 8 0 0 1 9.5 8" /></>,
  // Mis documentos: carpeta con un documento asomando
  documentos: <><path d="M23 24v-7h14l5 5v7" /><path d="M15 27a2 2 0 0 1 2-2h9l3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H17a2 2 0 0 1-2-2Z" /><path d="M23 38h12" /></>,
  // Encuestas: portapapeles con un gráfico de barras
  encuestas: <><path d="M24 15h-5a2 2 0 0 0-2 2v29a2 2 0 0 0 2 2h26a2 2 0 0 0 2-2V17a2 2 0 0 0-2-2h-5" /><rect x="24" y="12" width="16" height="6" rx="1.5" /><path d="M25 41v-6M32 41V28M39 41v-9" /></>,
  // Quiosco de fichaje: tableta con un código QR
  kiosco: <><rect x="20" y="15" width="24" height="34" rx="3" /><path d="M27 23h4v4h-4zM33 23h4v4h-4zM27 29h4v4h-4zM34 30h3M34 33h3" /><path d="M29 43h6" /></>,
};
DIBUJO_APP.quiosco = DIBUJO_APP.kiosco;

/** Icono de una aplicación de ÓRBITA (inicio, fichaje, vacaciones, gastos, aprobaciones, comunicacion, personas, documentos, kiosco). */
export function IconoApp({app, tam = 40, titulo}) {
  const id = useId().replace(/:/g, '');
  const f = `orb-af-${id}`;
  const dibujo = DIBUJO_APP[app];
  if (!dibujo) return null;
  return (
    <svg className="si-icono-app" width={tam} height={tam} viewBox="0 0 64 64" role={titulo ? 'img' : undefined} aria-label={titulo}
      aria-hidden={titulo ? undefined : 'true'} focusable="false">
      <defs>
        <linearGradient id={f} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b5fff" />
          <stop offset=".55" stopColor="#004ad7" />
          <stop offset="1" stopColor="#004ad7" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${f})`} />
      {/* estrellas y órbita del logotipo, tenues para no competir con el dibujo */}
      <circle cx="11" cy="12" r="1" fill="#fff" opacity=".6" />
      <circle cx="54" cy="53" r=".9" fill="#fff" opacity=".45" />
      <ellipse cx="32" cy="32" rx="27" ry="10" transform="rotate(-25 32 32)" fill="none" stroke="#fff" strokeWidth="1.6" strokeOpacity=".22" />
      <g fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">{dibujo}</g>
      {/* el satélite, en la órbita */}
      <circle cx="54.3" cy="21.6" r="3.1" fill="#4b9bff" stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}
