import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { Aislamiento } from './aislamiento';
import { CopropiedadesController } from './copropiedades.controller';
import { REPOSITORIO_COPROPIEDADES } from './repositorio-copropiedades';
import { RepositorioCopropiedadesPg } from './repositorio-copropiedades-pg';

/**
 * `Aislamiento` es global a propósito: TODO módulo con recursos de tenant lo
 * necesita, y hacer que cada uno lo reprovisione abriría la puerta a que
 * alguno se lo saltase. La barrera del riesgo número uno no debe depender de
 * que cada módulo se acuerde de importarla.
 */
@Global()
@Module({
  controllers: [CopropiedadesController],
  // El puerto de auditoría ya NO se provee aquí: lo comparten dos módulos, así
  // que vive en el núcleo (`comun/auditoria` + `NucleoModule`). Proveerlo aquí
  // obligaba a `autenticacion` a alcanzar un `@Global()` que no le llegaba, y
  // el proceso no arrancaba.
  providers: [
    Aislamiento,
    /**
     * **Un `Pool` propio, y queda anotado como deuda.** Son ya seis módulos
     * abriendo el suyo contra el mismo PostgreSQL, y la ETAPA 12 añadirá las
     * del Edge. Se agrupan antes de esa etapa (D-66); hacerlo aquí, dentro del
     * bloque que desbloquea al superadministrador, mezclaría dos cambios que
     * fallan por motivos distintos.
     */
    {
      provide: Pool,
      inject: [CONFIGURACION],
      useFactory: (c: Configuracion) =>
        new Pool({ connectionString: c.DATABASE_POOLER_URL, max: 5 }),
    },
    {
      provide: REPOSITORIO_COPROPIEDADES,
      inject: [Pool],
      useFactory: (pool: Pool) => new RepositorioCopropiedadesPg(pool),
    },
  ],
  exports: [Aislamiento, REPOSITORIO_COPROPIEDADES],
})
export class MultiempresaModule {}
