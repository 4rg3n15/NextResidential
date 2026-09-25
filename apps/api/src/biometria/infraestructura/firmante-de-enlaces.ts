import { createHmac, timingSafeEqual } from 'node:crypto';
import { PROPOSITOS, derivarLlave } from '../../comun/cripto/sobre-aes-gcm';
import type { DatosDelEnlace, FirmanteDeEnlaces } from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ENLACE CON EL QUE EL TITULAR RESPONDE · A3, ETAPA 15-E
 *
 * El visitante no tiene cuenta en Next Control y RN-10 exige que sea ÉL quien
 * acepte o rechace. Lo que recibe es un enlace: `carga.firma`, donde la carga
 * es `{c, k, t, e}` —copropiedad, consentimiento, titular, caducidad— en
 * base64url, y la firma es HMAC-SHA256 con una llave derivada de la maestra de
 * biometría por copropiedad y propósito (HKDF, mismo criterio que H-13-02).
 *
 * Qué garantiza y qué no:
 *
 *   · No se puede fabricar ni alterar: cambiar un carácter de la carga rompe
 *     la firma. La llave depende de `c`, así que un token de una copropiedad
 *     no vale en otra aunque el resto coincida.
 *   · Caduca: sin `e` sería una contraseña de por vida (§2.7.8).
 *   · Es AL PORTADOR. Quien lo tiene responde como titular. Es el mismo
 *     modelo que un SMS de verificación: la garantía de identidad la da el
 *     CANAL por el que se entrega, y ese canal lo define Grupo Control
 *     ([SUPUESTO] S-43 en el informe). Por eso la carga no lleva nombre ni
 *     dato alguno del titular: un enlace filtrado no cuenta nada.
 *
 * Sin estado en el servidor: no hay tabla de tokens que limpiar ni que se
 * pueda enumerar. La revocación de un enlace es su caducidad.
 */
interface Carga {
  readonly c: string;
  readonly k: string;
  readonly t: string;
  readonly e: number;
}

const B64URL = /^[A-Za-z0-9_-]+$/;
const ID = /^[0-9a-f-]{1,64}$/i;

const esCarga = (valor: unknown): valor is Carga =>
  typeof valor === 'object' &&
  valor !== null &&
  typeof (valor as Carga).c === 'string' &&
  ID.test((valor as Carga).c) &&
  typeof (valor as Carga).k === 'string' &&
  ID.test((valor as Carga).k) &&
  typeof (valor as Carga).t === 'string' &&
  ID.test((valor as Carga).t) &&
  Number.isInteger((valor as Carga).e);

export class FirmanteHmacDeEnlaces implements FirmanteDeEnlaces {
  constructor(private readonly maestra: string) {
    if (maestra.length < 32) {
      throw new Error('La llave de enlaces de consentimiento necesita al menos 32 caracteres');
    }
  }

  private firmaDe(copropiedadId: string, cuerpo: string): Buffer {
    const llave = derivarLlave(this.maestra, copropiedadId, PROPOSITOS.enlaceDeConsentimiento);
    return createHmac('sha256', llave).update(cuerpo).digest();
  }

  firmar(datos: DatosDelEnlace): string {
    const carga: Carga = {
      c: datos.copropiedadId,
      k: datos.consentimientoId,
      t: datos.titularId,
      e: Math.floor(datos.expiraEn.getTime() / 1000),
    };
    const cuerpo = Buffer.from(JSON.stringify(carga), 'utf8').toString('base64url');
    return `${cuerpo}.${this.firmaDe(datos.copropiedadId, cuerpo).toString('base64url')}`;
  }

  verificar(token: string, ahora: Date): DatosDelEnlace | null {
    const partes = token.split('.');
    if (partes.length !== 2) return null;
    const [cuerpo, firma] = partes as [string, string];
    if (!B64URL.test(cuerpo) || !B64URL.test(firma) || cuerpo.length > 2048) return null;

    let carga: unknown;
    try {
      carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (!esCarga(carga)) return null;

    const esperada = this.firmaDe(carga.c, cuerpo);
    const recibida = Buffer.from(firma, 'base64url');
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;

    const expiraEn = new Date(carga.e * 1000);
    if (expiraEn.getTime() <= ahora.getTime()) return null;

    return { copropiedadId: carga.c, consentimientoId: carga.k, titularId: carga.t, expiraEn };
  }
}
