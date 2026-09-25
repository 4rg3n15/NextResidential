import { Controller, Header, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import { recibirPublicacionDeEquipo } from '@ncr/providers';
import type { FuenteDePlacas } from '@ncr/providers';
import { Publico, SinRecursoDeTenant } from '../../comun/decoradores';
import { MideKpi } from '../../observabilidad';
import { FUENTE_DE_PLACAS } from '../../proveedores';
import { INGESTOR_DE_EQUIPOS } from '../aplicacion/ingestor-de-publicaciones';
import type { IngestorDeEquipos } from '../aplicacion/ingestor-de-publicaciones';
import { GuardiaDeAlarmServer } from './guardia-alarm-server';
import type { PeticionDeEquipo } from '../../comun/sobre-de-equipo';

/**
 * EL EXTREMO QUE LA CÁMARA PUBLICA · el receptor del «servidor de alarma».
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ HACE AHORA, Y QUÉ DEJÓ DE HACER · 15-C
 *
 * Este controlador **acredita, abre y publica**. Nada más. Lo que antes hacía
 * aquí dentro —leer el XML, mirar si el evento era histórico, guardar la
 * evidencia, llamar al caso de uso, accionar el relé— vive ahora donde le
 * corresponde: el vocabulario del fabricante en `@ncr/providers`, y la
 * orquestación en el ingestor de la capa de aplicación.
 *
 * El motivo no es estética de capas. El puerto `PlateEventSource` estaba
 * declarado desde la ETAPA 05 y **este receptor lo esquivaba**, llamando al
 * caso de uso por su cuenta. Con eso, el puerto era un adorno que afirmaba un
 * desacople inexistente, y el transporte de armado —el flujo que mantenemos
 * abierto contra el equipo— no tenía por dónde entrar.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTE EXTREMO EXISTE Y NO SE USA `POST /ingesta/eventos`
 *
 * Aquel exige firma HMAC sobre el cuerpo con ventana de frescura (RNF-03.11) y
 * **la cámara no firma el cuerpo**: publica `multipart/form-data` sin prueba de
 * autoría. Meterla por la ruta firmada obligaría a debilitar la firma para
 * todos —incluido el Edge, que sí firma—.
 *
 * Lo que la guía integral añade, y queda dicho porque cambia el mapa: el equipo
 * **sí puede acreditarse** contra nuestro receptor con autenticación de tipo
 * resumen. No es firma del cuerpo y no da integridad ni anti repetición, pero
 * desmiente que la publicación tenga que llegar anónima. Está en H-15-1 con lo
 * que costaría usarla, y **el secreto de la ruta no se retira**: se sumarían.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA IDEMPOTENCIA AQUÍ LA IMPONE EL PROTOCOLO, NO NOSOTROS
 *
 * Texto de la guía: «si el integrador no responde, el dispositivo considerará
 * la notificación perdida y la subirá otra vez». **El equipo va a reenviar**, y
 * la única pregunta es si eso produce dos accesos o uno.
 *
 * 1 · **Se responde SIEMPRE `200 OK`**, incluso a un sobre ilegible. Un `400`
 *     no le dice al equipo «esto está mal»: le dice «no te he recibido».
 * 2 · **`Connection: close`**, que es lo que la guía pide.
 *
 * Y hay un tercer camino de reenvío que la guía integral destapa: el
 * **reabastecimiento**. Tras un corte de red el equipo guarda lo que no pudo
 * entregar y lo sube horas después, en lote. La clave de idempotencia (RN-17,
 * CA-22) tiene que cubrir también esa ventana larga, no sólo el reintento
 * inmediato.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA RESPUESTA AL EQUIPO · discrepancia del propio documento, anotada
 *
 * · El capítulo del servicio de escucha exige `Content-Length: 0` y recomienda
 *   `Connection: keep-alive`;
 * · los ejemplos del capítulo ANPR y del servicio de alarma muestran `200 OK`
 *   con `Connection: close` y sin exigir cuerpo;
 * · **se sigue al capítulo ANPR**, por ser el de la familia de equipo que esta
 *   cámara es;
 * · y si en sitio la cámara reenvía PESE a recibir `200`, la primera prueba es
 *   devolver cuerpo vacío con `Content-Length: 0`.
 *
 * Queda escrito aquí, al lado del código, porque quien esté delante del equipo
 * tiene que encontrarlo sin buscar en un informe.
 */
export const RESPUESTA_AL_EQUIPO = { aceptado: true } as const;

/** Alto a propósito: una cámara en hora punta publica muchas veces por minuto. */
const LIMITE_IP = 3000;

@Controller('alarm-server')
export class AlarmServerController {
  constructor(
    /** La fuente COMPARTIDA con el adaptador (A1): la construye `ProveedoresModule`. */
    @Inject(FUENTE_DE_PLACAS) private readonly fuente: FuenteDePlacas,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    @Inject(RELOJ) private readonly reloj: Reloj,
    /**
     * Se inyecta para que el ingestor exista antes de la primera publicación:
     * quien fija el ingestor en la fuente es su fábrica, y esta dependencia
     * es lo que garantiza que esa fábrica corrió antes de atender a nadie.
     * Aquí no se usa para nada más, y por eso no es un campo.
     */
    @Inject(INGESTOR_DE_EQUIPOS) _ingestor: IngestorDeEquipos,
  ) {}

  /**
   * `@ApiExcludeEndpoint` a propósito: el secreto viaja en la ruta y publicarla
   * en OpenAPI la pondría en la consola de cualquiera que abra `/docs`.
   */
  @Post(':secreto')
  @MideKpi('KPI-13')
  @Publico()
  @SinRecursoDeTenant()
  @UseGuards(GuardiaDeAlarmServer)
  @Throttle({ default: { limit: LIMITE_IP, ttl: 60_000 } })
  // 200 y no 202: la guía del fabricante exige el 200 para dar la
  // notificación por entregada. Con cualquier otra cosa, el equipo reenvía.
  @HttpCode(200)
  @Header('Connection', 'close')
  @ApiExcludeEndpoint()
  async publicar(
    @Req() peticion: PeticionDeEquipo,
    @Param('secreto') _secreto: string,
  ): Promise<{ aceptado: true; ignorado?: true; motivo?: string }> {
    const equipo = peticion.equipoAcreditado;
    // El guard no deja pasar sin acreditar; si faltara, es un error de cableado
    // y no se sigue adelante adivinando a quién atribuir el evento.
    if (equipo === undefined) {
      this.bitacora.registrar('error', 'publicación sin equipo acreditado: error de cableado', {});
      return RESPUESTA_AL_EQUIPO;
    }

    const recepcion = recibirPublicacionDeEquipo(
      peticion.sobreCrudo ?? Buffer.alloc(0),
      peticion.headers['content-type'],
      equipo.dispositivoId,
      this.reloj.ahora(),
    );

    /**
     * H-16-1 · un rostro en el sobre es un INCIDENTE, no una curiosidad.
     *
     * Significa que hay un equipo de la red configurado para enviar datos
     * biométricos por un canal que no pasa por el ciclo de consentimiento. El
     * analizador ya los descartó; aquí se alerta, porque el analizador no puede
     * saber a quién avisar.
     *
     * **Sigue vigente aunque la 15-C minimice en el origen.** Configurar el
     * equipo para que no los envíe es lo correcto; esta alerta es la red de
     * seguridad para cuando alguien lo cambie en el aparato.
     */
    if (recepcion.partesBiometricasRechazadas > 0) {
      this.bitacora.registrar('error', 'H-16-1 · el equipo envió recortes de ROSTRO', {
        copropiedadId: equipo.copropiedadId,
        dispositivoId: equipo.dispositivoId,
        rechazadas: recepcion.partesBiometricasRechazadas,
        motivo:
          'datos biométricos sin consentimiento del titular (RN-09, RN-10, Ley 1581). ' +
          'Se descartaron. Desactive el envío de rostro en la configuración del equipo',
      });
    }

    // A2/A4 · placa, rostro y llamada siguen adelante; lo demás se registra.
    const sigueAdelante =
      recepcion.desenlace === 'lectura' ||
      recepcion.desenlace === 'rostro' ||
      recepcion.desenlace === 'llamada';
    if (!sigueAdelante || recepcion.publicacion === null) {
      this.bitacora.registrar(
        recepcion.desenlace === 'ilegible' ? 'aviso' : 'info',
        `publicación de equipo ignorada: ${recepcion.motivo}`,
        {
          dispositivoId: equipo.dispositivoId,
          desenlace: recepcion.desenlace,
          partesNoClasificadas: recepcion.partesNoClasificadas,
        },
      );
      return { ...RESPUESTA_AL_EQUIPO, ignorado: true, motivo: recepcion.motivo };
    }

    let publicada;
    try {
      publicada = await this.fuente.publicar(recepcion.publicacion);
    } catch (error) {
      // Tampoco aquí se devuelve un error al equipo: reenviaría en bucle un
      // sobre que va a fallar igual. Se registra y se corta.
      this.bitacora.registrar('error', 'la publicación no se pudo procesar', {
        dispositivoId: equipo.dispositivoId,
        detalle: error instanceof Error ? error.message : String(error),
      });
      return { ...RESPUESTA_AL_EQUIPO, ignorado: true, motivo: 'no se pudo procesar' };
    }

    if (publicada.desenlace !== 'ingerida') {
      return {
        ...RESPUESTA_AL_EQUIPO,
        ignorado: true,
        motivo: publicada.motivo ?? publicada.desenlace,
      };
    }

    return RESPUESTA_AL_EQUIPO;
  }
}
