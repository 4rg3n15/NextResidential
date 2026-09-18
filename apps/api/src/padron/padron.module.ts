import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { REPOSITORIO_PADRON } from './aplicacion/puertos';
import { LECTOR_DE_VOCABULARIO } from './aplicacion/vocabulario';
import { REPOSITORIO_COPROPIEDADES } from '../multiempresa/repositorio-copropiedades';
import type { RepositorioCopropiedades } from '../multiempresa/repositorio-copropiedades';
import { RepositorioPadronPg } from './infraestructura/repositorio-pg';
import { VocabularioDesdeCopropiedad } from './infraestructura/vocabulario-desde-copropiedad';
import { PadronController } from './presentacion/padron.controller';
import { PadronDeCopropiedadController } from './presentacion/padron-copropiedad.controller';

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
      controllers: [PadronController, PadronDeCopropiedadController],
      providers: [
        {
          provide: REPOSITORIO_PADRON,
          inject: [Pool],
          useFactory: (pool: Pool) => new RepositorioPadronPg(pool, {}),
        },
        /**
         * El vocabulario del conjunto llega por el repositorio de
         * `multiempresa` —que `MultiempresaModule` exporta y es `@Global()`—,
         * no por una consulta del padrón a `copropiedades`. La frontera de §2.2
         * se sostiene en el cableado, que es donde puede sostenerse.
         */
        {
          provide: LECTOR_DE_VOCABULARIO,
          inject: [REPOSITORIO_COPROPIEDADES],
          useFactory: (copropiedades: RepositorioCopropiedades) =>
            new VocabularioDesdeCopropiedad(copropiedades),
        },
      ],
      exports: [REPOSITORIO_PADRON, LECTOR_DE_VOCABULARIO],
    };
  }
}
