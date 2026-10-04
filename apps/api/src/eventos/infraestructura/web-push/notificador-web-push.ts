import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { DestinoDelAviso, NotificadorPush } from '../../aplicacion/puertos';
import { SOBRECARGA_DEL_CIFRADO, cifrarParaElNavegador } from './cifrado';
import type { FirmaVapid } from './vapid';
import type { SuscripcionWebPush, SuscripcionesWebPush } from './suscripciones-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL AVISO AL RESIDENTE, DE VERDAD · Web Push (RFC 8030 + 8291 + 8292), ADR-036
 *
 * Sustituye a `NotificadorPushRegistrado`, que contestaba «1» sin enviar nada.
 * Por cada aparato suscrito de la vivienda: cifra el aviso para ESE navegador,
 * firma la petición con VAPID y la entrega a su servicio de push. Devuelve a
 * cuántos ACEPTÓ el servicio (201/202) y deja en la bitácora enviados,
 * fallidos y retirados: el número que la consola muestra es el real.
 *
 *  · 404/410 → la suscripción ya no existe (el residente la quitó, el
 *    navegador la caducó): se RETIRA, con motivo, y no se vuelve a intentar.
 *  · Cualquier otro rechazo, un plazo vencido o una red caída → fallido.
 *  · Un endpoint fuera de la lista blanca no se toca (SSRF): fallido.
 *  · Sin redirecciones: un 3xx de un servicio de push es un fallo, no un
 *    destino nuevo al que seguir.
 *
 * El texto del aviso NO va a la bitácora: nombra personas y viviendas, y la
 * bitácora sale hacia un tercero (§2.7.8).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface OpcionesDelNotificador {
  readonly permitido: (endpoint: string) => boolean;
  readonly enviar: typeof fetch;
  readonly reloj: Reloj;
  readonly bitacora: Bitacora;
  /** Cuánto guarda el servicio un aviso para un aparato apagado. */
  readonly ttlSegundos: number;
  readonly plazoMs: number;
}

type Resultado = 'enviado' | 'fallido' | 'retirado';

const MAXIMO_DEL_CUERPO = 1000;
const RUTAS: Record<DestinoDelAviso, string> = {
  notificaciones: '/mi/notificaciones',
  historial: '/mi/historial',
};

/**
 * El aviso en JSON, dentro del único registro de 4096 bytes. Un cuerpo con
 * muchos caracteres multibyte puede no caber: se acorta a la mitad hasta que
 * cabe (cada vuelta lo reduce; a lo sumo ~10 vueltas desde 1000 caracteres).
 */
const contenidoDe = (titulo: string, cuerpo: string, ruta: string, cop: string): Buffer => {
  let largo = MAXIMO_DEL_CUERPO;
  for (;;) {
    const recortado = cuerpo.length > largo ? `${cuerpo.slice(0, largo)}…` : cuerpo;
    const json = Buffer.from(
      JSON.stringify({ titulo: titulo.slice(0, 120), cuerpo: recortado, ruta, copropiedadId: cop }),
    );
    if (json.length + SOBRECARGA_DEL_CIFRADO <= 4096 || largo === 0) return json;
    largo = Math.floor(largo / 2);
  }
};

export class NotificadorWebPush implements NotificadorPush {
  constructor(
    private readonly suscripciones: SuscripcionesWebPush,
    private readonly firma: FirmaVapid,
    private readonly o: OpcionesDelNotificador,
  ) {}

  async aVivienda(
    copropiedadId: string,
    viviendaId: string,
    titulo: string,
    cuerpo: string,
    destino: DestinoDelAviso = 'notificaciones',
  ): Promise<number> {
    const aparatos = await this.suscripciones.deVivienda(copropiedadId, viviendaId);
    const contenido = contenidoDe(titulo, cuerpo, RUTAS[destino], copropiedadId);
    const resultados = await Promise.all(
      aparatos.map((a) => this.entregar(copropiedadId, a, contenido)),
    );
    const cuenta = (r: Resultado): number => resultados.filter((x) => x === r).length;
    const enviados = cuenta('enviado');
    this.o.bitacora.registrar(
      aparatos.length > 0 && enviados === 0 ? 'aviso' : 'info',
      'aviso al residente por Web Push',
      {
        copropiedadId,
        viviendaId,
        titulo,
        suscritos: aparatos.length,
        enviados,
        fallidos: cuenta('fallido'),
        retirados: cuenta('retirado'),
      },
    );
    return enviados;
  }

  private async entregar(
    copropiedadId: string,
    aparato: SuscripcionWebPush,
    contenido: Buffer,
  ): Promise<Resultado> {
    if (!this.o.permitido(aparato.endpoint)) return 'fallido';
    try {
      const respuesta = await this.o.enviar(aparato.endpoint, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(this.o.plazoMs),
        headers: {
          Authorization: this.firma.cabecera(aparato.endpoint, this.o.reloj.ahora()),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(this.o.ttlSegundos),
          Urgency: 'high',
        },
        body: cifrarParaElNavegador(
          {
            p256dh: Buffer.from(aparato.p256dh, 'base64url'),
            auth: Buffer.from(aparato.auth, 'base64url'),
          },
          contenido,
        ),
      });
      if (respuesta.status === 404 || respuesta.status === 410) {
        await this.suscripciones.retirar(
          copropiedadId,
          aparato.id,
          `el servicio de push respondió ${String(respuesta.status)}`,
        );
        return 'retirado';
      }
      return respuesta.status === 201 || respuesta.status === 202 || respuesta.status === 200
        ? 'enviado'
        : 'fallido';
    } catch (error) {
      this.o.bitacora.registrar('aviso', 'un servicio de push no respondió', {
        suscripcionId: aparato.id,
        error: error instanceof Error ? error.name : 'desconocido',
      });
      return 'fallido';
    }
  }
}
