import type { FactoryProvider } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import { REPOSITORIO_CODIGOS_MFA } from '../aplicacion/puertos';
import type { RepositorioCodigosMfa } from '../aplicacion/puertos';
import { RepositorioCodigosMfaEnMemoria } from './codigos-mfa-en-memoria';
import { RepositorioCodigosMfaPg } from './codigos-mfa-pg';

/**
 * 15-R, bloque A1 · los códigos de recuperación del segundo factor (RN-20,
 * CA-25) siguen el interruptor de persistencia del resto de la API. En memoria
 * —sólo la suite sin base— un reinicio los borra, y el arranque lo dice.
 */
export const PROVEEDOR_DE_CODIGOS_MFA: FactoryProvider<RepositorioCodigosMfa> = {
  provide: REPOSITORIO_CODIGOS_MFA,
  inject: [CONFIGURACION, Pool, BITACORA],
  useFactory: (configuracion: Configuracion, pool: Pool, bitacora: Bitacora) => {
    const enBase = configuracion.PERSISTENCIA_DE_EVENTOS === 'postgres';
    bitacora.registrar(
      enBase ? 'info' : 'aviso',
      `códigos de recuperación del segundo factor en: ${configuracion.PERSISTENCIA_DE_EVENTOS}`,
      {
        persistencia: configuracion.PERSISTENCIA_DE_EVENTOS,
        consecuencia: enBase
          ? 'sólo hashes, en codigos_recuperacion_mfa; un solo uso lo decide la base'
          : 'los códigos viven en este proceso y se PIERDEN al reiniciar (RN-20)',
      },
    );
    return enBase ? new RepositorioCodigosMfaPg(pool) : new RepositorioCodigosMfaEnMemoria();
  },
};
