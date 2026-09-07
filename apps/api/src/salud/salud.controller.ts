import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';

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
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'El proceso está vivo' })
  salud(): { estado: string; momento: string } {
    return { estado: 'vivo', momento: this.reloj.ahora().toISOString() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'La aplicación puede atender tráfico' })
  listo(): { estado: string; dependencias: Record<string, string> } {
    // La configuración ya está validada si el proceso arrancó; se comprueba de
    // nuevo para que `/ready` no mienta si algo la dejó incompleta en caliente.
    const dependencias: Record<string, string> = {
      configuracion: this.config.origenesPermitidos.length > 0 ? 'ok' : 'incompleta',
      jwks: 'pendiente-etapa-03',
    };
    if (dependencias.configuracion !== 'ok') {
      throw new ServiceUnavailableException({ estado: 'no-listo', dependencias });
    }
    return { estado: 'listo', dependencias };
  }
}
