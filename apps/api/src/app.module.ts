import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { InterceptorDeCorrelacion } from './comun/interceptores/correlacion';
import type { Configuracion } from './configuracion/esquema';
import { NucleoModule } from './nucleo/nucleo.module';
import { SaludController } from './salud/salud.controller';

/**
 * El límite de peticiones es GLOBAL desde el primer día (§2.7.5). Ponerlo solo
 * en las rutas «sensibles» deja fuera las que aún no existen; el endurecimiento
 * por ruta se suma encima en la ETAPA 03.
 */
@Module({})
export class AppModule {
  static conConfiguracion(config: Configuracion): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfiguracionModule.conValores(config),
        NucleoModule,
        ThrottlerModule.forRoot([
          { ttl: config.THROTTLE_TTL_SEGUNDOS * 1000, limit: config.THROTTLE_LIMITE },
        ]),
      ],
      controllers: [SaludController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, InterceptorDeCorrelacion],
    };
  }
}
