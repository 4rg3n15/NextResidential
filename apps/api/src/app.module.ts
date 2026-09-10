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
        /**
         * **`MultiempresaModule` va ANTES de `AutenticacionModule`, y el orden
         * es funcional: no lo toque sin leer esto.**
         *
         * `AutenticacionController` inyecta `REGISTRO_AUDITORIA`, que este
         * módulo provee y exporta siendo `@Global()`. Ser global no basta: un
         * proveedor global alcanza a lo que se registra DESPUÉS. Con el orden
         * anterior el proceso no arrancaba —«Nest can't resolve dependencies of
         * the AutenticacionController»— mientras las 363 pruebas seguían en
         * verde, porque `Test.createTestingModule` envuelve `AppModule` en un
         * módulo raíz propio y allí los globales alcanzan a todo.
         *
         * El import explícito sería más robusto que el orden, pero cierra un
         * ciclo de `require`: `multiempresa/respuestas.ts` toma `ROLES` del
         * barril de `autenticacion`, y con las dos flechas el enumerado llega
         * `undefined` en tiempo de carga. Queda declarado como DT-13, con la
         * salida escrita: el puerto de auditoría pertenece al núcleo
         * compartido, no a `multiempresa`.
         *
         * Lo que impide que esto vuelva a pasar no es este comentario: es el
         * paso «la API arranca de verdad» de `verificar-etapa.sh`, que ejecuta
         * el proceso compilado y le pide `/health`.
         */
        MultiempresaModule,
        AutenticacionModule.registrar(),
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
