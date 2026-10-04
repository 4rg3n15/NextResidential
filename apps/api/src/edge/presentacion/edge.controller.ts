import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Bitacora } from '@ncr/domain-core';
import { BITACORA } from '@ncr/domain-core';
import { Publico, SinRecursoDeTenant } from '../../comun/decoradores';
import { REGISTRO_AUDITORIA } from '../../comun/auditoria/registro';
import type { RegistroDeAuditoria } from '../../comun/auditoria/registro';
import {
  ALERTAS_DE_EQUIPO,
  REGISTRO_DE_EVENTOS_DE_EQUIPO,
  ReconciliarDecisiones,
  RegistrarAcceso,
} from '../../eventos';
import type { AlertasDeEquipo, RegistroDeEventosDeEquipo } from '../../eventos';
import { LoteReconciliadoDto } from '../../autorizaciones';
import { constanciaDeAccionamiento } from '../aplicacion/accionamiento-del-edge';
import { alertarRechazosDelEdge } from '../aplicacion/alerta-de-rechazo';
import { PublicarInstantanea } from '../aplicacion/publicar-instantanea';
import type { InstantaneaParaElEdge } from '../aplicacion/instantanea';
import type { GatewayRegistrado } from '../aplicacion/puertos';
import { GuardiaDelEdge } from './guardia-del-edge';
import type { PeticionDelEdge } from './guardia-del-edge';
import {
  ConsultaDeInstantaneaDto,
  InstantaneaDeReglasDto,
  InstantaneaSinCambiosDto,
  LoteDelEdgeDto,
} from './dtos-edge';

/** Topes por IP de las rutas del Edge (§2.7.5): holgados para él, cortos para un intruso. */
const LIMITE_INSTANTANEA = 30;
const LIMITE_RECONCILIACION = 300;

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q · LAS RUTAS DEL EDGE GATEWAY · cierra S-24
 *
 *  · `GET  copropiedades/:id/reglas/instantanea?desde=N` — Q1.
 *  · `POST copropiedades/:id/edge/reconciliacion`        — Q4: la bandeja, con
 *    lo que el Edge hizo con cada equipo.
 *
 * `@Publico()` porque el emisor es un equipo; lo que sustituye a la sesión es
 * `GuardiaDelEdge`. `@SinRecursoDeTenant()`: el alcance lo decide la identidad
 * del Edge; la suite de aislamiento las prueba aparte (`edge-aislamiento`).
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('edge')
@Controller('copropiedades/:id')
@Publico()
@SinRecursoDeTenant()
@UseGuards(GuardiaDelEdge)
export class EdgeController {
  constructor(
    @Inject(PublicarInstantanea) private readonly instantaneas: PublicarInstantanea,
    @Inject(RegistrarAcceso) private readonly registrar: RegistrarAcceso,
    @Inject(REGISTRO_DE_EVENTOS_DE_EQUIPO) private readonly constancias: RegistroDeEventosDeEquipo,
    @Inject(REGISTRO_AUDITORIA) private readonly auditoria: RegistroDeAuditoria,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    @Inject(ALERTAS_DE_EQUIPO) private readonly alertas: AlertasDeEquipo,
  ) {}

  private static gatewayDe(peticion: PeticionDelEdge): GatewayRegistrado {
    if (peticion.edgeAcreditado === undefined)
      throw new UnauthorizedException('Edge no acreditado');
    return peticion.edgeAcreditado;
  }

  @Get('reglas/instantanea')
  @Throttle({ default: { limit: LIMITE_INSTANTANEA, ttl: 60_000 } })
  @ApiExtraModels(InstantaneaDeReglasDto, InstantaneaSinCambiosDto)
  @ApiOperation({
    summary: 'La instantánea de reglas de SU copropiedad, si hay una más nueva que `desde`',
    description:
      'Sólo para el Edge acreditado (firma con su credencial). Sin plantillas biométricas: ' +
      'sólo identificadores. RN-15, RN-16, CA-21, KPI-31.',
  })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(InstantaneaDeReglasDto) },
        { $ref: getSchemaPath(InstantaneaSinCambiosDto) },
      ],
    },
  })
  async instantanea(
    @Req() peticion: PeticionDelEdge,
    @Query() consulta: ConsultaDeInstantaneaDto,
  ): Promise<InstantaneaParaElEdge | InstantaneaSinCambiosDto> {
    const r = await this.instantaneas.ejecutar(
      EdgeController.gatewayDe(peticion),
      consulta.desde ?? 0,
    );
    if (r.tipo === 'adelantada') {
      throw new ConflictException(
        `El Edge dice tener la versión ${String(r.desde)} y la nube publicó hasta la ` +
          `${String(r.version)}: reinicie la caché del Edge (DESPLIEGUE_EDGE.md §4.4)`,
      );
    }
    if (r.tipo === 'sin_cambios') {
      return {
        copropiedadId: r.copropiedadId,
        version: r.version,
        sinCambios: true,
        generadaEn: r.generadaEn,
      };
    }
    return r.instantanea;
  }

  @Post('edge/reconciliacion')
  @HttpCode(202)
  @Throttle({ default: { limit: LIMITE_RECONCILIACION, ttl: 60_000 } })
  @ApiOkResponse({ type: LoteReconciliadoDto })
  @ApiOperation({
    summary: 'La bandeja del Edge tras un corte de WAN, con lo que hizo con cada equipo',
    description:
      'NO vuelve a decidir (RN-16, CA-21). Cada evento debe ser de la copropiedad del Edge; ' +
      'uno solo de otra rechaza el lote entero (RN-15). Duplicados: 202 (RN-17, CA-22).',
  })
  async reconciliar(
    @Req() peticion: PeticionDelEdge,
    @Body() dto: LoteDelEdgeDto,
  ): Promise<LoteReconciliadoDto> {
    const gateway = EdgeController.gatewayDe(peticion);
    const ajeno = dto.eventos.find((e) => e.copropiedadId !== gateway.copropiedadId);
    if (ajeno !== undefined) {
      await this.auditoria.registrarAccesoCruzado({
        usuarioId: gateway.usuarioServicioId,
        rol: 'edge',
        copropiedadSolicitada: ajeno.copropiedadId,
        recurso: 'edge/reconciliacion',
      });
      throw new NotFoundException('Recurso no encontrado');
    }

    const actor = gateway.usuarioServicioId;
    const resultados = await new ReconciliarDecisiones(this.registrar, actor).ejecutar(dto.eventos);

    for (const [i, resultado] of resultados.entries()) {
      const evento = dto.eventos[i];
      if (!resultado.aceptado || evento?.accionamiento === undefined) continue;
      const constancia = constanciaDeAccionamiento(
        { ...evento, accionamiento: evento.accionamiento },
        gateway,
        resultado.eventoId ?? null,
      );
      if (constancia !== null) await this.constancias.vivo(constancia);
    }

    this.bitacora.registrar('info', 'lote reconciliado desde el Edge acreditado', {
      edgeId: gateway.id,
      recibidos: dto.eventos.length,
      aceptados: resultados.filter((r) => r.aceptado).length,
      duplicados: resultados.filter((r) => r.duplicado).length,
      accionados: dto.eventos.filter((e) => e.accionamiento !== undefined).length,
      // E6 (15-R) · P-31 · un rechazo abre una alerta persistente, una por evento.
      alertados: await alertarRechazosDelEdge(this.alertas, dto.eventos, resultados, actor),
    });
    return {
      aceptado: true,
      resultados: resultados.map(({ eventoId: _eventoId, ...r }) => r),
    };
  }
}
