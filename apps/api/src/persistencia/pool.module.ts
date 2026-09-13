import { Global, Module } from '@nestjs/common';
import type { DynamicModule, OnApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';

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
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion) =>
            new Pool({
              connectionString: c.DATABASE_POOLER_URL,
              /**
               * Un tope único y configurable. El valor por defecto es el que
               * tenía el módulo más exigente (`padron`, 20), no la suma de los
               * tres: la suma nunca fue una decisión, era el resultado de que
               * nadie mirara el total.
               */
              max: c.PG_POOL_MAX,
            }),
        },
        CierreDelPool,
      ],
      exports: [Pool],
    };
  }
}
