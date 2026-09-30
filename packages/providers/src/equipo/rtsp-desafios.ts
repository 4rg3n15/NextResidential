import { algoritmoAdmitido, interpretarDesafio } from '../barrera/digest-calculo';
import type { DesafioDigest } from '../barrera/digest-calculo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * V3 (15-N) · QUÉ DESAFÍO SE RESPONDE Y QUÉ SIGNIFICA CADA RECHAZO RTSP
 *
 * El 29/09 la sonda dijo «credencial rechazada por RTSP» en el videoportero con
 * la MISMA credencial que su HTTP acepta. El Bloque 0 descartó la hipótesis del
 * nonce heredado —la sonda abre una conexión nueva y hace su propio
 * intercambio— y encontró dos defectos que dan ese 401 con la clave buena:
 *
 *  · las cabeceras `WWW-Authenticate` repetidas se UNÍAN en una y el intérprete
 *    sólo corta en `Basic`/`Bearer`…: dos desafíos Digest (MD5 y SHA-256, lo
 *    que ofrece un equipo en modo «MD5/SHA256») se MEZCLABAN parámetro a
 *    parámetro;
 *  · el resumen era MD5 aunque el desafío pidiera SHA-256.
 *
 * Aquí cada cabecera es un desafío, se elige UNO —Digest MD5, si no Digest
 * SHA-256, si no Basic— y se describe lo ofrecido y lo enviado SIN la clave ni
 * el nonce, para que la visita lo compare con el panel del equipo. Los estados
 * que no son 401 se dicen en palabras: no es lo mismo un usuario sin permiso de
 * vista en vivo (403) que un canal que el equipo no tiene (404/412) o una
 * sesión que rechaza (454).
 *
 * Manual IP/Ultra, «Real-Time Live View · API Calling Flow»: DESCRIBE → 401
 * con `Digest realm, nonce, algorithm="MD5"` → DESCRIBE con `Authorization`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface DesafioElegido {
  readonly esquema: 'Digest' | 'Basic';
  /** Sólo con Digest. */
  readonly digest: DesafioDigest | null;
}

/** Una cabecera puede traer dos desafíos unidos por coma: se separan por esquema. */
export const separarDesafios = (valores: readonly string[]): readonly string[] =>
  valores.flatMap((v) =>
    v
      .split(/,\s*(?=(?:Digest|Basic|Bearer|Negotiate|NTLM)\s)/i)
      .map((t) => t.trim())
      .filter((t) => t !== ''),
  );

const esquemaDe = (desafio: string): string => /^\s*([A-Za-z]+)/.exec(desafio)?.[1] ?? '';

/** Digest MD5 (o sin algoritmo, que es MD5), luego Digest SHA-256, luego Basic. */
export const elegirDesafio = (valores: readonly string[]): DesafioElegido | null => {
  const desafios = separarDesafios(valores);
  const digests = desafios
    .filter((d) => /^digest$/i.test(esquemaDe(d)))
    .map((d) => interpretarDesafio(d))
    .filter((d): d is DesafioDigest => d !== null && algoritmoAdmitido(d.algorithm));
  const md5 = digests.find((d) => d.algorithm === 'MD5');
  const elegido = md5 ?? digests[0];
  if (elegido !== undefined) return { esquema: 'Digest', digest: elegido };
  return desafios.some((d) => /^basic$/i.test(esquemaDe(d)))
    ? { esquema: 'Basic', digest: null }
    : null;
};

/** Lo ofrecido, sin nonce ni opaque: esquema, reino, algoritmo y qop de cada desafío. */
export const describirOfrecidos = (valores: readonly string[]): string => {
  const desafios = separarDesafios(valores);
  if (desafios.length === 0) return 'ningún desafío (sin cabecera WWW-Authenticate)';
  return desafios
    .map((d) => {
      const esquema = esquemaDe(d);
      if (!/^digest$/i.test(esquema)) return esquema;
      const x = interpretarDesafio(d);
      return x === null
        ? 'Digest ilegible'
        : `Digest realm="${x.realm}", algorithm=${x.algorithm}, qop=${x.qop ?? 'ninguno'}`;
    })
    .join(' · ');
};

/** Lo enviado, sin la clave. */
export const describirEnviado = (elegido: DesafioElegido, usuario: string): string =>
  elegido.digest === null
    ? `Basic con el usuario «${usuario}»`
    : `Digest ${elegido.digest.algorithm} con el usuario «${usuario}»`;

export type CausaDeRechazoRtsp = 'sin_permiso' | 'sin_canal' | 'sesion' | 'otro';

export const causaDeRechazoRtsp = (estado: number): CausaDeRechazoRtsp =>
  estado === 403
    ? 'sin_permiso'
    : estado === 404 || estado === 412
      ? 'sin_canal'
      : estado === 454
        ? 'sesion'
        : 'otro';

/** El rechazo en palabras, con el remedio y el código detrás. */
export const fraseDeRechazoRtsp = (estado: number, camino: string): string => {
  const codigo = `RTSP ${String(estado)}`;
  switch (causaDeRechazoRtsp(estado)) {
    case 'sin_permiso':
      return (
        `el equipo reconoce la credencial pero el usuario no tiene permiso de vista en vivo ` +
        `(${codigo}): actívelo en el panel del equipo`
      );
    case 'sin_canal': {
      const canal = /Channels\/(\d+)/i.exec(camino)?.[1];
      return canal === undefined
        ? `el equipo no tiene el flujo ${camino} (${codigo}): elija uno de los canales que declara`
        : `el equipo no tiene el canal ${canal} (${codigo}): elija uno de los que declara`;
    }
    case 'sesion':
      return (
        `el equipo rechazó la sesión RTSP (${codigo} Session Not Found): suele ser el tope de ` +
        'sesiones simultáneas del equipo; cierre otras vistas y reintente'
      );
    default:
      return `el equipo contestó ${codigo} a ${camino}`;
  }
};
