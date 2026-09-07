import { Global, Module } from '@nestjs/common';
import { Aislamiento, REGISTRO_AUDITORIA } from './aislamiento';
import { AuditoriaEnMemoria } from './auditoria-en-memoria';
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
  providers: [
    AuditoriaEnMemoria,
    { provide: REGISTRO_AUDITORIA, useExisting: AuditoriaEnMemoria },
    Aislamiento,
  ],
  exports: [Aislamiento, REGISTRO_AUDITORIA, AuditoriaEnMemoria],
})
export class MultiempresaModule {}
