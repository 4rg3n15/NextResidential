import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { MENSAJE_CUENTA_DE_MENOR } from '@ncr/domain-core';
import { Publico } from '../../comun/decoradores';
import { ErrorApiDto } from '../../comun/respuestas';
import { RegistrarResidente } from '../aplicacion/registrar-residente';
import { RegistroCreadoDto, RegistroDeResidenteDto } from './dtos-registro';
import {
  LIMITE_DE_REGISTRO_POR_IP,
  LimitadaComoRegistro,
  VENTANA_DE_REGISTRO_POR_IP_MS,
} from './limites-de-registro';
import { PoliticaEnElRechazo } from './politica-en-el-rechazo';

/** El código incorrecto, usado, de otro conjunto o en un registro suspendido: uno solo. */
export const MENSAJE_CODIGO_DE_INVITACION = 'El código de invitación no es válido o ya se usó';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * «CREAR CUENTA» · LA ÚNICA RUTA PÚBLICA NUEVA DE LA 15-W (D-W1, D2, ADR-037)
 *
 * Un controlador aparte de `cuentas.controller.ts` —donde el encargo la
 * situaba— porque allí la ruta llevaba el fichero a más de 300 líneas (§2.3), y
 * porque su razón de cambio es otra: el alta de residentes, no la sesión.
 * Mismo módulo, mismo prefijo `auth/` y la misma protección que `auth/acceso`:
 * sin sesión por definición, la cuidan sus límites (por IP, por IP y prefijo y
 * la suspensión por copropiedad en la base) y el tiempo uniforme de sus fallos.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('cuentas')
@Controller()
export class RegistroController {
  constructor(@Inject(RegistrarResidente) private readonly registrar: RegistrarResidente) {}

  @Post('auth/registro')
  @HttpCode(201)
  @Publico()
  @LimitadaComoRegistro()
  @UseInterceptors(PoliticaEnElRechazo)
  @Throttle({ default: { limit: LIMITE_DE_REGISTRO_POR_IP, ttl: VENTANA_DE_REGISTRO_POR_IP_MS } })
  @ApiOperation({
    summary: 'Crear cuenta de residente con un código de plaza (D-W1, D-W8). No emite tokens',
  })
  @ApiCreatedResponse({ type: RegistroCreadoDto })
  @ApiBadRequestResponse({
    type: ErrorApiDto,
    description: `Campos, menor de edad o «${MENSAJE_CODIGO_DE_INVITACION}». Lleva la política vigente`,
  })
  @ApiConflictResponse({ type: ErrorApiDto, description: 'Usuario ocupado' })
  @ApiTooManyRequestsResponse({
    type: ErrorApiDto,
    description: '10 cada 10 min por IP y 5 cada 15 min por (IP, prefijo del código)',
  })
  async registro(
    @Body() dto: RegistroDeResidenteDto,
    @Req() peticion: Request,
  ): Promise<RegistroCreadoDto> {
    const r = await this.registrar.ejecutar(dto, peticion.ip ?? null);
    if (r.ok) return { creada: true };
    switch (r.error.motivo) {
      case 'CAMPOS':
        throw new BadRequestException({ mensaje: 'Revise los datos', campos: [...r.error.campos] });
      case 'MENOR_DE_EDAD':
        throw new BadRequestException(MENSAJE_CUENTA_DE_MENOR);
      case 'CODIGO':
        throw new BadRequestException(MENSAJE_CODIGO_DE_INVITACION);
      case 'USUARIO_OCUPADO':
        throw new ConflictException('Ese usuario no está disponible');
      case 'NO_DISPONIBLE':
        throw new ServiceUnavailableException('El registro no está disponible en este momento');
    }
  }
}
