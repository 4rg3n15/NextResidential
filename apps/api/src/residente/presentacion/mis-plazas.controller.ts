import {
  Body,
  Controller,
  ForbiddenException,
  ConflictException,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { VerMisOcupantes } from '../aplicacion/ocupantes';
import type { MisOcupantes } from '../aplicacion/ocupantes';
import { PlazasDeMiVivienda } from '../aplicacion/plazas-del-titular';
import type { ResultadoDePlaza } from '../aplicacion/plazas-del-titular';
import { RetiroDeOcupanteDto } from './dtos-hogar';
import { MisOcupantesDto } from './respuestas-hogar';

const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (r.ok) return r.valor;
  if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
  throw new ForbiddenException(r.error.detalle);
};

const exigirHecho = (r: ResultadoDePlaza): void => {
  if (r.hecho) return;
  if (r.estado === 403) throw new ForbiddenException(r.explicacion);
  if (r.estado === 404) throw new NotFoundException(r.explicacion);
  throw new ConflictException(r.explicacion);
};

/**
 * Las plazas como quedaron. Función del módulo y no método del controlador: la
 * cobertura del segundo eje lee los métodos del controlador por reflexión, y un
 * método auxiliar se contaría como una ruta `GET` del residente que no existe.
 */
const vista = async (
  ver: VerMisOcupantes,
  ctx: ContextoTenant,
  copropiedadId: string,
): Promise<MisOcupantesDto> => {
  const o: MisOcupantes = desenvolver(await ver.ejecutar(ctx, copropiedadId));
  return { ...o, plazas: o.plazas.map((p) => ({ ...p })) };
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS PLAZAS DE MI VIVIENDA, POR SU TITULAR · RONDA 15-W (D-W10, D4 bis)
 *
 * Añadir hasta el tope y retirar las libres. Cualquier otro adulto de la
 * vivienda recibe 403; el `plazaId` de otra vivienda, 404 (el SQL filtra por la
 * vivienda del ámbito). 10 peticiones por minuto (§7). Cada respuesta trae las
 * plazas como quedaron, con sus códigos, para que la app no haga otro viaje.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residente')
@ApiBearerAuth()
@Roles('residente')
@Controller('copropiedades/:id/mi/ocupantes/plazas')
export class MisPlazasController {
  constructor(
    @Inject(PlazasDeMiVivienda) private readonly plazas: PlazasDeMiVivienda,
    @Inject(VerMisOcupantes) private readonly ver: VerMisOcupantes,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'El titular añade una plaza, hasta el tope de su vivienda (D-W10)' })
  @ApiOkResponse({ type: MisOcupantesDto })
  async anadir(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<MisOcupantesDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/ocupantes');
    exigirHecho(desenvolver(await this.plazas.anadir(destino, copropiedadId)));
    return vista(this.ver, destino, copropiedadId);
  }

  @Post(':plazaId/retiro')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'El titular retira una plaza LIBRE, con motivo; nunca la suya (D-W10)' })
  @ApiOkResponse({ type: MisOcupantesDto })
  async retirar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('plazaId', ParseUUIDPipe) plazaId: string,
    @Body() dto: RetiroDeOcupanteDto,
  ): Promise<MisOcupantesDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/ocupantes');
    exigirHecho(
      desenvolver(await this.plazas.retirar(destino, copropiedadId, plazaId, dto.motivo.trim())),
    );
    return vista(this.ver, destino, copropiedadId);
  }
}
