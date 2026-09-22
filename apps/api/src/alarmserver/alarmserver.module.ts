import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ACCIONADOR_DE_PUERTA } from '../guardia';
import type { AccionadorDePuerta } from '../guardia';
import { AlarmServerController } from './presentacion/alarm-server.controller';
import { GuardiaDeAlarmServer, EQUIPOS_DE_ALARM_SERVER } from './presentacion/guardia-alarm-server';
import { leerEquiposDeclarados } from '../comun/equipos-de-alarm-server';
import { ACCIONADOR_DEL_RECEPTOR } from './presentacion/alarm-server.controller';

/**
 * El receptor del «servidor de alarma», y nada más.
 *
 * No trae casos de uso propios: reutiliza `RegistrarAcceso` de `eventos` —que
 * es `@Global` y lo exporta— y el accionador de `guardia`. Si algún día
 * necesitara uno, sería la señal de que la decisión se está duplicando fuera
 * del motor de reglas.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EL ACCIONADOR SE RESUELVE POR `ModuleRef` Y NO SE IMPORTA
 *
 * `GuardiaModule` se registra con `GuardiaModule.registrar()`, es decir, como
 * módulo DINÁMICO. Importarlo desde aquí volvería a invocar su fábrica y
 * crearía una SEGUNDA instancia del accionador: la consola de portería
 * accionaría un objeto y la cámara otro, con su propio control real a `null`,
 * y las pruebas seguirían en verde porque cada una mira el suyo. Es el mismo
 * defecto que ya evitó `PlanificacionModule`, y la misma solución: `strict:
 * false` busca la instancia ÚNICA que `app.module.ts` ya registró.
 *
 * La frontera de §2.2 se respeta igual: el token se importa por el BARRIL de
 * `guardia`, no por una ruta interna suya.
 */
@Module({})
export class AlarmServerModule {
  static registrar(equiposCrudos: string | undefined): DynamicModule {
    // Se leen AL CONSTRUIR el módulo: una declaración mal formada rompe el
    // arranque (§2.7.1). Un extremo que acredita equipos no puede descubrir en
    // la primera petición que su configuración no valía.
    const equipos = leerEquiposDeclarados(equiposCrudos);
    return {
      module: AlarmServerModule,
      controllers: [AlarmServerController],
      providers: [
        GuardiaDeAlarmServer,
        { provide: EQUIPOS_DE_ALARM_SERVER, useValue: equipos },
        {
          /**
           * Token PROPIO, y no el de `guardia`. Con el mismo token, la fábrica
           * se buscaría a sí misma: `strict: false` recorre todo el contenedor
           * y este proveedor también está en él. Un alias distinto hace que
           * «de dónde sale el accionador» tenga una sola respuesta posible.
           */
          provide: ACCIONADOR_DEL_RECEPTOR,
          inject: [ModuleRef],
          useFactory: (referencia: ModuleRef): AccionadorDePuerta =>
            referencia.get<AccionadorDePuerta>(ACCIONADOR_DE_PUERTA, { strict: false }),
        },
      ],
    };
  }
}
