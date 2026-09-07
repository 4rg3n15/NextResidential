import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * RNF-03.11 · Contrato de firma del **Alarm Server**.
 *
 * La cámara publica sus eventos por HTTP contra un endpoint que no tiene sesión
 * de usuario: no hay token, no hay cookie, no hay quién inicie sesión. Lo único
 * que acredita al emisor es una firma sobre el cuerpo del mensaje. Sin ella, el
 * endpoint de ingesta sería un buzón abierto donde cualquiera con la URL puede
 * inventar accesos — y esos accesos entran en `eventos`, que es inmutable
 * (RN-03): un evento falso admitido ya no se puede quitar.
 *
 * El adaptador real llega en la ETAPA 15; **el contrato se fija aquí** porque
 * la ingesta se diseña ahora y la firma no es algo que se «añada después».
 *
 * Tres comprobaciones, y las tres son necesarias:
 *
 *  1. **HMAC-SHA256** sobre `<marca temporal>.<cuerpo crudo>`. Sobre el cuerpo
 *     CRUDO, no sobre el JSON reserializado: dos serializaciones del mismo
 *     objeto difieren en el orden de las claves y la firma dejaría de cuadrar.
 *  2. **Comparación en tiempo constante.** Un `===` filtra, por el tiempo que
 *     tarda en fallar, cuántos bytes iniciales acertó quien lo intenta.
 *  3. **Ventana de frescura.** Sin ella, una firma válida capturada una vez
 *     sirve para siempre: bastaría reenviar el mismo POST para abrir la
 *     talanquera de nuevo. La marca temporal entra en el mensaje firmado
 *     justamente para que no se pueda cambiar sin invalidar la firma.
 */
export const CABECERA_FIRMA = 'x-ncr-firma';
export const CABECERA_MARCA = 'x-ncr-marca-temporal';
/** Clave de idempotencia: el hardware duplica eventos (RN-17, CA-22). */
export const CABECERA_IDEMPOTENCIA = 'x-ncr-idempotencia';

export type MotivoFirmaInvalida =
  | 'FALTA_FIRMA'
  | 'FALTA_MARCA'
  | 'MARCA_NO_NUMERICA'
  | 'FUERA_DE_VENTANA'
  | 'FIRMA_NO_COINCIDE';

export type VerificacionDeFirma =
  | { readonly valida: true }
  | { readonly valida: false; readonly motivo: MotivoFirmaInvalida };

export interface EntradaVerificacion {
  readonly firmaRecibida: string | undefined;
  readonly marcaTemporal: string | undefined;
  readonly cuerpoCrudo: string;
  readonly secreto: string;
  readonly ahora: Date;
  readonly ventanaSegundos: number;
}

/** Mensaje canónico. Es la ÚNICA forma admitida; cambiarla invalida las firmas. */
export const mensajeCanonico = (marcaTemporal: string, cuerpoCrudo: string): string =>
  `${marcaTemporal}.${cuerpoCrudo}`;

export const firmar = (secreto: string, marcaTemporal: string, cuerpoCrudo: string): string =>
  createHmac('sha256', secreto).update(mensajeCanonico(marcaTemporal, cuerpoCrudo)).digest('hex');

const igualEnTiempoConstante = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // `timingSafeEqual` exige la misma longitud; comparar longitudes por separado
  // no filtra nada útil, porque la longitud del hexadecimal es pública y fija.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

export const verificarFirma = (entrada: EntradaVerificacion): VerificacionDeFirma => {
  const { firmaRecibida, marcaTemporal, cuerpoCrudo, secreto, ahora, ventanaSegundos } = entrada;
  if (firmaRecibida === undefined || firmaRecibida.length === 0) {
    return { valida: false, motivo: 'FALTA_FIRMA' };
  }
  if (marcaTemporal === undefined || marcaTemporal.length === 0) {
    return { valida: false, motivo: 'FALTA_MARCA' };
  }
  const marca = Number(marcaTemporal);
  if (!Number.isFinite(marca)) return { valida: false, motivo: 'MARCA_NO_NUMERICA' };

  // La ventana es simétrica: un reloj adelantado en el equipo es tan sospechoso
  // como uno atrasado, y el diagnóstico de «reloj desincronizado» es uno de los
  // fallos frecuentes que la guía de la ETAPA 15 tiene que poder explicar.
  const desviacionSegundos = Math.abs(ahora.getTime() / 1000 - marca);
  if (desviacionSegundos > ventanaSegundos) return { valida: false, motivo: 'FUERA_DE_VENTANA' };

  return igualEnTiempoConstante(firmar(secreto, marcaTemporal, cuerpoCrudo), firmaRecibida)
    ? { valida: true }
    : { valida: false, motivo: 'FIRMA_NO_COINCIDE' };
};
