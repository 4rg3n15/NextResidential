import type { FactoryProvider } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import { REGISTRO_DE_BLOQUEOS } from '../aplicacion/bloqueo-de-acceso';
import type { RegistroDeBloqueos } from '../aplicacion/bloqueo-de-acceso';
import { RegistroDeBloqueosEnMemoria } from './adaptadores-en-memoria';
import { RegistroDeBloqueosPg } from './registro-de-bloqueos-pg';

/**
 * 15-R, bloque A2 · el registro de bloqueos sigue el MISMO interruptor que la
 * bitácora de órdenes (`PERSISTENCIA_DE_EVENTOS`), y el arranque dice cuál
 * quedó activo: en memoria, un reinicio olvida quién bloqueó qué (D-140).
 */
export const PROVEEDOR_DE_REGISTRO_DE_BLOQUEOS: FactoryProvider<RegistroDeBloqueos> = {
  provide: REGISTRO_DE_BLOQUEOS,
  inject: [CONFIGURACION, Pool, BITACORA],
  useFactory: (configuracion: Configuracion, pool: Pool, bitacora: Bitacora) => {
    const enBase = configuracion.PERSISTENCIA_DE_EVENTOS === 'postgres';
    bitacora.registrar(
      enBase ? 'info' : 'aviso',
      `registro de bloqueos de acceso activo: ${configuracion.PERSISTENCIA_DE_EVENTOS}`,
      {
        persistencia: configuracion.PERSISTENCIA_DE_EVENTOS,
        consecuencia: enBase
          ? 'quién bloqueó cada acceso, y por qué, queda en bloqueos_de_acceso'
          : 'los bloqueos viven en este proceso y se PIERDEN al reiniciar',
      },
    );
    return enBase ? new RegistroDeBloqueosPg(pool) : new RegistroDeBloqueosEnMemoria();
  },
};
