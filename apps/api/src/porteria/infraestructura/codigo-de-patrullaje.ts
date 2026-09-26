import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PROPOSITOS, derivarLlave } from '../../comun/cripto/sobre-aes-gcm';
import type { CodigoDePatrullaje } from '../aplicacion/puertos';

const scryptAsync = promisify(scrypt) as (
  clave: string,
  sal: Buffer,
  longitud: number,
) => Promise<Buffer>;

/**
 * EL CÓDIGO DE PATRULLAJE · 4 dígitos por turno y portero (ADR-024, S-48).
 *
 * Se DERIVA con HMAC-SHA256 bajo una llave propia de la copropiedad —HKDF de
 * la maestra con el propósito `ncr:codigo-de-patrullaje:v1`—, así que cambia
 * con cada turno sin guardarse en claro en ninguna parte. La sesión sólo
 * conserva su hash scrypt con sal, y el desbloqueo compara en tiempo constante.
 *
 * Cuatro dígitos son 10 000 combinaciones y el quinto fallo cierra la sesión:
 * la probabilidad de acertar a ciegas es 5 entre 10 000. Es un bloqueo de
 * pantalla, no un factor de autenticación, y así se declara en el ADR.
 */
export class CodigoDePatrullajeHmac implements CodigoDePatrullaje {
  constructor(private readonly llaveMaestra: string) {}

  derivar(copropiedadId: string, turnoId: string, porteroId: string): string {
    const llave = derivarLlave(this.llaveMaestra, copropiedadId, PROPOSITOS.codigoDePatrullaje);
    const resumen = createHmac('sha256', llave).update(`${turnoId}:${porteroId}`).digest();
    return String(resumen.readUInt32BE(0) % 10_000).padStart(4, '0');
  }

  async hash(codigo: string): Promise<string> {
    const sal = randomBytes(16);
    const derivado = await scryptAsync(codigo, sal, 32);
    return `scrypt$${sal.toString('base64')}$${derivado.toString('base64')}`;
  }

  async coincide(codigo: string, hash: string): Promise<boolean> {
    const [esquema, sal, esperado] = hash.split('$');
    if (esquema !== 'scrypt' || sal === undefined || esperado === undefined) return false;
    if (!/^\d{4}$/.test(codigo)) return false;
    const obtenido = await scryptAsync(codigo, Buffer.from(sal, 'base64'), 32);
    const referencia = Buffer.from(esperado, 'base64');
    return referencia.length === obtenido.length && timingSafeEqual(referencia, obtenido);
  }
}
