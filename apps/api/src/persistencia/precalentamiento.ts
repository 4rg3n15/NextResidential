import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F2 (corrección de la 15-L) · EL POOL, CALIENTE ANTES DEL PRIMER ROSTRO
 *
 * La primera conexión a Supabase cuesta el apretón TLS y la autenticación: en
 * sitio, cientos de milisegundos. Si esa primera conexión la abre el primer
 * rostro que reconoce la terminal, se gasta dentro de su plazo de verificación
 * y la terminal niega por su cuenta. Aquí se abren al arrancar unas pocas
 * conexiones en paralelo, con un `SELECT 1`, y se devuelven al pool.
 *
 * No impide arrancar: sin base, la API sigue y `/ready` lo dice. Lo que queda
 * es una línea en la bitácora con cuántas se abrieron y cuánto tardaron.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const CONEXIONES_A_PRECALENTAR = 4;

@Injectable()
export class PrecalentamientoDelPool implements OnApplicationBootstrap {
  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // En memoria (las suites sin base) no hay nada que calentar.
    if (this.configuracion.PERSISTENCIA_DE_EVENTOS !== 'postgres') return;
    await this.precalentar();
  }

  async precalentar(): Promise<{ readonly abiertas: number; readonly fallidas: number }> {
    const cuantas = Math.min(CONEXIONES_A_PRECALENTAR, this.configuracion.PG_POOL_MAX);
    const comienzo = this.reloj.ahora().getTime();
    const resultados = await Promise.allSettled(
      Array.from({ length: cuantas }, async () => {
        const cliente = await this.pool.connect();
        try {
          await cliente.query('SELECT 1');
        } finally {
          cliente.release();
        }
      }),
    );
    const fallidas = resultados.filter((r) => r.status === 'rejected');
    const abiertas = cuantas - fallidas.length;
    const primera = fallidas[0];
    this.bitacora.registrar(
      fallidas.length === 0 ? 'info' : 'aviso',
      'pool de PostgreSQL precalentado',
      {
        abiertas,
        fallidas: fallidas.length,
        duracionMs: this.reloj.ahora().getTime() - comienzo,
        ...(primera === undefined
          ? {}
          : {
              error:
                primera.reason instanceof Error ? primera.reason.message : String(primera.reason),
            }),
      },
    );
    return { abiertas, fallidas: fallidas.length };
  }
}
