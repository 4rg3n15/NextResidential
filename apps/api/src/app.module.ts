import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { AutenticacionModule } from './autenticacion';
import { GuardaDeAutenticacion } from './comun/guardas/autenticacion.guard';
import { GuardaDeRoles } from './comun/guardas/roles.guard';
import { MultiempresaModule } from './multiempresa/multiempresa.module';
import { PadronModule } from './padron';
import { AutorizacionesModule } from './autorizaciones';
import { EventosModule } from './eventos';
import { ZonasModule } from './zonas';
import { BiometriaModule } from './biometria';
import { TableroModule } from './tablero';
import { limitadorPorDispositivo } from './eventos';
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
        AutenticacionModule.registrar(),
        MultiempresaModule,
        PadronModule.registrar(),
        ZonasModule.registrar(),
        BiometriaModule.registrar(),
        EventosModule.registrar(),
        AutorizacionesModule.registrar(),
        // Después de eventos: el tablero lee por los puertos que aquel publica.
        TableroModule.registrar(),
        // Dos limitadores con NOMBRE, y cada uno cuenta por lo suyo: `default`
        // por IP —el de siempre— y `dispositivo` por equipo firmante (D-28).
        // Uno solo no sirve: en la ingesta todos los equipos comparten IP, y el
        // tope por IP los suma a todos. La prueba de carga lo demostró.
        ThrottlerModule.forRoot([
          {
            name: 'default',
            ttl: config.THROTTLE_TTL_SEGUNDOS * 1000,
            limit: config.THROTTLE_LIMITE,
          },
          limitadorPorDispositivo(config.THROTTLE_DISPOSITIVO_LIMITE),
        ]),
      ],
      controllers: [SaludController],
      providers: [
        // El ORDEN importa y es deliberado: límite → autenticación → roles.
        // Poner el throttler primero hace que un ataque de fuerza bruta se
        // corte ANTES de verificar firmas, que es la parte cara.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: GuardaDeAutenticacion },
        { provide: APP_GUARD, useClass: GuardaDeRoles },
        InterceptorDeCorrelacion,
      ],
    };
  }
}
