import { Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
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
  @HttpCode(202)
  @ApiExcludeEndpoint()
  async publicar(
    @Req() peticion: PeticionDeEquipo,
    @Param('secreto') _secreto: string,
  ): Promise<{ aceptado: true; ignorado?: true; motivo?: string }> {
    const equipo = peticion.equipoAcreditado;
    // El guard no deja pasar sin acreditar; si faltara, es un error de cableado
    // y no se sigue adelante adivinando a quién atribuir el evento.
    if (equipo === undefined) throw new BadRequestException('Equipo no acreditado');

    const ahora = this.reloj.ahora();
    const sobre = this.abrir(peticion);
    const evento = desdeAlarmServerXml(sobre.xml, equipo.dispositivoId, ahora);

    if (evento === null || evento.clase !== 'placa' || evento.placa === null) {
      // El equipo publica más cosas que lecturas de placa. Se responde 202 y no
      // 400 a propósito: un 400 haría que la cámara reintentara ese mismo aviso
      // indefinidamente, y lo que hay que decirle es «recibido, no me sirve».
      this.bitacora.registrar('info', 'publicación de equipo sin lectura de placa', {
        dispositivoId: equipo.dispositivoId,
        clase: evento?.clase ?? 'ilegible',
        partesNoClasificadas: sobre.partesNoClasificadas,
      });
      return { aceptado: true, ignorado: true, motivo: 'sin lectura de placa' };
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

    if (!constancia.ok) throw new BadRequestException(constancia.error.detalle);

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
    });

    return { aceptado: true };
  }

  private abrir(peticion: PeticionDeEquipo): ReturnType<typeof abrirSobreDeAlarmServer> {
    try {
      return abrirSobreDeAlarmServer(
        peticion.sobreCrudo ?? Buffer.alloc(0),
        peticion.headers['content-type'],
      );
    } catch (error) {
      // Un sobre ilegible es un equipo mal configurado o alguien probando. Se
      // dice qué pasó sin devolver nada del cuerpo recibido.
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Envío ilegible del equipo',
      );
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
