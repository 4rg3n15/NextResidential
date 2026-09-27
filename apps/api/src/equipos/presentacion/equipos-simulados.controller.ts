import { Controller, Get, Inject, Injectable, Param, ParseUUIDPipe } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import { REPOSITORIO_DE_EQUIPOS } from '../aplicacion/puertos';
import type { RepositorioDeEquipos } from '../aplicacion/puertos';
import { CLASES_DE_PROVEEDOR } from '@ncr/providers';
import { estadoDeEquiposSimulados } from '../aplicacion/equipos-simulados';

/** Las clases que hablan con equipos de verdad: todas menos el simulado. */
const CLASES_REALES = CLASES_DE_PROVEEDOR.filter((c) => c !== 'simulado').join(' o ');

export class EstadoDeEquiposSimuladosDto {
  @ApiProperty({ type: Boolean, description: 'Si la API opera con el proveedor simulado' })
  simulado!: boolean;
  @ApiProperty({ type: Number, description: 'Equipos activos dados de alta en ESTA copropiedad' })
  equiposRegistrados!: number;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'La franja de la consola, sólo si hay equipos reales que no recibirán órdenes',
  })
  aviso!: string | null;
}

/**
 * F3 (corrección de la 15-L) · ¿llegan las órdenes a un equipo real? Lo lee la
 * consola para su franja fija. Acotado a la copropiedad de la ruta: cuántos
 * equipos tiene OTRA copropiedad no es asunto de nadie aquí (RN-15).
 */
@ApiTags('equipos')
@ApiBearerAuth()
@Controller('copropiedades/:id/equipos-simulados')
export class EquiposSimuladosController {
  constructor(
    @Inject(REPOSITORIO_DE_EQUIPOS) private readonly repo: RepositorioDeEquipos,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @Roles('superadministrador', 'administrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'Si las órdenes de la consola llegan a equipos reales (franja F3)' })
  @ApiOkResponse({ type: EstadoDeEquiposSimuladosDto })
  async estado(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<EstadoDeEquiposSimuladosDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/simulados');
    const activos = (await this.repo.listar(destino, copropiedadId)).filter(
      (e) => e.estado === 'activo',
    );
    return { ...estadoDeEquiposSimulados(this.configuracion.PROVEEDOR_DE_EQUIPOS, activos.length) };
  }
}

/** F3 · y al arrancar, en la bitácora del Mac: la primera pantalla que se mira. */
@Injectable()
export class AvisoDeEquiposSimuladosAlArrancar implements OnApplicationBootstrap {
  constructor(
    @Inject(REPOSITORIO_DE_EQUIPOS) private readonly repo: RepositorioDeEquipos,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.configuracion.PROVEEDOR_DE_EQUIPOS !== 'simulado') return;
    let registrados: number;
    try {
      registrados = (await this.repo.activos()).length;
    } catch (error) {
      this.bitacora.registrar('aviso', 'no se pudo contar los equipos dados de alta', {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const estado = estadoDeEquiposSimulados('simulado', registrados);
    if (estado.aviso === null) return;
    this.bitacora.registrar('aviso', estado.aviso, {
      equiposRegistrados: registrados,
      remedio:
        `PROVEEDOR_DE_EQUIPOS=${CLASES_REALES} en el .env de la API y reiníciela: con ` +
        '«simulado» ninguna apertura mueve un equipo de verdad',
    });
  }
}
