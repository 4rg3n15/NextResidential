import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { esFallo } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_CONSENTIMIENTOS } from '../aplicacion/puertos';
import type { RepositorioConsentimientos } from '../aplicacion/puertos';
import {
  BarrerPlantillasVencidas,
  CapturarRostro,
  ResponderConsentimiento,
  RevocarConsentimiento,
  SincronizarPlantilla,
} from '../aplicacion/casos-de-uso';
import { CapturarRostroDto, ResponderConsentimientoDto, SincronizarPlantillaDto } from './dtos';

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
 * Las rutas de consentimiento las ejecuta **el titular** (RN-10). El titular es
 * un visitante, que no es usuario administrativo: alcanza estas rutas con el
 * token que le llega por el canal de la solicitud, y el caso de uso comprueba
 * que `personaId` del token coincide con el titular del consentimiento.
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
    private readonly capturar: CapturarRostro,
    private readonly responder: ResponderConsentimiento,
    private readonly revocar: RevocarConsentimiento,
    private readonly sincronizar: SincronizarPlantilla,
    private readonly barrer: BarrerPlantillasVencidas,
    @Inject(REPOSITORIO_CONSENTIMIENTOS)
    private readonly consentimientos: RepositorioConsentimientos,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Post('capturas')
  @Roles('administrador', 'portero', 'operador_central')
  @ApiOperation({
    summary: 'Valida la calidad y solicita el consentimiento al TITULAR (CU-02, CA-08)',
  })
  async capturarRostro(
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Contexto() ctx: ContextoTenant,
    @Body() dto: CapturarRostroDto,
  ) {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'biometria/capturas');
    return desenvolver(
      await this.capturar.ejecutar(ctx, {
        titularId: dto.titularId,
        ...(dto.autorizacionId === undefined ? {} : { autorizacionId: dto.autorizacionId }),
        medidas: dto.medidas,
        vector: new Uint8Array(Buffer.from(dto.vector, 'base64')),
        versionPolitica: dto.versionPolitica,
        canal: dto.canal,
        suprimirEn: new Date(dto.suprimirEn),
      }),
    );
  }

  @Get('consentimientos/:consentimientoId')
  @Roles('administrador', 'portero', 'operador_central', 'residente')
  @ApiOperation({ summary: 'Estado de un consentimiento, sin dato biométrico alguno' })
  async verConsentimiento(
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('consentimientoId', ParseUUIDPipe) consentimientoId: string,
    @Contexto() ctx: ContextoTenant,
  ) {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'biometria/consentimientos');
    const c = await this.consentimientos.porId(copropiedadId, consentimientoId);
    if (c === null) throw new NotFoundException('El consentimiento no existe');
    return {
      id: c.id,
      estado: c.estado,
      finalidad: c.finalidad,
      versionPolitica: c.versionPolitica,
      canal: c.canal,
      solicitadoEn: c.solicitadoEn.toISOString(),
      otorgadoEn: c.otorgadoEn?.toISOString() ?? null,
      revocadoEn: c.revocadoEn?.toISOString() ?? null,
    };
  }

  @Post('consentimientos/:consentimientoId/respuesta')
  @Roles('residente', 'administrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'El TITULAR acepta o rechaza. Nadie responde por él (RN-10)' })
  async responderConsentimiento(
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('consentimientoId', ParseUUIDPipe) consentimientoId: string,
    @Contexto() ctx: ContextoTenant,
    @Body() dto: ResponderConsentimientoDto,
  ) {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'biometria/consentimientos');
    // `quienResponde` sale del TOKEN, nunca del cuerpo: si el cliente lo
    // pusiera, RN-10 sería una casilla que cualquiera marca.
    return desenvolver(
      await this.responder.ejecutar(ctx, {
        consentimientoId,
        quienResponde: ctx.personaId ?? ctx.usuarioId,
        acepta: dto.acepta,
        ...(dto.evidenciaId === undefined ? {} : { evidenciaId: dto.evidenciaId }),
      }),
    );
  }

  @Post('consentimientos/:consentimientoId/revocacion')
  @Roles('residente', 'administrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'Revocación del titular: supresión inmediata (RN-11, CA-11)' })
  async revocarConsentimiento(
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('consentimientoId', ParseUUIDPipe) consentimientoId: string,
    @Contexto() ctx: ContextoTenant,
  ) {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'biometria/consentimientos');
    return desenvolver(
      await this.revocar.ejecutar(ctx, {
        consentimientoId,
        quienRevoca: ctx.personaId ?? ctx.usuarioId,
      }),
    );
  }

  @Post('plantillas/:plantillaId/sincronizacion')
  @Roles('administrador')
  @ApiOperation({ summary: 'Empuja la plantilla a una terminal, si hay consentimiento (RN-09)' })
  async sincronizarPlantilla(
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('plantillaId', ParseUUIDPipe) plantillaId: string,
    @Contexto() ctx: ContextoTenant,
    @Body() dto: SincronizarPlantillaDto,
  ) {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'biometria/plantillas');
    return desenvolver(
      await this.sincronizar.ejecutar(ctx, { plantillaId, dispositivoId: dto.dispositivoId }),
    );
  }

  @Post('barrido')
  @Roles('administrador')
  @ApiOperation({ summary: 'Supresión de las vencidas y retirada de terminales (RN-11, KPI-21)' })
  async ejecutarBarrido(
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Contexto() ctx: ContextoTenant,
  ) {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'biometria/barrido');
    return desenvolver(await this.barrer.ejecutar(ctx));
  }
}
