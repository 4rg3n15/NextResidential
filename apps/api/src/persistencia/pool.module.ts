import { Global, Module } from '@nestjs/common';
import type { DynamicModule, OnApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { PrecalentamientoDelPool } from './precalentamiento';
import { vigilarPool } from './con-cliente';

/**
 * 15-O · el nombre con el que el pool se presenta a PostgreSQL. Sirve para verlo
 * en `pg_stat_activity` (qué conexiones son de la API) y para que la prueba de
 * cortes corte SÓLO las suyas.
 */
export const NOMBRE_DE_APLICACION_DEL_POOL = 'ncr-api';

/**
 * 15-O · cuánto espera una petición por una conexión libre antes de rendirse.
 * Sin tope (lo de antes), con el pool agotado la petición esperaba para
 * siempre; con él, falla y el filtro la responde 503 «base de datos no
 * disponible», que es lo que está pasando.
 */
export const ESPERA_MAXIMA_POR_CONEXION_MS = 10_000;

/**
 * **Un solo `Pool` por proceso** — D-66.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO, CON SUS NÚMEROS
 *
 * Tres módulos abrían cada uno el suyo: `padron` con `max: 20`,
 * `autorizaciones` con `max: 10` y `multiempresa` con `max: 5`. Nest resuelve
 * `Pool` por módulo, así que no era una discusión de estilo: eran **tres
 * conjuntos de conexiones que no se conocen**, con un tope efectivo de 35 y
 * ninguno capaz de saber cuánto están usando los otros.
 *
 * Mientras cada módulo iba por su cuenta el síntoma no aparecía. Aparece en la
 * **ETAPA 12**: el Edge reconcilia por lotes al reconectar y ese tráfico se
 * suma al normal, así que el límite del proyecto Supabase se alcanza **sin que
 * ninguno de los tres crea estar cerca del suyo** — y el error que se ve es
 * «too many connections» en un módulo que apenas tenía carga.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE NO SE UNIFICA, Y POR QUÉ
 *
 * La **sonda de arranque** conserva su propia conexión a propósito. Es la que
 * responde `/ready`, y tiene que poder contestar precisamente cuando el pool
 * principal está agotado: si compartiera pool, la sonda esperaría en la misma
 * cola que la saturó y `/ready` se quedaría colgado en vez de decir 503. Una
 * comprobación de salud que depende del recurso que vigila no vigila nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CIERRE ORDENADO
 *
 * `onApplicationShutdown` cierra el pool. Sin esto, cada reinicio dejaba tres
 * conjuntos de conexiones colgando hasta que el servidor las expiraba, y en
 * desarrollo —donde se reinicia decenas de veces— eso agota el límite del
 * proyecto sin que nadie entienda por qué.
 */
@Injectable()
export class CierreDelPool implements OnApplicationShutdown {
  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end().catch((e: unknown) => {
      this.bitacora.registrar('aviso', 'el pool de PostgreSQL no cerró limpiamente', {
        error: e instanceof Error ? e.message : String(e),
      });
    });
  }
}

@Global()
@Module({})
export class PoolModule {
  static registrar(): DynamicModule {
    return {
      module: PoolModule,
      providers: [
        {
          provide: Pool,
          inject: [CONFIGURACION, BITACORA],
          useFactory: (c: Configuracion, bitacora: Bitacora) =>
            /**
             * 15-O · `pool.on('error')`: un cliente OCIOSO cuya conexión corta
             * el servidor (o el pooler de Supabase) emite `'error'`, el pool lo
             * re-emite, y sin oyente Node termina el proceso. Se registra y se
             * sigue: el pool ya descartó ese cliente.
             */
            vigilarPool(
              new Pool({
                connectionString: c.DATABASE_POOLER_URL,
                /**
                 * Un tope único y configurable. Desde la 15-O cabe, con pg-boss
                 * y la sonda, en el presupuesto del pooler
                 * (`SUPABASE_POOLER_MAX_CLIENTES`): lo valida el esquema.
                 */
                max: c.PG_POOL_MAX,
                application_name: NOMBRE_DE_APLICACION_DEL_POOL,
                connectionTimeoutMillis: ESPERA_MAXIMA_POR_CONEXION_MS,
              }),
              (motivo) => {
                bitacora.registrar('aviso', 'PostgreSQL cortó una conexión ociosa del pool', {
                  motivo,
                  remedio: 'el pool la descartó y abrirá otra en la siguiente consulta',
                });
              },
            ),
        },
        CierreDelPool,
        // F2 (corrección de la 15-L) · conexiones abiertas antes del primer rostro.
        PrecalentamientoDelPool,
      ],
      exports: [Pool],
    };
  }
}
