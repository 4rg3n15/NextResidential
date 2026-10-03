import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import type { Request, Response } from 'express';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { Publico, Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { ErrorApiDto } from '../../comun/respuestas';
import { BilletesDeUnSoloUso } from '../../comun/billetes-de-un-solo-uso';
import type { DatosLigados } from '../../comun/billetes-de-un-solo-uso';
import { CanalEnProceso } from '../infraestructura/canal-en-proceso';
import { abrirFlujoSse } from './escritor-sse';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · D1 · EL FLUJO EN VIVO, DIRECTO DEL NAVEGADOR A LA API (P-20)
 *
 * Con la consola en Netlify, el SSE no puede quedarse colgado de una función
 * del proxy (tienen tiempo máximo): el navegador lo abre CONTRA LA API. Dos
 * rutas:
 *
 *  · `POST copropiedades/:id/eventos/billete` — una ruta corriente: pasa por
 *    sesión, rol, guardia remota, alcance de la copropiedad y limitador, y
 *    entra sola en el barrido de aislamiento. Emite un billete de UN uso, 15 s,
 *    ligado a usuario, rol, copropiedad, IP y propósito (`eventos`).
 *  · `GET flujo-directo/eventos?billete=` — pública: canjea el billete y abre
 *    el MISMO flujo que `…/eventos/flujo`. Dura como mucho la vida de un token
 *    (5 min): sin token que caduque a mitad, el límite lo pone esto, y la
 *    consola reabre con otro billete, que exige sesión vigente.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const PROPOSITO_DEL_FLUJO = 'eventos';
export const VIGENCIA_DEL_BILLETE_DEL_FLUJO_S = 15;
export const VIDA_DEL_FLUJO_DIRECTO_MS = 5 * 60_000;

export interface DatosDelFlujo extends DatosLigados {
  readonly copropiedadId: string;
  readonly usuarioId: string;
  readonly rol: ContextoTenant['rol'];
}

export const BILLETES_DEL_FLUJO = Symbol.for('ncr.billetes.flujo-de-eventos');

export const PROVEEDOR_DE_BILLETES_DEL_FLUJO: Provider = {
  provide: BILLETES_DEL_FLUJO,
  useFactory: () =>
    new BilletesDeUnSoloUso<DatosDelFlujo>(PROPOSITO_DEL_FLUJO, VIGENCIA_DEL_BILLETE_DEL_FLUJO_S),
};

export class BilleteDelFlujoDto {
  @ApiProperty({ description: 'Billete de un solo uso; va en `?billete=` del flujo directo.' })
  readonly billete!: string;

  @ApiProperty({ format: 'date-time', description: 'Caduca a los 15 s si no se usa.' })
  readonly caducaEn!: string;

  @ApiProperty({ example: '/flujo-directo/eventos', description: 'Ruta en el origen de la API.' })
  readonly ruta!: string;
}

/** Sin billete es 401 (no autenticado), no 400: la ruta se comporta como cualquier protegida. */
export class CanjeDelFlujoDto {
  @ApiProperty({ required: false, description: 'El billete emitido por `…/eventos/billete`.' })
  @IsOptional()
  @IsString()
  @Length(20, 120)
  @Matches(/^[a-z-]+\.[A-Za-z0-9_-]+$/)
  readonly billete?: string;
}

@ApiTags('eventos')
@Controller()
export class FlujoDirectoController {
  constructor(
    @Inject(BILLETES_DEL_FLUJO) private readonly billetes: BilletesDeUnSoloUso<DatosDelFlujo>,
    @Inject(CanalEnProceso) private readonly canal: CanalEnProceso,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
  ) {}

  @Post('copropiedades/:id/eventos/billete')
  @HttpCode(201)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Roles('administrador', 'superadministrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'Billete de un solo uso para abrir el flujo en vivo directo (P-20)' })
  @ApiCreatedResponse({ type: BilleteDelFlujoDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async billete(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Req() peticion: Request,
  ): Promise<BilleteDelFlujoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'eventos/billete');
    const ip = typeof peticion.ip === 'string' && peticion.ip !== '' ? peticion.ip : null;
    const emitido = this.billetes.emitir({
      copropiedadId,
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      ip,
    });
    return {
      billete: emitido.billete,
      caducaEn: emitido.caducaEn.toISOString(),
      ruta: '/flujo-directo/eventos',
    };
  }

  @Get('flujo-directo/eventos')
  @Publico()
  @ApiOperation({ summary: 'Flujo en vivo (SSE) abierto con un billete, sin sesión (P-20)' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'El mismo flujo que `…/eventos/flujo`; se cierra a los 5 min.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiUnauthorizedResponse({ type: ErrorApiDto, description: 'Billete inválido o ya usado' })
  flujo(
    @Query() canje: CanjeDelFlujoDto,
    @Req() peticion: Request,
    @Res() respuesta: Response,
  ): void {
    const ip = typeof peticion.ip === 'string' && peticion.ip !== '' ? peticion.ip : null;
    const datos = this.billetes.consumir(canje.billete ?? '', ip);
    if (datos === null) {
      this.bitacora.registrar(
        'aviso',
        'flujo directo rechazado: billete inválido, gastado, caducado o de otra IP',
        {},
      );
      throw new UnauthorizedException('Billete inválido, gastado, caducado o de otra IP');
    }
    abrirFlujoSse(respuesta, this.canal, datos.copropiedadId, VIDA_DEL_FLUJO_DIRECTO_MS);
  }
}
