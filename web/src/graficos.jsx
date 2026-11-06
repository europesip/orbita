// Gráficos sencillos en SVG (sin librerías): barras con objetivo y anillo.
import React from 'react';
import {t} from './i18n.js';

/** Barras verticales con una marca de objetivo por barra. datos: [{etiqueta, valor, objetivo, titulo}] */
export function Barras({datos, alto = 160, formato = (v) => v, color = 'var(--si-acento)'}) {
  const max = Math.max(1, ...datos.map((d) => Math.max(d.valor, d.objetivo || 0))) * 1.12;
  const ancho = 100 / datos.length;
  return (
    <div className="si-grafico">
      <svg viewBox={`0 0 100 ${alto}`} preserveAspectRatio="none" style={{height: alto}} role="img" aria-label={t('Gráfico de barras')}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2="100" y1={alto * f} y2={alto * f} className="si-g-rejilla" />)}
        {datos.map((d, i) => {
          const h = (d.valor / max) * alto, x = i * ancho + ancho * 0.2, w = ancho * 0.6;
          const oy = d.objetivo ? alto - (d.objetivo / max) * alto : null;
          const bajo = !d.enCurso && d.objetivo && d.valor < d.objetivo * 0.95;
          return (
            <g key={i}>
              <title>{d.titulo || `${d.etiqueta}: ${formato(d.valor)}`}</title>
              <rect x={x} y={alto - h} width={w} height={h} rx="1.2" fill={bajo ? 'var(--si-ambar)' : color} opacity={i === datos.length - 1 ? 0.55 : 1} />
              {oy !== null && <line x1={x - 1} x2={x + w + 1} y1={oy} y2={oy} className="si-g-objetivo" />}
            </g>
          );
        })}
      </svg>
      <div className="si-g-etiquetas">
        {datos.map((d, i) => <span key={i}><b>{formato(d.valor)}</b>{d.etiqueta}</span>)}
      </div>
    </div>
  );
}

/** Anillo con segmentos. segmentos: [{valor, color, etiqueta}] */
export function Anillo({segmentos, tam = 120, grosor = 16, centro, sub}) {
  const r = (tam - grosor) / 2, c = 2 * Math.PI * r;
  const total = segmentos.reduce((s, x) => s + x.valor, 0) || 1;
  let acumulado = 0;
  return (
    <div className="si-anillo" style={{width: tam, height: tam}}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} role="img" aria-label={t('Gráfico de anillo')}>
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="#eef0f4" strokeWidth={grosor} />
        {segmentos.filter((s) => s.valor > 0).map((s, i) => {
          const largo = (s.valor / total) * c;
          const el = (
            <circle key={i} cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={s.color} strokeWidth={grosor}
              strokeDasharray={`${largo} ${c - largo}`} strokeDashoffset={-acumulado} transform={`rotate(-90 ${tam / 2} ${tam / 2})`}>
              <title>{s.etiqueta}</title>
            </circle>
          );
          acumulado += largo;
          return el;
        })}
      </svg>
      {centro !== undefined && <div className="si-anillo-centro"><strong>{centro}</strong>{sub && <small>{sub}</small>}</div>}
    </div>
  );
}
