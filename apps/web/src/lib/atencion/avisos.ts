/**
 * ═════════════════════════════════════════════════════════════════════════════
 * G2 (15-N) · EL SONIDO Y LA NOTIFICACIÓN DEL NAVEGADOR
 *
 * El sonido es un tono sintetizado con WebAudio: ni fichero ni `<audio>`, así
 * que no pide nada a la CSP (`media-src`) ni a la red. El navegador sólo deja
 * sonar tras un gesto del usuario en la página (política de reproducción
 * automática): si todavía no lo hubo, `sonarAviso` devuelve `false` y la
 * pantalla lo dice en vez de callar.
 *
 * La notificación del navegador, sólo si el usuario la autorizó: nunca se pide
 * permiso sin un clic suyo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
type ConstructorDeAudio = new () => AudioContext;

let contexto: AudioContext | null = null;

const constructorDeAudio = (): ConstructorDeAudio | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: ConstructorDeAudio;
    webkitAudioContext?: ConstructorDeAudio;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};

/** Dos tonos cortos. Devuelve si pudo sonar. Nunca lanza. */
export const sonarAviso = (urgente = false): boolean => {
  try {
    const Constructor = constructorDeAudio();
    if (Constructor === null) return false;
    contexto ??= new Constructor();
    if (contexto.state === 'suspended') void contexto.resume();
    if (contexto.state !== 'running') return false;
    const inicio = contexto.currentTime;
    const tonos = urgente ? [880, 660, 880] : [660, 880];
    tonos.forEach((frecuencia, i) => {
      const c = contexto as AudioContext;
      const oscilador = c.createOscillator();
      const volumen = c.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.value = frecuencia;
      const t = inicio + i * 0.22;
      volumen.gain.setValueAtTime(0.0001, t);
      volumen.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      volumen.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      oscilador.connect(volumen).connect(c.destination);
      oscilador.start(t);
      oscilador.stop(t + 0.21);
    });
    return true;
  } catch {
    return false;
  }
};

export type PermisoDeNotificacion = 'no_disponible' | 'default' | 'granted' | 'denied';

export const permisoDeNotificacion = (): PermisoDeNotificacion =>
  typeof window === 'undefined' || typeof Notification === 'undefined'
    ? 'no_disponible'
    : Notification.permission;

/** Sólo tras un clic del usuario. */
export const pedirPermisoDeNotificacion = async (): Promise<PermisoDeNotificacion> => {
  if (permisoDeNotificacion() === 'no_disponible') return 'no_disponible';
  try {
    return await Notification.requestPermission();
  } catch {
    return permisoDeNotificacion();
  }
};

/**
 * Una notificación por elemento (`etiqueta`: el navegador reemplaza la del
 * mismo elemento en vez de apilarla). Al pulsarla, `alPulsar`.
 */
export const notificar = (
  titulo: string,
  cuerpo: string,
  etiqueta: string,
  alPulsar: () => void,
): boolean => {
  if (permisoDeNotificacion() !== 'granted') return false;
  try {
    const n = new Notification(titulo, { body: cuerpo, tag: etiqueta });
    n.onclick = () => {
      window.focus();
      alPulsar();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
};
