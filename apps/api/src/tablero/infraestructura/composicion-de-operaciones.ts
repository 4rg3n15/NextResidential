import type { FactoryProvider } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import { OPERACIONES_DE_DISPOSITIVO } from '../aplicacion/operaciones-de-dispositivo';
import type { OperacionesDeDispositivo } from '../aplicacion/operaciones-de-dispositivo';
import { OperacionesEnMemoria } from './operaciones-en-memoria';
import { OperacionesConRastroPg } from './operaciones-con-rastro-pg';

/**
 * 15-R, bloque A2 · con base, cada operación pedida deja su fila atribuida en
 * `operaciones_de_dispositivo` y las pendientes sobreviven al reinicio; el
 * adaptador declarativo sigue siendo quien la anota en la bitácora y quien
 * dice que ninguna llega al equipo todavía (H-SITIO-02).
 */
export const PROVEEDOR_DE_OPERACIONES: FactoryProvider<OperacionesDeDispositivo> = {
  provide: OPERACIONES_DE_DISPOSITIVO,
  inject: [CONFIGURACION, Pool, BITACORA],
  useFactory: (configuracion: Configuracion, pool: Pool, bitacora: Bitacora) => {
    const declarativa = new OperacionesEnMemoria(bitacora);
    const enBase = configuracion.PERSISTENCIA_DE_EVENTOS === 'postgres';
    bitacora.registrar(
      enBase ? 'info' : 'aviso',
      `operaciones de dispositivo activas: ${configuracion.PERSISTENCIA_DE_EVENTOS}`,
      {
        persistencia: configuracion.PERSISTENCIA_DE_EVENTOS,
        consecuencia: enBase
          ? 'cada orden queda atribuida en operaciones_de_dispositivo'
          : 'las órdenes pendientes viven en este proceso y se PIERDEN al reiniciar',
      },
    );
    return enBase ? new OperacionesConRastroPg(pool, declarativa) : declarativa;
  },
};
