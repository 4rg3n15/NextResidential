import { Global, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BITACORA,
  BUS_DE_EVENTOS,
  BusDeEventosEnMemoria,
  GENERADOR_DE_ID,
  RELOJ,
  UNIDAD_DE_TRABAJO,
} from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj, UnidadDeTrabajo } from '@ncr/domain-core';
import { BitacoraEstructurada } from '../comun/bitacora/bitacora-estructurada';

/**
 * Cableado de los puertos de soporte (§2.3, DIP).
 *
 * Aquí —y solo aquí— viven `new Date()` y `randomUUID()`. Al dominio le llegan
 * detrás de `Reloj` y `GeneradorDeId`, que es lo que permite fijar el instante
 * en una prueba de vigencia sin tocar el reloj del sistema.
 */
const relojDelSistema: Reloj = { ahora: () => new Date() };
const generadorUuid: GeneradorDeId = { nuevo: () => randomUUID() };

/**
 * Unidad de trabajo provisional: ejecuta la operación sin transacción real.
 * La implementación con PostgreSQL llega con el adaptador de persistencia
 * (ETAPA 04). Está aquí para que la frontera exista desde el principio y los
 * casos de uso se escriban contra ella, no para simular una garantía que aún
 * no da: por eso el nombre lo dice y la bitácora lo avisa una vez.
 */
class UnidadDeTrabajoSinTransaccion implements UnidadDeTrabajo {
  private avisada = false;
  constructor(private readonly bitacora: Bitacora) {}
  async ejecutar<T>(operacion: () => Promise<T>): Promise<T> {
    if (!this.avisada) {
      this.avisada = true;
      this.bitacora.registrar('aviso', 'UnidadDeTrabajo sin transaccion real (pendiente ETAPA 04)');
    }
    return operacion();
  }
}

@Global()
@Module({
  providers: [
    { provide: RELOJ, useValue: relojDelSistema },
    { provide: GENERADOR_DE_ID, useValue: generadorUuid },
    { provide: BITACORA, useFactory: (): Bitacora => new BitacoraEstructurada() },
    {
      provide: BUS_DE_EVENTOS,
      inject: [BITACORA],
      useFactory: (bitacora: Bitacora) =>
        new BusDeEventosEnMemoria((evento, error) =>
          bitacora.registrar('error', 'manejador de evento de dominio fallido', {
            evento: evento.nombre,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
    },
    {
      provide: UNIDAD_DE_TRABAJO,
      inject: [BITACORA],
      useFactory: (bitacora: Bitacora) => new UnidadDeTrabajoSinTransaccion(bitacora),
    },
  ],
  exports: [RELOJ, GENERADOR_DE_ID, BITACORA, BUS_DE_EVENTOS, UNIDAD_DE_TRABAJO],
})
export class NucleoModule {}
