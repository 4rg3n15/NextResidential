import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { GuardiaController } from './presentacion/guardia.controller';
import {
  AccionarPuertaAMano,
  ACCIONADOR_DE_PUERTA,
  BITACORA_DE_ORDENES,
} from './aplicacion/apertura-manual';
import type { AccionadorDePuerta, BitacoraDeOrdenes } from './aplicacion/apertura-manual';
import { CANAL_DE_INTERCOM } from './aplicacion/puertos';
import { CanalIntercomEnProceso } from './infraestructura/canal-intercom-en-proceso';
import {
  AccionadorSimulado,
  BitacoraDeOrdenesEnMemoria,
} from './infraestructura/adaptadores-en-memoria';

/**
 * Consolas operativas — ETAPA 10.
 *
 * **Va después de `EventosModule`**, que es `@Global` y aporta el repositorio
 * de eventos y el escalamiento de alertas. La cola de atención lee de ahí en
 * vez de mantener su propia lista: dos listas de lo mismo se separan, y la que
 * decide qué ve el operador no puede ser la que envejece.
 *
 * Los dos adaptadores de hardware son **simulados y lo dicen** (ADR-03): el
 * relé registra en la bitácora que es simulado, y el canal de audio aplica la
 * exclusividad de verdad con la máquina de estados del dominio. Lo que la
 * ETAPA 15 sustituye es el transporte, no las reglas.
 */
@Module({})
export class GuardiaModule {
  static registrar(): DynamicModule {
    return {
      module: GuardiaModule,
      controllers: [GuardiaController],
      providers: [
        {
          provide: ACCIONADOR_DE_PUERTA,
          inject: [BITACORA],
          useFactory: (bitacora: Bitacora) => new AccionadorSimulado(bitacora),
        },
        { provide: BITACORA_DE_ORDENES, useClass: BitacoraDeOrdenesEnMemoria },
        {
          provide: CANAL_DE_INTERCOM,
          inject: [RELOJ],
          useFactory: (reloj: Reloj) => new CanalIntercomEnProceso(reloj),
        },
        {
          provide: AccionarPuertaAMano,
          inject: [ACCIONADOR_DE_PUERTA, BITACORA_DE_ORDENES, RELOJ, GENERADOR_DE_ID],
          useFactory: (
            accionador: AccionadorDePuerta,
            ordenes: BitacoraDeOrdenes,
            reloj: Reloj,
            ids: GeneradorDeId,
          ) => new AccionarPuertaAMano(accionador, ordenes, reloj, ids),
        },
      ],
      exports: [CANAL_DE_INTERCOM, BITACORA_DE_ORDENES],
    };
  }
}
