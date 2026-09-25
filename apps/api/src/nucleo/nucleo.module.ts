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
import { AuditoriaEnMemoria, REGISTRO_AUDITORIA, RegistroDeAuditoriaPg } from '../comun/auditoria';
import type { RegistroDeAuditoria } from '../comun/auditoria';
import { Pool } from 'pg';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';

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
    AuditoriaEnMemoria,
    {
      /**
       * D-139 (15-E) · con base y `PERSISTENCIA_DE_EVENTOS=postgres` la
       * auditoría de seguridad va a `auditoria_seguridad`; sin Pool o en
       * `memoria` (la suite, un ensayo sin base) queda el doble. Los dos son
       * OPCIONALES a propósito: hay bancos que montan el núcleo a solas.
       */
      provide: REGISTRO_AUDITORIA,
      inject: [
        AuditoriaEnMemoria,
        BITACORA,
        { token: Pool, optional: true },
        { token: CONFIGURACION, optional: true },
      ],
      useFactory: (
        enMemoria: AuditoriaEnMemoria,
        bitacora: Bitacora,
        pool?: Pool,
        configuracion?: Configuracion,
      ): RegistroDeAuditoria =>
        pool !== undefined && configuracion?.PERSISTENCIA_DE_EVENTOS === 'postgres'
          ? new RegistroDeAuditoriaPg(pool, bitacora)
          : enMemoria,
    },
    { provide: RELOJ, useValue: relojDelSistema },
    { provide: GENERADOR_DE_ID, useValue: generadorUuid },
    /**
     * ETAPA 14 · el nivel mínimo sale de `LOG_LEVEL`, que hasta ahora estaba en
     * `.env.example` y no la leía nadie. La configuración se inyecta como
     * **opcional** a propósito: hay bancos de prueba que montan el núcleo a
     * solas, sin `ConfiguracionModule`, y ahí el valor por omisión —`debug`,
     * todo se escribe— es el correcto. Exigirla convertiría una mejora de
     * observabilidad en una rotura de veinte suites que no tienen nada que ver.
     */
    {
      provide: BITACORA,
      inject: [{ token: CONFIGURACION, optional: true }],
      useFactory: (config?: Configuracion): Bitacora =>
        new BitacoraEstructurada(undefined, config?.LOG_LEVEL ?? 'debug'),
    },
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
  exports: [
    AuditoriaEnMemoria,
    REGISTRO_AUDITORIA,
    RELOJ,
    GENERADOR_DE_ID,
    BITACORA,
    BUS_DE_EVENTOS,
    UNIDAD_DE_TRABAJO,
  ],
})
export class NucleoModule {}
