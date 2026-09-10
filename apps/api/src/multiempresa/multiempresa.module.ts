import { Global, Module } from '@nestjs/common';
import { Aislamiento } from './aislamiento';
import { CopropiedadesController } from './copropiedades.controller';

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
  providers: [Aislamiento],
  exports: [Aislamiento],
})
export class MultiempresaModule {}
