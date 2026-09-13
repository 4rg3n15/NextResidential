import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { EntradaListaNegra, RepositorioListaNegra } from '../aplicacion/puertos';

/**
 * Adaptador PostgreSQL de la lista negra — RN-06, RN-07, HU-35.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE HABÍA ANTES, Y ES PEOR QUE «EN MEMORIA»
 *
 * El puerto `REPOSITORIO_LISTA_NEGRA` estaba declarado, los dos casos de uso
 * escritos y probados… y **ningún módulo lo proveía**. No es que la lista negra
 * viviera en memoria: es que no había nada detrás del puerto y nadie podía
 * invocar los casos de uso. El motor de reglas recibía del cargador de contexto
 * dos conjuntos vacíos, así que **RN-06 —la precedencia absoluta de la lista
 * negra— no tenía de dónde leer**.
 *
 * Esto entra ahora, y no en la ETAPA 10, porque la consola de portería muestra
 * las listas negras activas (HU-24) y decide con ellas: construir esa pantalla
 * sobre un puerto sin adaptador sería construirla sobre nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRES DECISIONES
 *
 * 1. **`levantar` es un `UPDATE` condicionado, no un `SELECT` y luego un
 *    `UPDATE`.** El `WHERE estado = 'activa'` hace que dos administradores
 *    levantando a la vez produzcan un levantamiento y no dos: el segundo no
 *    encuentra fila y devuelve `false`. Con la comprobación previa en el
 *    código, los dos la pasarían.
 * 2. **El motivo de levantamiento es obligatorio en la base**, no aquí: la
 *    restricción `listas_negras_levantamiento_completo` de la migración `0005`
 *    lo exige junto con el autor y el momento. El adaptador se limita a
 *    cumplirla.
 * 3. **`activasDe` devuelve lo que el motor necesita en una sola consulta.**
 *    Es lo que se llama en cada decisión de acceso: una consulta por entrada
 *    sería el N+1 que §2.4 prohíbe, justo en el camino más caliente.
 */
@Injectable()
export class RepositorioListaNegraPg implements RepositorioListaNegra {
  constructor(
    private readonly pool: Pool,
    private readonly claims: Record<string, unknown> = {},
  ) {}

  private async conContexto<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claims),
      ]);
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }

  private static readonly CAMPOS = `
       id, copropiedad_id, persona_id, placa, motivo,
       creado_por, levantada_por, levantada_en`;

  private static aEntrada(f: {
    id: string;
    copropiedad_id: string;
    persona_id: string | null;
    placa: string | null;
    motivo: string;
    creado_por: string;
    levantada_por: string | null;
    levantada_en: Date | null;
  }): EntradaListaNegra {
    return {
      id: f.id,
      copropiedadId: f.copropiedad_id,
      personaId: f.persona_id,
      placa: f.placa,
      motivo: f.motivo,
      creadaPor: f.creado_por,
      levantadaPor: f.levantada_por,
      levantadaEn: f.levantada_en,
    };
  }

  async crear(entrada: Omit<EntradaListaNegra, 'levantadaPor' | 'levantadaEn'>): Promise<void> {
    await this.conContexto(async (c) => {
      await c.query(
        `INSERT INTO public.listas_negras
           (id, copropiedad_id, persona_id, placa, motivo, estado,
            creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, 'activa', $6, $6)`,
        [
          entrada.id,
          entrada.copropiedadId,
          entrada.personaId,
          entrada.placa,
          entrada.motivo,
          entrada.creadaPor,
        ],
      );
    });
  }

  async porId(copropiedadId: string, id: string): Promise<EntradaListaNegra | null> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query(
        `SELECT ${RepositorioListaNegraPg.CAMPOS}
           FROM public.listas_negras
          WHERE copropiedad_id = $1 AND id = $2`,
        [copropiedadId, id],
      );
      const fila = rows[0];
      return fila === undefined ? null : RepositorioListaNegraPg.aEntrada(fila);
    });
  }

  async levantar(
    copropiedadId: string,
    id: string,
    actorId: string,
    ahora: Date,
  ): Promise<boolean> {
    return this.conContexto(async (c) => {
      const { rowCount } = await c.query(
        `UPDATE public.listas_negras
            SET estado = 'levantada',
                levantada_en = $4,
                levantada_por = $3,
                motivo_levantamiento = COALESCE(motivo_levantamiento, 'Levantada desde la consola'),
                actualizado_por = $3
          WHERE copropiedad_id = $1
            AND id = $2
            AND estado = 'activa'`,
        [copropiedadId, id, actorId, ahora],
      );
      // `false` cuando ya estaba levantada o no existe: dos administradores a la
      // vez producen un levantamiento, no dos.
      return (rowCount ?? 0) > 0;
    });
  }

  async activasDe(copropiedadId: string): Promise<readonly EntradaListaNegra[]> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query(
        `SELECT ${RepositorioListaNegraPg.CAMPOS}
           FROM public.listas_negras
          WHERE copropiedad_id = $1 AND estado = 'activa'
          ORDER BY creado_en DESC`,
        [copropiedadId],
      );
      return rows.map((f) => RepositorioListaNegraPg.aEntrada(f));
    });
  }
}
