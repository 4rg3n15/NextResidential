import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import { Publico, SinRecursoDeTenant } from '../../comun/decoradores';
import { RegistrarAcceso } from '../../eventos/aplicacion/registrar-acceso';
import { REPOSITORIO_DISPOSITIVOS } from '../../eventos/aplicacion/puertos';
import type { RepositorioDispositivos } from '../../eventos/aplicacion/puertos';
import { GuardiaDeFirmaDeIngesta } from './guardia-firma';
import { EventoIngestaDto } from './dtos';
import { LatidoDto } from '../../eventos/presentacion/dtos';

/**
 * Identidad con la que se atribuyen los eventos de hardware.
 *
 * Un evento tiene `creado_por NOT NULL`: alguien lo registró. Cuando el emisor
 * es una cámara no hay usuario, y poner el del último administrador que tocó el
 * sistema sería falsear la auditoría. Se usa una identidad de servicio fija y
 * declarada, que es lo que la ETAPA 15 sustituirá por la del dispositivo
 * registrado en `dispositivos`.
 */
export const ACTOR_INGESTA = '00000000-0000-4000-8000-000000000002';

/**
 * Tope por IP de las rutas de ingesta. Es una CONSTANTE y no la variable de
 * entorno porque los decoradores se evalúan al cargar la clase, antes de que
 * exista la configuración. El valor de entorno
 * (`THROTTLE_INGESTA_IP_LIMITE`) gobierna el limitador con nombre; este es el
 * techo de la red por IP, deliberadamente alto: la protección fina es la del
 * dispositivo firmante.
 */
const LIMITE_IP_INGESTA = 3000;

/**
 * Ingesta de eventos de hardware — el extremo del **Alarm Server**.
 *
 * `@Publico()` porque el emisor es un equipo y no una persona: no hay sesión
 * que presentar. Lo que sustituye a la sesión es la firma del guard, y por eso
 * la exención y el guard van juntos en la misma clase: leer una sin la otra
 * daría una impresión falsa.
 *
 * **Cierra D-27.** Hasta la ETAPA 05 este endpoint acreditaba la firma y
 * devolvía la clave de idempotencia sin decidir ni persistir. Ahora el hecho
 * recorre el camino entero: clave, decisión, evento inmutable, alerta,
 * escalamiento y aviso. Responde 202 en los dos casos —aceptado y duplicado—
 * porque para el emisor la respuesta correcta a «esto ya lo tenía» es la misma
 * que a «lo acabo de guardar»: deja de reintentar (CA-22).
 */
@ApiTags('ingesta')
@Controller('ingesta')
export class IngestaController {
  constructor(
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    @Inject(RegistrarAcceso) private readonly registrar: RegistrarAcceso,
    @Inject(REPOSITORIO_DISPOSITIVOS) private readonly dispositivos: RepositorioDispositivos,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  @Post('eventos')
  @Publico()
  @SinRecursoDeTenant()
  @UseGuards(GuardiaDeFirmaDeIngesta)
  // El tope por EQUIPO lo aplica el limitador `dispositivo`, configurado en
  // `app.module.ts`. Aquí solo se eleva el tope por IP: todas las cámaras de
  // una copropiedad salen por el mismo enrutador, y el global de 120/min las
  // sumaría a todas (D-28).
  @Throttle({ default: { limit: LIMITE_IP_INGESTA, ttl: 60_000 } })
  @HttpCode(202)
  @ApiOperation({
    summary: 'Recibe un evento firmado del Alarm Server, lo decide y lo registra',
    description:
      'Exige firma HMAC vigente. Registra el evento en el histórico inmutable, ' +
      'clasifica y escala la alerta si procede, y deduplica por clave de ' +
      'idempotencia (RN-02, RN-03, RN-17, CA-22).',
  })
  async recibir(@Body() dto: EventoIngestaDto): Promise<{
    aceptado: true;
    eventoId: string;
    claveIdempotencia: string;
    duplicado: boolean;
    permitido: boolean;
    alertaId: string | null;
  }> {
    const constancia = await this.registrar.ejecutar(
      {
        copropiedadId: dto.copropiedadId,
        dispositivoId: dto.dispositivoId,
        metodo: dto.metodo,
        referenciaExterna: dto.referenciaExterna,
        // El DTO trae centésimas enteras para no discutir con los decimales de
        // JSON; el dominio razona en fracción.
        confianza: dto.confianzaCentesimas / 100,
        personaId: dto.personaId ?? null,
        placaLeida: dto.placaLeida ?? null,
        zonaId: dto.zonaId ?? null,
      },
      ACTOR_INGESTA,
    );

    if (!constancia.ok) {
      // Un identificador con caracteres inesperados es un equipo mal
      // configurado o alguien probando. Nunca se «arregla» aquí.
      throw new BadRequestException(constancia.error.detalle);
    }

    this.bitacora.registrar('info', 'evento de hardware procesado', {
      copropiedadId: dto.copropiedadId,
      dispositivoId: dto.dispositivoId,
      duplicado: constancia.valor.duplicado,
      permitido: constancia.valor.permitido,
    });

    return { aceptado: true, ...constancia.valor };
  }

  /**
   * Latido del dispositivo (CA-26, RN-12, P-06). Va por el canal firmado y no
   * por una sesión: quien late es el equipo. Su límite es más alto que el de
   * eventos porque la cadencia normal es de un latido por minuto y equipo, y
   * porque perder latidos produce exactamente la alerta que se quiere evitar.
   */
  @Post('latidos')
  @Publico()
  @SinRecursoDeTenant()
  @UseGuards(GuardiaDeFirmaDeIngesta)
  @Throttle({ default: { limit: LIMITE_IP_INGESTA, ttl: 60_000 } })
  @HttpCode(202)
  @ApiOperation({ summary: 'Registra el latido de un dispositivo (CA-26)' })
  async latido(@Body() dto: LatidoDto): Promise<{ recibido: true }> {
    await this.dispositivos.registrarLatido(
      dto.copropiedadId,
      dto.dispositivoId,
      this.reloj.ahora(),
    );
    return { recibido: true };
  }
}
