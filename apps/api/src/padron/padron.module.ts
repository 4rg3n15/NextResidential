import { Global, Module } from '@nestjs/common';
import { Placa, esExito } from '@ncr/domain-core';
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
// Por el barril, nunca por dentro (§2.2): lo único que el padrón sabe del
// motor es que alguien declara este puerto y qué forma tiene.
import { RESOLUTOR_DE_PLACA } from '../autorizaciones';
import type { ResolutorDePlaca } from '../autorizaciones';
import type { RepositorioPadron } from './aplicacion/puertos';

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
/**
 * `@Global` desde la 15-D: el módulo de eventos compone el cargador de contexto
 * del motor y necesita `ResolutorDePlaca`, igual que necesita `ResolutorDeZona`
 * de zonas. Sin el global, el primero que se olvidara de importarlo dejaría al
 * motor sin padrón — que es exactamente D-25 otra vez.
 */
@Global()
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
          // D-25 · CU-01. La placa entra al contexto del motor ya resuelta: su
          // vivienda, si está en servicio y desde cuándo rige el derecho. El
          // VO decide qué es una placa; una lectura que no lo es no se busca.
          provide: RESOLUTOR_DE_PLACA,
          inject: [REPOSITORIO_PADRON],
          useFactory: (repo: RepositorioPadron): ResolutorDePlaca => ({
            resolver: async (copropiedadId, leida) => {
              const placa = Placa.crear(leida);
              if (!esExito(placa)) return null;
              return repo.resolverPlaca(copropiedadId, placa.valor);
            },
          }),
        },
        {
          provide: LECTOR_DE_VOCABULARIO,
          inject: [REPOSITORIO_COPROPIEDADES],
          useFactory: (copropiedades: RepositorioCopropiedades) =>
            new VocabularioDesdeCopropiedad(copropiedades),
        },
      ],
      exports: [REPOSITORIO_PADRON, LECTOR_DE_VOCABULARIO, RESOLUTOR_DE_PLACA],
    };
  }
}
