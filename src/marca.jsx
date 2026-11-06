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
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset=".55" stopColor="#6d28d9" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <radialGradient id={p} cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#e0e7ff" />
          <stop offset="1" stopColor="#a5b4fc" />
        </radialGradient>
        <radialGradient id={s} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#a5f3fc" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
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
        <circle cx="51.7" cy="37.2" r="3.4" fill="#22d3ee" stroke="#fff" strokeWidth="1.2" />
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
