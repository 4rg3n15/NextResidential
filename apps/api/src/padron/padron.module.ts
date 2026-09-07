import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { REPOSITORIO_PADRON } from './aplicacion/puertos';
import { RepositorioPadronPg } from './infraestructura/repositorio-pg';
import { PadronController } from './presentacion/padron.controller';

/**
 * Un `Pool` por proceso, no por petición: abrir una conexión por petición
 * agotaría el límite del pooler de Supabase en cuanto haya carga.
 *
 * `claims` se pasa vacío en el proveedor porque el contexto real viaja por
 * petición; el adaptador lo fija en la conexión que toma. Cuando la ETAPA 06
 * necesite el contexto por petición, se sustituye por un proveedor con ámbito
 * de petición sin tocar el adaptador — ese es el punto de que el repositorio
 * reciba los claims por constructor y no los busque.
 */
@Module({})
export class PadronModule {
  static registrar(): DynamicModule {
    return {
      module: PadronModule,
      controllers: [PadronController],
      providers: [
        {
          provide: Pool,
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion) =>
            new Pool({ connectionString: c.DATABASE_POOLER_URL, max: 20 }),
        },
        {
          provide: REPOSITORIO_PADRON,
          inject: [Pool],
          useFactory: (pool: Pool) => new RepositorioPadronPg(pool, {}),
        },
      ],
      exports: [REPOSITORIO_PADRON],
    };
  }
}
