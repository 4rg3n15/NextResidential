import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import { BITACORA_DE_IDENTIDAD } from './puerto';
import { BitacoraDeIdentidadEnMemoria } from './en-memoria';
import { BitacoraDeIdentidadPg } from './pg';

/**
 * Global y ANTES de cuentas y portería, que la escriben (mismo argumento de
 * orden que `MultiempresaModule` en `app.module.ts`). Va a la base con el
 * interruptor del histórico: una bitácora de supervisión que se pierde al
 * reiniciar no es una bitácora, y el arranque lo dice cuando es así.
 */
@Global()
@Module({})
export class BitacoraDeIdentidadModule {
  static registrar(): DynamicModule {
    return {
      module: BitacoraDeIdentidadModule,
      providers: [
        {
          provide: BITACORA_DE_IDENTIDAD,
          inject: [CONFIGURACION, Pool, BITACORA],
          useFactory: (c: Configuracion, pool: Pool, bitacora: Bitacora) => {
            const enBase = c.PERSISTENCIA_DE_EVENTOS === 'postgres';
            bitacora.registrar(
              enBase ? 'info' : 'aviso',
              `bitácora de identidad y portería activa: ${c.PERSISTENCIA_DE_EVENTOS}`,
              {
                consecuencia: enBase
                  ? 'sesiones, patrullajes, turnos y restablecimientos quedan en bitacora_de_porteria'
                  : 'el rastro vive en este proceso y se PIERDE al reiniciar',
              },
            );
            return enBase ? new BitacoraDeIdentidadPg(pool) : new BitacoraDeIdentidadEnMemoria();
          },
        },
      ],
      exports: [BITACORA_DE_IDENTIDAD],
    };
  }
}
