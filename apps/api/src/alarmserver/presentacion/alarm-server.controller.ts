import { Controller, Header, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { AlmacenEvidencia, Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { ALMACEN_EVIDENCIA, BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import { abrirSobreDeAlarmServer, desdeAlarmServerXml } from '@ncr/providers';
import { Publico, SinRecursoDeTenant } from '../../comun/decoradores';
import { RegistrarAcceso } from '../../eventos';
import type { AccionadorDePuerta } from '../../guardia';
import { MideKpi } from '../../observabilidad';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { GuardiaDeAlarmServer } from './guardia-alarm-server';
import type { PeticionDeEquipo } from '../../comun/sobre-de-equipo';

/**
 * EL EXTREMO QUE LA CÁMARA PUBLICA · el receptor del «servidor de alarma».
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTE EXTREMO EXISTE Y NO SE USA `POST /ingesta/eventos`
 *
 * Aquel exige firma HMAC sobre el cuerpo con ventana de frescura (RNF-03.11) y
 * **la cámara no firma**: publica `multipart/form-data` sin prueba de autoría, y
 * ningún ajuste del equipo lo cambia. Meterla por la ruta firmada obligaría a
 * debilitar la firma para todos —incluido el Edge, que sí firma—. Se separan
 * los dos extremos y se deja escrito, en `comun/equipos-de-alarm-server.ts` (H-15-1), que
 * la acreditación de éste es más débil y qué falta para endurecerla.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * AQUÍ NO SE DECIDE NADA: ESA ES LA PRUEBA DEL PRINCIPIO RECTOR
 *
 * Este controlador traduce un sobre del fabricante a un hecho del dominio y se
 * lo entrega a `RegistrarAcceso`, **el mismo caso de uso que ya usan la ingesta
 * firmada y el Edge**. La cámara reporta; el motor de reglas decide; y sólo
 * después, si la decisión fue permitir, este controlador acciona el relé por el
 * puerto `AccionadorDePuerta`. Duplicar aquí la decisión —o dejar que la cámara
 * abriera por su lista local— vaciaría el motor de reglas y la trazabilidad.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ORDEN, Y LO QUE CUESTA CADA PASO
 *
 * 1 · abrir el sobre y normalizar — en memoria, sin red;
 * 2 · guardar la evidencia, **acotada por tiempo** (abajo);
 * 3 · decidir y registrar el evento inmutable — RN-02: no hay rama que abra sin
 *     dejar evento;
 * 4 · accionar, sólo si el evento quedó permitido y no era un duplicado.
 *
 * El paso 2 va ANTES del 3 porque `eventos` es append-only (ADR-05): un evento
 * escrito sin su evidencia no se puede corregir después. Y va **acotado** porque
 * está dentro del tramo que mide KPI-13: si el almacén tarda, se sigue sin
 * evidencia y se registra que se siguió. Perder la foto es malo; dejar la
 * talanquera cerrada porque el almacén de objetos va lento, peor.
 */

/**
 * El accionador que usa ESTE receptor. Es un alias del de `guardia`, resuelto
 * en `alarmserver.module.ts`: el token propio evita que la fábrica se busque a
 * sí misma. Lo que hay detrás es la instancia ÚNICA de la consola de portería.
 */
export const ACCIONADOR_DEL_RECEPTOR = Symbol.for('ncr.alarmserver.Accionador');

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA IDEMPOTENCIA AQUÍ LA IMPONE EL PROTOCOLO, NO NOSOTROS
 *
 * Texto de la guía del fabricante: «si el integrador no responde, el
 * dispositivo considerará la notificación perdida y la subirá otra vez». No es
 * una decisión de diseño que podamos revisar: **el equipo va a reenviar**, y la
 * única pregunta es si eso produce dos accesos o uno.
 *
 * De ahí las dos consecuencias que gobiernan este controlador:
 *
 * 1 · **Se responde SIEMPRE `200 OK`**, incluso a un sobre ilegible. Un `400`
 *     no le dice al equipo «esto está mal»: le dice «no te he recibido», y lo
 *     reenvía en bucle. El receptor devolvía `400` ante un sobre roto y eso
 *     habría producido una cámara martilleando indefinidamente con el mismo
 *     envío malo. Lo que se rechaza se rechaza en el registro, no en el código
 *     de estado.
 * 2 · **`Connection: close`**, que es lo que la guía pide: el equipo abre una
 *     conexión por notificación y no reutiliza la anterior.
 *
 * La clave de idempotencia ya existía desde la ETAPA 06 (RN-17); lo que cambia
 * es que aquí **no es una precaución nuestra sino un requisito del emisor**, y
 * por eso está escrito junto al código y no sólo en un informe.
 */
export const RESPUESTA_AL_EQUIPO = { aceptado: true } as const;

/** Techo del tramo de evidencia dentro del presupuesto de KPI-13 (3 s). */
export const PRESUPUESTO_DE_EVIDENCIA_MS = 800;

/** Alto a propósito: una cámara en hora punta publica muchas veces por minuto. */
const LIMITE_IP = 3000;

@Controller('alarm-server')
export class AlarmServerController {
  constructor(
    @Inject(RegistrarAcceso) private readonly registrar: RegistrarAcceso,
    @Inject(ACCIONADOR_DEL_RECEPTOR) private readonly accionador: AccionadorDePuerta,
    @Inject(ALMACEN_EVIDENCIA) private readonly evidencia: AlmacenEvidencia,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(GENERADOR_DE_ID) private readonly ids: GeneradorDeId,
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

    const ahora = this.reloj.ahora();
    const sobre = this.abrir(peticion, equipo.dispositivoId);
    if (sobre === null) return { ...RESPUESTA_AL_EQUIPO, ignorado: true, motivo: 'sobre ilegible' };

    /**
     * H-16-1 · un rostro en el sobre es un INCIDENTE, no una curiosidad.
     *
     * Significa que hay un equipo de la red configurado para enviar datos
     * biométricos por un canal que no pasa por el ciclo de consentimiento. El
     * analizador ya los descartó; aquí se alerta, porque el analizador no puede
     * saber a quién avisar.
     */
    if (sobre.partesBiometricasRechazadas > 0) {
      this.bitacora.registrar('error', 'H-16-1 · el equipo envió recortes de ROSTRO', {
        copropiedadId: equipo.copropiedadId,
        dispositivoId: equipo.dispositivoId,
        rechazadas: sobre.partesBiometricasRechazadas,
        motivo:
          'datos biométricos sin consentimiento del titular (RN-09, RN-10, Ley 1581). ' +
          'Se descartaron. Desactive el envío de rostro en la configuración del equipo',
      });
    }

    const evento = desdeAlarmServerXml(sobre.xml, equipo.dispositivoId, ahora);

    /**
     * El equipo reenvía su HISTORIAL por este mismo canal (`alarmDataType: 1`).
     * Sin este corte, la portería mostraría accesos de hace días como si
     * ocurrieran ahora, en una tabla append-only que no se puede limpiar.
     */
    if (evento !== null && !evento.enVivo) {
      this.bitacora.registrar('info', 'publicación HISTÓRICA descartada', {
        dispositivoId: equipo.dispositivoId,
        placa: evento.placa,
      });
      return { ...RESPUESTA_AL_EQUIPO, ignorado: true, motivo: 'el equipo lo marcó histórico' };
    }

    if (evento === null || evento.clase !== 'placa' || evento.placa === null) {
      // El equipo publica más cosas que lecturas de placa. Se responde 202 y no
      // 400 a propósito: un 400 haría que la cámara reintentara ese mismo aviso
      // indefinidamente, y lo que hay que decirle es «recibido, no me sirve».
      this.bitacora.registrar('info', 'publicación de equipo sin lectura de placa', {
        dispositivoId: equipo.dispositivoId,
        clase: evento?.clase ?? 'ilegible',
        partesNoClasificadas: sobre.partesNoClasificadas,
      });
      return { ...RESPUESTA_AL_EQUIPO, ignorado: true, motivo: 'sin lectura de placa' };
    }

    const referencia =
      evento.referenciaDelEquipo ?? `${evento.placa}-${String(+evento.ocurridoEn)}`;
    const evidenciaId = await this.guardarEvidencia(
      sobre.foto ?? sobre.recorte,
      equipo.dispositivoId,
    );

    const constancia = await this.registrar.ejecutar(
      {
        copropiedadId: equipo.copropiedadId,
        dispositivoId: equipo.dispositivoId,
        metodo: 'placa',
        referenciaExterna: referencia,
        // Sin confianza declarada se entrega 0 y **no** 1: el umbral de lectura
        // dudosa (CU-01, excepción 3a) tiene que poder actuar, y suponer certeza
        // donde el equipo no la afirma es decidir por él.
        confianza: evento.confianza ?? 0,
        placaLeida: evento.placa,
        evidenciaId,
        ocurridoEn: evento.ocurridoEn,
      },
      ACTOR_INGESTA,
    );

    if (!constancia.ok) {
      // Tampoco aquí se devuelve un error al equipo: reenviaría en bucle un
      // sobre que va a fallar igual. Se registra y se corta.
      this.bitacora.registrar('error', 'el hecho de la cámara no se pudo registrar', {
        dispositivoId: equipo.dispositivoId,
        detalle: constancia.error.detalle,
      });
      return { ...RESPUESTA_AL_EQUIPO, ignorado: true, motivo: 'el hecho no se pudo registrar' };
    }

    if (constancia.valor.permitido && !constancia.valor.duplicado) {
      const orden = await this.accionador.accionar(equipo.dispositivoId, true);
      this.bitacora.registrar(orden.estado === 'aceptada' ? 'info' : 'aviso', 'relé accionado', {
        dispositivoId: equipo.dispositivoId,
        eventoId: constancia.valor.eventoId,
        estado: orden.estado,
        latenciaDelEquipoMs: orden.latenciaMs,
      });
    }

    this.bitacora.registrar('info', 'lectura de placa procesada', {
      copropiedadId: equipo.copropiedadId,
      dispositivoId: equipo.dispositivoId,
      permitido: constancia.valor.permitido,
      duplicado: constancia.valor.duplicado,
      conEvidencia: evidenciaId !== null,
      /**
       * QUIÉN ABRIÓ, según el propio equipo. Es evidencia de auditoría: un
       * `lista` o un `anomalo` significan que la cámara está decidiendo por su
       * cuenta y que esta decisión nuestra llegó tarde. Se registra siempre,
       * incluso cuando es `null` —que es lo normal y significa que el control
       * de barrera del equipo está deshabilitado—.
       */
      quienAbrioSegunElEquipo: evento.quienAbrio,
      tipoDePlaca: evento.tipoDePlaca,
      pais: evento.pais,
      carril: evento.carril,
    });

    if (evento.quienAbrio === 'lista' || evento.quienAbrio === 'anomalo') {
      this.bitacora.registrar('aviso', 'EL EQUIPO ABRIÓ POR SU CUENTA', {
        dispositivoId: equipo.dispositivoId,
        quienAbrio: evento.quienAbrio,
        motivo:
          'la cámara declaró haber abierto ella. El motor de reglas decidió después, ' +
          'y su decisión no gobernó el paso. Revise `ctrlMod` del equipo (debe ser 1)',
      });
    }

    return RESPUESTA_AL_EQUIPO;
  }

  /**
   * `null` cuando el sobre no se puede abrir. **No lanza**, y ése es el cambio
   * que impone el protocolo: devolver un `400` haría que el equipo diera la
   * notificación por perdida y la reenviara en bucle, con el mismo resultado.
   * El rechazo va al registro, que es donde alguien puede verlo.
   */
  private abrir(
    peticion: PeticionDeEquipo,
    dispositivoId: string,
  ): ReturnType<typeof abrirSobreDeAlarmServer> | null {
    try {
      return abrirSobreDeAlarmServer(
        peticion.sobreCrudo ?? Buffer.alloc(0),
        peticion.headers['content-type'],
      );
    } catch (error) {
      // Nada del cuerpo recibido sale al registro: sólo por qué no se pudo abrir.
      this.bitacora.registrar('aviso', 'sobre ilegible del equipo', {
        dispositivoId,
        detalle: error instanceof Error ? error.message : 'envío ilegible',
      });
      return null;
    }
  }

  /**
   * Devuelve `null` si no hay imagen o si el almacén no respondió a tiempo.
   * Nunca lanza: el evento pesa más que su fotografía.
   */
  private async guardarEvidencia(
    imagen: Buffer | null,
    dispositivoId: string,
  ): Promise<string | null> {
    if (imagen === null || imagen.length === 0) return null;
    const clave = `lpr/${dispositivoId}/${this.ids.nuevo()}.jpg`;
    try {
      const guardada = await Promise.race([
        this.evidencia.guardar(clave, imagen, 'image/jpeg'),
        new Promise<null>((resolver) =>
          setTimeout(() => resolver(null), PRESUPUESTO_DE_EVIDENCIA_MS),
        ),
      ]);
      if (guardada === null) {
        this.bitacora.registrar('aviso', 'evidencia descartada por presupuesto de tiempo', {
          dispositivoId,
          presupuestoMs: PRESUPUESTO_DE_EVIDENCIA_MS,
        });
        return null;
      }
      return guardada;
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo guardar la evidencia de la lectura', {
        dispositivoId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
