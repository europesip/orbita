// Quiosco de fichaje: tablet en la entrada; cada persona se identifica con su PIN o su tarjeta (QR) y ficha.
import React, {useEffect, useRef, useState} from 'react';
import jsQR from 'jsqr';
import {Avatar, dosCifras, horas, useReloj, useSuite} from './ui.jsx';
import {OrbitaLogo} from './marca.jsx';
import {locale, t} from './i18n.js';

const DESPEDIDA = {
  ENTRADA: (n) => t('¡Que tengas un buen día, {n}!', {n}), PAUSA: (n) => t('Buen descanso, {n}.', {n}),
  REANUDAR: (n) => t('De vuelta, {n}. ¡Ánimo!', {n}), SALIDA: (n) => t('¡Hasta mañana, {n}!', {n}),
};
const NOMBRE = {ENTRADA: 'Entrada', PAUSA: 'Pausa', REANUDAR: 'Vuelta de la pausa', SALIDA: 'Salida'};

export function Kiosco({clave, raiz}) {
  const {api} = useSuite();
  // En modo demo, la API da algunos PIN para probar el quiosco
  const [pistas, setPistas] = useState([]);
  useEffect(() => { api('kiosco.demo', {clave}).then((d) => setPistas(d.pistas || [])).catch(() => {}); }, [clave]); // eslint-disable-line
  const ahora = useReloj();
  const [modo, setModo] = useState('pin');
  const [pin, setPin] = useState('');
  const [persona, setPersona] = useState(null); // {usuario, nombre, ..., fichaje, cred}
  const [hecho, setHecho] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Pantalla completa sobre el tema del Portal (un contenedor del tema rompe position: fixed: se mueve a <body>)
  useEffect(() => {
    document.body.appendChild(raiz);
    document.documentElement.style.overflow = 'hidden';
  }, [raiz]);

  // Vuelta automática al inicio
  useEffect(() => {
    if (!persona && !hecho) return undefined;
    const id = setTimeout(reiniciar, hecho ? 5000 : 20000);
    return () => clearTimeout(id);
  }, [persona, hecho]); // eslint-disable-line

  function reiniciar() { setPersona(null); setHecho(null); setPin(''); setError(''); }

  const identificar = async (cred) => {
    setOcupado(true);
    setError('');
    try {
      const p = await api('kiosco.identificar', {clave, ...cred});
      setPersona({...p, cred});
    } catch (e) {
      setError(e.message);
      setPin('');
    } finally { setOcupado(false); }
  };
  const marcar = async (tipo) => {
    setOcupado(true);
    try {
      const r = await api('kiosco.marcar', {clave, tipo, ...persona.cred});
      setHecho({tipo, nombre: persona.nombre.split(' ')[0], completo: persona.nombre, fichaje: r.fichaje});
      setPersona(null);
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };
  const tecla = (k) => {
    if (ocupado) return;
    if (k === '⌫') { setPin(pin.slice(0, -1)); return; }
    if (k === 'C') { setPin(''); return; }
    const nuevo = (pin + k).slice(0, 4);
    setPin(nuevo);
    setError('');
    if (nuevo.length === 4) identificar({pin: nuevo});
  };
  useEffect(() => {
    const k = (e) => {
      if (persona || hecho || modo !== 'pin') return;
      if (/^[0-9]$/.test(e.key)) tecla(e.key);
      else if (e.key === 'Backspace') tecla('⌫');
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  return (
    <div className="si-kiosco">
      <header className="si-k-cab">
        <span className="si-k-marca"><OrbitaLogo tam={34} claro /><span className="si-k-sep">{t('Quiosco de fichaje')}</span></span>
        <span>{ahora.toLocaleDateString(locale(), {weekday: 'long', day: 'numeric', month: 'long'})}</span>
      </header>
      <main className="si-k-cuerpo">
        <section className="si-k-reloj">
          <span className="si-k-hora">{dosCifras(ahora.getHours())}:{dosCifras(ahora.getMinutes())}<small>:{dosCifras(ahora.getSeconds())}</small></span>
          <p>{t('Identifícate con tu PIN o acerca tu tarjeta a la cámara.')}</p>
        </section>

        <section className="si-k-panel">
          {hecho ? <Hecho h={hecho} onSalir={reiniciar} /> : persona ? (
            <div className="si-k-persona">
              <Avatar nombre={persona.nombre} tam={84} />
              <h2>{t('Hola, {n}', {n: persona.nombre.split(' ')[0]})}</h2>
              <p>{{
                TRABAJANDO: `${t('Trabajando desde las {hora}', {hora: persona.fichaje.desde})} · ${t('hoy llevas {h}', {h: horas(persona.fichaje.minutosHoy)})}`,
                PAUSA: t('En pausa desde las {hora}', {hora: persona.fichaje.desde}),
                FUERA: persona.fichaje.marcas.length ? t('Hoy llevas {h}', {h: horas(persona.fichaje.minutosHoy)}) : t('Aún no has fichado hoy'),
              }[persona.fichaje.estado]}</p>
              <div className="si-k-acciones">
                {persona.fichaje.estado === 'FUERA' && <button type="button" className="si-k-boton verde" disabled={ocupado} onClick={() => marcar('ENTRADA')}>▶ {t('Entrada')}</button>}
                {persona.fichaje.estado === 'TRABAJANDO' && <>
                  <button type="button" className="si-k-boton ambar" disabled={ocupado} onClick={() => marcar('PAUSA')}>❚❚ {t('Pausa')}</button>
                  <button type="button" className="si-k-boton rojo" disabled={ocupado} onClick={() => marcar('SALIDA')}>■ {t('Salida')}</button>
                </>}
                {persona.fichaje.estado === 'PAUSA' && <>
                  <button type="button" className="si-k-boton verde" disabled={ocupado} onClick={() => marcar('REANUDAR')}>▶ {t('Volver|pausa')}</button>
                  <button type="button" className="si-k-boton rojo" disabled={ocupado} onClick={() => marcar('SALIDA')}>■ {t('Salida')}</button>
                </>}
              </div>
              {error && <p className="si-k-error">{error}</p>}
              <button type="button" className="si-k-cancelar" onClick={reiniciar}>{t('No soy {n}', {n: persona.nombre.split(' ')[0]})}</button>
            </div>
          ) : (
            <>
              <nav className="si-k-modos">
                <button type="button" className={modo === 'pin' ? 'activa' : ''} onClick={() => { setModo('pin'); setError(''); }}>🔢 PIN</button>
                <button type="button" className={modo === 'tarjeta' ? 'activa' : ''} onClick={() => { setModo('tarjeta'); setError(''); }}>📷 {t('Tarjeta QR')}</button>
              </nav>
              {modo === 'pin' ? (
                <div className="si-k-pin">
                  <div className="si-k-puntos">{[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'lleno' : ''} />)}</div>
                  {error && <p className="si-k-error">{error}</p>}
                  <div className="si-k-teclado">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                      <button key={k} type="button" onClick={() => tecla(k)} disabled={ocupado}>{k}</button>
                    ))}
                  </div>
                  {pistas.length > 0 && <p className="si-k-demo">{t('Demo:')} {pistas.map((x) => `${x.nombre} ${x.pin}`).join(' · ')}</p>}
                </div>
              ) : <LectorTarjeta onLeida={(tarjeta) => identificar({tarjeta})} error={error} />}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Hecho({h, onSalir}) {
  const salida = h.tipo === 'SALIDA';
  return (
    <div className="si-k-hecho" onClick={onSalir} role="button" tabIndex={0}>
      <span className="si-k-check">✓</span>
      <h2>{t('{tipo} registrada', {tipo: t(NOMBRE[h.tipo])})}</h2>
      <p className="si-k-cuando">{dosCifras(new Date().getHours())}:{dosCifras(new Date().getMinutes())} · {h.completo}</p>
      {salida && <p className="si-k-resumen">{t('Hoy has trabajado')} <b>{horas(h.fichaje.minutosHoy)}</b></p>}
      <p>{DESPEDIDA[h.tipo](h.nombre)}</p>
    </div>
  );
}

/** Lee el QR de la tarjeta con la cámara (BarcodeDetector si existe; si no, jsQR). */
function LectorTarjeta({onLeida, error}) {
  const video = useRef(null);
  const [estado, setEstado] = useState(t('Abriendo la cámara…'));
  useEffect(() => {
    let flujo, parar = false, ultimo = '';
    const lienzo = document.createElement('canvas');
    const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({formats: ['qr_code']}) : null;
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user'}});
        video.current.srcObject = flujo;
        await video.current.play();
        setEstado(t('Acerca el código QR de tu tarjeta a la cámara'));
      } catch (e) {
        setEstado(t('No hay cámara disponible: usa tu PIN.'));
        return;
      }
      const leer = async () => {
        if (parar) return;
        const v = video.current;
        let texto = null;
        if (v && v.readyState >= 2) {
          try {
            if (detector) {
              const r = await detector.detect(v);
              if (r.length) texto = r[0].rawValue;
            } else {
              lienzo.width = v.videoWidth;
              lienzo.height = v.videoHeight;
              const ctx = lienzo.getContext('2d');
              ctx.drawImage(v, 0, 0);
              const qr = jsQR(ctx.getImageData(0, 0, lienzo.width, lienzo.height).data, lienzo.width, lienzo.height);
              if (qr) texto = qr.data;
            }
          } catch (e) { /* siguiente fotograma */ }
        }
        if (texto && texto !== ultimo) {
          ultimo = texto;
          onLeida(texto);
          setTimeout(() => { ultimo = ''; }, 3000);
        }
        setTimeout(leer, 250);
      };
      leer();
    })();
    return () => { parar = true; if (flujo) flujo.getTracks().forEach((pista) => pista.stop()); };
  }, []); // eslint-disable-line
  return (
    <div className="si-k-tarjeta">
      <div className="si-k-video"><video ref={video} muted playsInline /><span className="si-k-marco" /></div>
      <p>{estado}</p>
      {error && <p className="si-k-error">{error}</p>}
    </div>
  );
}
