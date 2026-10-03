import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AlmacenEvidencia, Bitacora } from '@ncr/domain-core';
import type { NotificadorPush } from '../aplicacion/puertos';

/**
 * Almacén de evidencia **provisional** con firma real.
 *
 * El bucket privado de Supabase Storage llega cuando haya credenciales; lo que
 * NO es provisional es la forma del enlace: HMAC sobre `clave.expiración`,
 * comparado en tiempo constante y con caducidad corta (RN-21, §2.7.8). Se
 * implementa así, y no devolviendo una ruta a secas, porque un adaptador que
 * entregara URLs sin firmar dejaría el resto del sistema escrito contra un
 * contrato que no exige firma — y al cambiar de adaptador nadie descubriría que
 * falta, que es exactamente cómo se pierde una medida de seguridad al migrar.
 */
export class AlmacenEvidenciaFirmado implements AlmacenEvidencia {
  private readonly contenidos = new Map<string, { bytes: Uint8Array; tipoMime: string }>();

  constructor(
    private readonly secreto: string,
    private readonly base = 'https://evidencia.local/objeto',
    private readonly ahora: () => number = () => Date.now(),
  ) {}

  async guardar(clave: string, contenido: Uint8Array, tipoMime: string): Promise<string> {
    this.contenidos.set(clave, { bytes: contenido, tipoMime });
    return clave;
  }

  /** F6 (15-L) · los bytes guardados, para copiar la foto a otra visita. */
  async leer(clave: string): Promise<Uint8Array | null> {
    return this.contenidos.get(clave)?.bytes ?? null;
  }

  async urlFirmada(clave: string, segundosDeVida: number): Promise<string> {
    const expira = Math.floor(this.ahora() / 1000) + segundosDeVida;
    const firma = this.firmar(clave, expira);
    return `${this.base}/${encodeURIComponent(clave)}?expira=${expira}&firma=${firma}`;
  }

  /** Verificación, para que la firma sea comprobable y no decorativa. */
  verificar(clave: string, expira: number, firma: string): boolean {
    if (expira < Math.floor(this.ahora() / 1000)) return false;
    const esperada = Buffer.from(this.firmar(clave, expira), 'hex');
    const recibida = Buffer.from(firma, 'hex');
    if (esperada.length !== recibida.length) return false;
    return timingSafeEqual(esperada, recibida);
  }

  private firmar(clave: string, expira: number): string {
    return createHmac('sha256', this.secreto).update(`${clave}.${expira}`).digest('hex');
  }
}

/**
 * Notificador push **provisional** de la ETAPA 06 (HU-34). 15-R · YA NO SE
 * CABLEA: devolvía 1 sin enviar nada. Lo sustituye Web Push (ADR-036,
 * `web-push/`); queda sólo como doble de las pruebas que lo usan.
 *
 * Deja constancia de cada aviso en la bitácora y lleva la cuenta.
 */
export class NotificadorPushRegistrado implements NotificadorPush {
  private readonly emitidos: { copropiedadId: string; viviendaId: string; titulo: string }[] = [];

  constructor(private readonly bitacora: Bitacora) {}

  async aVivienda(
    copropiedadId: string,
    viviendaId: string,
    titulo: string,
    cuerpo: string,
  ): Promise<number> {
    this.emitidos.push({ copropiedadId, viviendaId, titulo });
    // El cuerpo NO se registra: puede nombrar a una persona y a una vivienda, y
    // la bitácora se envía a un tercero (§2.7.8).
    this.bitacora.registrar('info', 'aviso al residente encolado (doble de pruebas)', {
      copropiedadId,
      viviendaId,
      titulo,
      longitudCuerpo: cuerpo.length,
    });
    return 1;
  }

  get pendientes(): readonly { copropiedadId: string; viviendaId: string; titulo: string }[] {
    return this.emitidos;
  }
}
