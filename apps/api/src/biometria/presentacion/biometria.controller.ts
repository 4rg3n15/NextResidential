import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { esFallo } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { ALCANCE_DE_EQUIPOS } from '../../equipos';
import type { AlcanceDeEquipos } from '../../equipos';
import {
  BarrerPlantillasVencidas,
  RevocarConsentimiento,
  SincronizarPlantilla,
} from '../aplicacion/casos-de-uso';
import { SincronizarPlantillaEnTerminales } from '../aplicacion/sincronizacion-total';
import type { ResultadoDeSincronizacionTotal } from '../aplicacion/sincronizacion-total';
import { SincronizacionTotalDto, SincronizarPlantillaDto } from './dtos';

const aSincronizacionDto = (r: ResultadoDeSincronizacionTotal): SincronizacionTotalDto => ({
  plantillaId: r.plantillaId,
  terminales: r.terminales,
  sincronizadas: r.sincronizadas,
  fallidas: r.fallidas,
  porTerminal: r.porTerminal.map((t) => ({ ...t })),
  omitidas: r.omitidas.map((o) => ({ ...o })),
});

/**
 * Superficie HTTP de la biometría.
 *
 * **Lo que aquí no hay es tan importante como lo que hay: no existe una ruta
 * que devuelva un vector biométrico.** No es que esté protegida por un rol: no
 * existe. El puerto `BovedaDePlantillas` tampoco ofrece leerlo, así que ni
 * siquiera un controlador escrito por descuido dentro de seis meses podría
 * exponerlo sin añadir antes la operación al puerto — que es una decisión
 * visible en una revisión, no un descuido.
 *
 * F (15-L, ADR-032) · la foto del visitante y su consentimiento declarado
 * nacen al generar la autorización (módulo de visitas). Aquí queda lo que
 * sigue a eso: la confirmación OPCIONAL del titular presente (D-10), la
 * revocación, la sincronización y su reintento, y el barrido. El enlace para
 * el titular, su página pública y la captura suelta ya no existen.
 */
const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (esFallo(r)) {
    if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
    // El hardware que no responde NO es una prohibición: distinguirlos importa
    // porque la respuesta del operador es distinta —reintentar frente a pedir
    // el consentimiento— y porque un 403 aquí acusaría al visitante de algo.
    if (r.error.codigo === 'CONFLICTO_DE_CONCURRENCIA') {
      throw new ServiceUnavailableException({ motivo: r.error.codigo, detalle: r.error.detalle });
    }
    // Una violación de RN-09 o RN-10 es una prohibición, no un dato mal escrito.
    throw new ForbiddenException({ motivo: r.error.codigo, detalle: r.error.detalle });
  }
  return r.valor;
};

@ApiTags('biometria')
@ApiBearerAuth()
@Controller('copropiedades/:id/biometria')
export class BiometriaController {
  constructor(
    // H-SITIO-06 · `@Inject` explícito: con `tsx` (start:dev) no hay metadatos
    // de tipos y estos ocho llegaban como `undefined` (inyeccion-explicita.mjs).
    @Inject(RevocarConsentimiento) private readonly revocar: RevocarConsentimiento,
    @Inject(SincronizarPlantilla) private readonly sincronizar: SincronizarPlantilla,
    @Inject(BarrerPlantillasVencidas) private readonly barrer: BarrerPlantillasVencidas,
    @Inject(SincronizarPlantillaEnTerminales)
    private readonly sincronizarEnTerminales: SincronizarPlantillaEnTerminales,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    // 15-L · una plantilla de A no se empuja a una terminal de B.
    @Inject(ALCANCE_DE_EQUIPOS) private readonly equiposDeLaRuta: AlcanceDeEquipos,
  ) {}

  @Post('consentimientos/:consentimientoId/revocacion')
  @Roles('residente', 'administrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'Revocación del titular: supresión inmediata (RN-11, CA-11)' })
  async revocarConsentimiento(
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('consentimientoId', ParseUUIDPipe) consentimientoId: string,
    @Contexto() ctx: ContextoTenant,
  ) {
    const destino = await this.aislamiento.exigirAlcance(
      ctx,
      copropiedadId,
      'biometria/consentimientos',
    );
    return desenvolver(
      await this.revocar.ejecutar(destino, {
        consentimientoId,
        quienRevoca: ctx.personaId ?? ctx.usuarioId,
      }),
    );
  }

  @Post('plantillas/:plantillaId/sincronizacion')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Empuja la plantilla a una terminal, si hay consentimiento (RN-09)' })
  async sincronizarPlantilla(
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('plantillaId', ParseUUIDPipe) plantillaId: string,
    @Contexto() ctx: ContextoTenant,
    @Body() dto: SincronizarPlantillaDto,
  ) {
    const destino = await this.aislamiento.exigirAlcance(
      ctx,
      copropiedadId,
      'biometria/plantillas',
    );
    await this.equiposDeLaRuta.exigir(
      ctx,
      copropiedadId,
      dto.dispositivoId,
      'biometria/plantillas',
    );
    return desenvolver(
      await this.sincronizar.ejecutar(destino, { plantillaId, dispositivoId: dto.dispositivoId }),
    );
  }

  /**
   * A3 (15-E) · a TODAS las terminales y videoporteros con biblioteca de
   * rostros de la copropiedad, por capacidad (ADR-019). Relanzable: el equipo
   * que ya la tiene la vuelve a aceptar y la fila de sincronización no se
   * duplica.
   */
  @Post('plantillas/:plantillaId/sincronizacion-total')
  /**
   * H-SITIO-03 · la pantalla que captura el rostro la llaman también portero y
   * operador de central —son quienes atienden al visitante— y aquí sólo
   * entraban los dos roles administrativos: el «Comprobar y sincronizar» del
   * seguimiento les devolvía 403. No relaja RN-09: el caso de uso sigue
   * negándose sin consentimiento vigente, sea quien sea quien lo pida.
   */
  @Roles('superadministrador', 'administrador', 'portero', 'operador_central')
  @ApiOperation({
    summary: 'Empuja la plantilla a todos los equipos con biblioteca de rostros (RN-09)',
  })
  @ApiOkResponse({ type: SincronizacionTotalDto })
  async sincronizarEnTodas(
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('plantillaId', ParseUUIDPipe) plantillaId: string,
    @Contexto() ctx: ContextoTenant,
  ): Promise<SincronizacionTotalDto> {
    const destino = await this.aislamiento.exigirAlcance(
      ctx,
      copropiedadId,
      'biometria/plantillas',
    );
    return aSincronizacionDto(
      desenvolver(await this.sincronizarEnTerminales.ejecutar(destino, { plantillaId })),
    );
  }

  @Post('barrido')
  @Roles('administrador')
  @ApiOperation({ summary: 'Supresión de las vencidas y retirada de terminales (RN-11, KPI-21)' })
  async ejecutarBarrido(
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Contexto() ctx: ContextoTenant,
  ) {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'biometria/barrido');
    return desenvolver(await this.barrer.ejecutar(destino));
  }
}
