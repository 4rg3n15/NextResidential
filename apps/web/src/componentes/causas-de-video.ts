/**
 * E2/C1 (15-M) · LO QUE SE LE DICE AL OPERADOR CUANDO NO HAY VIDEO.
 *
 * La API ya explica sus fallos con remedio; aquí se cubre lo que aún llegaría
 * técnico —un cuerpo JSON sin desenvolver, un «EOF» de una API anterior, un
 * `fetch failed` del propio navegador— y se añade la acción que corresponde a
 * cada código. Nunca un JSON crudo en el recuadro de la guardia.
 */
interface Causa {
  readonly patron: RegExp;
  readonly frase: string;
}

const CAUSAS: readonly Causa[] = [
  {
    patron: /ECONNREFUSED|fetch failed|no está en marcha|TimeoutError/i,
    frase: 'go2rtc no está en marcha en el Mac: arránquelo con `pnpm sitio:video`',
  },
  {
    patron: /EOF|backchannel|connection reset|\b551\b/i,
    frase:
      'el equipo cerró la conexión de video (backchannel): compruebe el canal en la ficha y ' +
      'el permiso de vista en vivo del usuario de servicio',
  },
  {
    patron: /\b412\b|no tiene (?:el|ese) canal/i,
    frase: 'el equipo no tiene ese canal de video: elija otro canal en la ficha del equipo',
  },
  {
    patron: /\b401\b|rechazó la credencial/i,
    frase:
      'el equipo rechazó la credencial por RTSP: active la vista en vivo para el usuario de ' +
      'servicio en el panel del equipo',
  },
];

/** Si el texto es un JSON de error, su `mensaje`/`message`; si no, el texto. */
const desenvuelto = (mensaje: string): string => {
  if (!/^\s*\{/.test(mensaje)) return mensaje;
  try {
    const cuerpo: unknown = JSON.parse(mensaje);
    if (typeof cuerpo === 'object' && cuerpo !== null) {
      const { mensaje: m, message } = cuerpo as { mensaje?: unknown; message?: unknown };
      if (typeof m === 'string') return m;
      if (typeof message === 'string') return message;
    }
  } catch {
    // no era JSON válido
  }
  return 'el puente devolvió un error técnico';
};

/** El canal que nombra un mensaje («canal 102», «Channels/102»), si lo nombra. */
const canalNombrado = (texto: string): string | null =>
  /(?:canal|Channels\/)\s*([1-9][0-9]{2,3})\b/i.exec(texto)?.[1] ?? null;

export const fraseDeErrorDeVideo = (codigo: string, mensaje: string): string => {
  const texto = desenvuelto(mensaje);
  if (codigo === 'sin_puente') {
    return /sitio:video/.test(texto)
      ? texto
      : `${texto}. Arranque el puente en el Mac: pnpm sitio:video`;
  }
  const causa = CAUSAS.find((c) => c.patron.test(texto));
  if (causa === undefined) return texto;
  const canal = canalNombrado(texto);
  const frase =
    canal !== null && /no tiene ese canal/.test(causa.frase)
      ? causa.frase.replace('ese canal de video', `el canal ${canal}`)
      : causa.frase;
  // Lo que ya venía explicado por la API no se repite: sólo se antepone la frase corta.
  return /pnpm sitio:video|elija otro canal|permiso de vista en vivo/.test(texto)
    ? texto
    : `${frase[0]?.toUpperCase() ?? ''}${frase.slice(1)} (${texto.slice(0, 160)})`;
};
