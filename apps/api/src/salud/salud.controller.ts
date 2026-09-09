import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import { Publico } from '../comun/decoradores';
import { ProveedorDeJwks } from '../autenticacion';
import type { Configuracion } from '../configuracion/esquema';
import { ListoDto, SaludDto } from './respuestas';

/**
 * `/health` y `/ready` son cosas distintas y por eso son dos rutas.
 *
 * `/health`: el proceso vive. Si falla, hay que reiniciarlo.
 * `/ready`: puede atender tráfico. Si falla, hay que sacarlo del balanceador
 *  pero NO reiniciarlo — la dependencia que le falta volverá.
 *
 * Confundirlas provoca reinicios en cadena cuando una dependencia externa
 * parpadea. En la ETAPA 03 `/ready` incorpora el JWKS: sin él, la API no puede
 * verificar tokens y debe declararse no lista, no muerta.
 */
@ApiTags('salud')
@Controller()
export class SaludController {
  constructor(
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
    @Inject(ProveedorDeJwks) private readonly jwks: ProveedorDeJwks,
  ) {}

  @Publico()
  @Get('health')
  @ApiOperation({ summary: 'El proceso está vivo' })
  @ApiOkResponse({ type: SaludDto })
  salud(): SaludDto {
    return { estado: 'vivo', momento: this.reloj.ahora().toISOString() };
  }

  @Publico()
  @Get('ready')
  @ApiOperation({ summary: 'La aplicación puede atender tráfico' })
  @ApiOkResponse({ type: ListoDto })
  @ApiServiceUnavailableResponse({
    type: ListoDto,
    description:
      'Falta una dependencia. El proceso está sano: sacar del balanceador, no reiniciar.',
  })
  async listo(): Promise<ListoDto> {
    // La configuración ya está validada si el proceso arrancó; se comprueba de
    // nuevo para que `/ready` no mienta si algo la dejó incompleta en caliente.
    const dependencias: Record<string, string> = {
      configuracion: this.config.origenesPermitidos.length > 0 ? 'ok' : 'incompleta',
      // Sin JWKS la API no puede verificar ningún token: no está lista para
      // atender tráfico, pero el proceso está sano. Por eso 503 y no una caída.
      jwks: (await this.jwks.precalentar()) ? 'ok' : 'no-disponible',
      postgres: 'no-conectado-etapa-04',
    };
    if (dependencias.configuracion !== 'ok' || dependencias.jwks !== 'ok') {
      throw new ServiceUnavailableException({ estado: 'no-listo', dependencias });
    }
    return { estado: 'listo', dependencias };
  }
}
