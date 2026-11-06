// Lectura automática de tickets: OCR en el navegador con Tesseract.js (Apache 2.0) e interpretación del texto.
// La imagen no sale del equipo; Tesseract descarga una vez su motor y el modelo de español desde su CDN.

let trabajador = null;
let alProgresar = null;

/** Lee una foto de ticket y devuelve {comercio, fecha, total, iva, ivaPct, categoria, texto} (en céntimos). */
export async function leerTicket(file, progreso) {
  alProgresar = progreso;
  if (!trabajador) {
    const {createWorker} = await import('tesseract.js');
    trabajador = await createWorker('spa', 1, {
      logger: (m) => { if (alProgresar && m.status === 'recognizing text') alProgresar(Math.round(m.progress * 100)); },
    });
  }
  const {data} = await trabajador.recognize(file);
  return interpretar(data.text);
}

const CATEGORIAS = [
  ['HOTEL', /hotel|hostal|alojamiento|habitaci[oó]n|noche/i],
  ['PARKING', /parking|aparcamiento|peaje|autopista|estacionamiento/i],
  ['TRANSPORTE', /taxi|renfe|cercan[ií]as|metro|tren|vuelo|iberia|vueling|uber|cabify|autob[uú]s|bus\b|alsa|gasolin|carburante|repsol|cepsa/i],
  ['COMIDA', /restaurante|mes[oó]n|cafeter[ií]a|bar\b|caf[eé]|men[uú]|comida|cena|taberna|pizzer|asador|brasser/i],
];

/** céntimos de un importe escrito "1.234,56", "18,00" o "18.00". */
function centimos(s) {
  const t = s.replace(/\s/g, '');
  const coma = t.lastIndexOf(','), punto = t.lastIndexOf('.');
  const dec = Math.max(coma, punto);
  const entero = t.slice(0, dec).replace(/[.,]/g, ''), decimales = t.slice(dec + 1);
  return parseInt(entero || '0', 10) * 100 + parseInt(decimales.padEnd(2, '0').slice(0, 2), 10);
}

const IMPORTE = /(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g;

export function interpretar(texto) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const importes = (l) => [...l.matchAll(IMPORTE)].map((m) => centimos(m[1]));
  let total = null, iva = null, ivaPct = null, fecha = null, comercio = null;

  for (const l of lineas) {
    if (total === null && /total/i.test(l) && !/sub\s*total|base/i.test(l)) {
      const im = importes(l);
      if (im.length) total = im[im.length - 1];
    }
    if (/i\.?v\.?a/i.test(l) && !/base|incluido/i.test(l)) {
      const p = l.match(/(\d{1,2})\s*%/);
      if (p) ivaPct = parseInt(p[1], 10);
      const im = importes(l.replace(/(\d{1,2})\s*%/, ''));
      if (im.length && iva === null) iva = im[im.length - 1];
    }
    if (!fecha) {
      const f = l.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
      if (f) {
        const a = f[3].length === 2 ? `20${f[3]}` : f[3];
        const m = parseInt(f[2], 10), d = parseInt(f[1], 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) fecha = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }
  if (total === null) {
    const todos = lineas.flatMap(importes);
    if (todos.length) total = Math.max(...todos);
  }
  if (iva !== null && total !== null && iva >= total) iva = null;
  if (iva === null && ivaPct && total) iva = total - Math.round(total / (1 + ivaPct / 100));

  // Comercio: primera línea con texto que no sea CIF, fecha ni importe
  for (const l of lineas.slice(0, 5)) {
    const limpio = l.replace(/[^\p{L}\s&'.-]/gu, '').trim();
    if (limpio.length >= 4 && !/\b(cif|nif|ticket|factura|fecha|tel|tlf|tfno|tel[eé]fono)\b/i.test(l)) {
      comercio = limpio.toLowerCase().replace(/(^|\s)\p{L}/gu, (x) => x.toUpperCase());
      break;
    }
  }
  const todo = lineas.join(' ');
  const cat = CATEGORIAS.find(([, re]) => re.test(todo));
  return {comercio, fecha, total, iva, ivaPct, categoria: cat ? cat[0] : null, texto};
}
