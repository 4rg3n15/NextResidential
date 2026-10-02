import {
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { ContextoTenant } from '../../autenticacion';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import { derivarCredencial } from '../aplicacion/credencial-del-edge';
import { REPOSITORIO_DE_GATEWAYS } from '../aplicacion/puertos';
import type { GatewayRegistrado, RepositorioDeGateways } from '../aplicacion/puertos';
import { AltaDeEdgeDto, CredencialDelEdgeDto } from './dtos-edge';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q · Q5 · ALTA DE UN EDGE Y ROTACIÓN DE SU CREDENCIAL
 *
 * Sólo el superadministrador (`edge_insercion`, 0014), y con su segundo factor
 * como toda escritura de plataforma (RN-20). La respuesta trae la credencial
 * UNA vez, para el `EDGE_INGESTA_SECRETO` del gateway: la API no la guarda —la
 * recalcula de la maestra y la referencia— y no hay ruta que la vuelva a dar.
 * Perderla es rotarla.
 *
 * Rotar invalida la anterior EN EL ACTO: el Edge deja de poder descargar y
 * reconciliar hasta que se le ponga la nueva. Mientras tanto sigue decidiendo
 * con su caché y su bandeja retiene lo que ocurra: no se pierde ningún acceso,
 * sólo se retrasa su llegada a la nube (DESPLIEGUE_EDGE.md §4).
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('edge')
@ApiBearerAuth()
@Controller('copropiedades/:id/edge-gateways')
export class GatewaysController {
  constructor(
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(REPOSITORIO_DE_GATEWAYS) private readonly gateways: RepositorioDeGateways,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  private credencial(gateway: GatewayRegistrado): CredencialDelEdgeDto {
    return {
      edgeId: gateway.id,
      copropiedadId: gateway.copropiedadId,
      nombre: gateway.nombre,
      credencialRef: gateway.credencialRef,
      secreto: derivarCredencial(this.config.INGESTA_FIRMA_SECRETO, {
        copropiedadId: gateway.copropiedadId,
        edgeId: gateway.id,
        credencialRef: gateway.credencialRef,
      }),
    };
  }

  @Post()
  @HttpCode(201)
  @Roles('superadministrador')
  @ApiOperation({ summary: 'Da de alta un Edge Gateway y entrega su credencial (una vez)' })
  @ApiOkResponse({ type: CredencialDelEdgeDto })
  @ApiForbiddenResponse()
  async registrar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: AltaDeEdgeDto,
  ): Promise<CredencialDelEdgeDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'edge-gateways');
    return this.credencial(await this.gateways.registrar(ctx, copropiedadId, dto.nombre.trim()));
  }

  @Post(':edgeId/credencial')
  @HttpCode(200)
  @Roles('superadministrador')
  @ApiOperation({ summary: 'Rota la credencial del Edge: la anterior deja de valer ya' })
  @ApiOkResponse({ type: CredencialDelEdgeDto })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async rotar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('edgeId', ParseUUIDPipe) edgeId: string,
  ): Promise<CredencialDelEdgeDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'edge-gateways');
    const rotado = await this.gateways.rotar(ctx, copropiedadId, edgeId);
    if (rotado === null) throw new NotFoundException('No hay un Edge activo con ese identificador');
    return this.credencial(rotado);
  }
}
