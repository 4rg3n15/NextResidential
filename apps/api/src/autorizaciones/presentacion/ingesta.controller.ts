import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { construirClaveIdempotencia } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { BITACORA } from '@ncr/domain-core';
import { Publico, SinRecursoDeTenant } from '../../comun/decoradores';
import { GuardiaDeFirmaDeIngesta } from './guardia-firma';
import { EventoIngestaDto } from './dtos';

/**
 * Ingesta de eventos de hardware — el extremo del **Alarm Server**.
 *
 * `@Publico()` porque el emisor es un equipo y no una persona: no hay sesión
 * que presentar. Lo que sustituye a la sesión es la firma del guard, y por eso
 * la exención y el guard van juntos en la misma clase: leer una sin la otra
 * daría una impresión falsa.
 *
 * Esta etapa fija el CONTRATO —qué se acepta, qué se rechaza y con qué clave se
 * deduplica—. La persistencia del evento y la decisión de acceso llegan con la
 * ETAPA 06, que es dueña del agregado `Acceso`; el adaptador que traduce el XML
 * del fabricante a este DTO, con la ETAPA 15.
 */
@ApiTags('ingesta')
@Controller('ingesta')
export class IngestaController {
  constructor(@Inject(BITACORA) private readonly bitacora: Bitacora) {}

  @Post('eventos')
  @Publico()
  @SinRecursoDeTenant()
  @UseGuards(GuardiaDeFirmaDeIngesta)
  @HttpCode(202)
  @ApiOperation({
    summary: 'Recibe un evento firmado del Alarm Server (RNF-03.11)',
    description:
      'Exige firma HMAC vigente. Devuelve la clave de idempotencia con la que el ' +
      'evento se deduplicará (RN-17, CA-22). La decisión de acceso se emite en la ETAPA 06.',
  })
  recibir(@Body() dto: EventoIngestaDto): { aceptado: true; claveIdempotencia: string } {
    const clave = construirClaveIdempotencia({
      copropiedadId: dto.copropiedadId,
      dispositivoId: dto.dispositivoId,
      origen: dto.metodo,
      referenciaExterna: dto.referenciaExterna,
    });
    // La clave la construye el dominio; si sus componentes no son seguros, el
    // evento no entra. Nunca se «arregla» aquí: un identificador con caracteres
    // inesperados es un equipo mal configurado o alguien probando.
    if (!clave.ok) throw new BadRequestException(clave.error.detalle);

    this.bitacora.registrar('info', 'Evento de hardware aceptado', {
      copropiedadId: dto.copropiedadId,
      dispositivoId: dto.dispositivoId,
      metodo: dto.metodo,
    });
    return { aceptado: true, claveIdempotencia: clave.valor };
  }
}
