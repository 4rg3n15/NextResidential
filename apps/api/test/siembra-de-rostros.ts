import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { COP_A } from './utilidades';
import { conVehiculoSinDueno } from './vehiculo-sin-dueno';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-S5 · LO QUE SIEMBRA LA PARIDAD DE ROSTROS, Y LA INTERFERENCIA QUE LA ROMPÍA
 *
 * Sale de `edge-misma-decision-pg.e2e.test.ts`, que estaba en 299 líneas y no
 * podía crecer. La paridad de rostros comparaba TODAS las plantillas de COP_A,
 * también las que otros ficheros crean y revocan en paralelo: `biometria-pg`
 * revoca la suya entre la instantánea del Edge y la lectura de la nube, y el Edge
 * decía «permitido» donde la nube decía «negado» (CI del PR #54, 2026-10-08).
 * `revocarConsentimientoDe` es esa interferencia, hecha a propósito y siempre en
 * el mismo instante.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const ACTOR = '00000000-0000-4000-8000-000000000002';

/**
 * Una persona de ESTA corrida con consentimiento vigente y plantilla activa y
 * sincronizada: el camino del rostro RECONOCIBLE, que la semilla no garantiza.
 */
export const sembrarRostroReconocible = async (url: string): Promise<string> => {
  const pool = await conVehiculoSinDueno(new Pool({ connectionString: url, max: 1 }));
  try {
    const { rows } = await pool.query<{ id: string }>(
      `WITH p AS (
         INSERT INTO public.personas (copropiedad_id, tipo_documento, numero_documento,
                                      nombre_completo, creado_por, actualizado_por)
         VALUES ($1, 'cedula', $2, 'Paridad de rostro', $3, $3) RETURNING id
       ), c AS (
         INSERT INTO public.consentimientos_biometricos (copropiedad_id, persona_id,
                version_politica, canal, estado, otorgado_en, creado_por, actualizado_por)
         SELECT $1, p.id, 'v1.0', 'presencial', 'vigente', now(), $3, $3 FROM p
         RETURNING id, persona_id
       )
       INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id,
              calidad, vector_cifrado, llave_ref, algoritmo, suprimir_en, sincronizada_en,
              estado, creado_por, actualizado_por)
       SELECT $1, c.persona_id, c.id, 0.9, '\\x0102'::bytea, 'vault:ncr/plantillas/v1',
              'AES-256-GCM', now() + interval '1 day', now(), 'activa', $3, $3 FROM c
       RETURNING id`,
      [COP_A, `PAR${randomBytes(4).toString('hex').toUpperCase()}`, ACTOR],
    );
    return rows[0]?.id ?? '';
  } finally {
    await pool.end();
  }
};

/**
 * 15-X · D1 · tres RESIDENTES con rostro de esta corrida, cada uno con su
 * motivo. Antes de la 15-X los tres salían FALLO_TECNICO en los dos lados:
 * iguales, y la comparación no probaba nada. Devuelve la plantilla de cada uno.
 */
export type MotivoDeResidente = 'PERMITIDO' | 'SIN_CONSENTIMIENTO' | 'LISTA_NEGRA';
export const sembrarResidenteConRostro = async (
  url: string,
  motivo: MotivoDeResidente,
): Promise<string> => {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query<{ id: string }>(
      `WITH p AS (
         INSERT INTO public.personas (copropiedad_id, tipo_documento, numero_documento,
                                      nombre_completo, creado_por, actualizado_por)
         VALUES ($1, 'cedula', $2, 'Residente con rostro', $3, $3) RETURNING id
       ), r AS (
         INSERT INTO public.residentes (copropiedad_id, vivienda_id, persona_id, creado_por,
                                        actualizado_por)
         SELECT $1, '30000000-0000-4000-8000-000000000001', p.id, $3, $3 FROM p
         RETURNING persona_id
       ), v AS (
         INSERT INTO public.listas_negras (copropiedad_id, persona_id, motivo, creado_por,
                                           actualizado_por)
         SELECT $1, r.persona_id, 'Paridad 15-X', $3, $3 FROM r WHERE $4 = 'LISTA_NEGRA'
         RETURNING persona_id
       ), c AS (
         INSERT INTO public.consentimientos_biometricos (copropiedad_id, persona_id,
                version_politica, canal, estado, otorgado_en, creado_por, actualizado_por)
         SELECT $1, r.persona_id, 'v1.0', 'presencial',
                CASE WHEN $4 = 'SIN_CONSENTIMIENTO' THEN 'pendiente' ELSE 'vigente' END::estado_consentimiento,
                CASE WHEN $4 = 'SIN_CONSENTIMIENTO' THEN NULL ELSE now() END, $3, $3 FROM r
         RETURNING id, persona_id
       )
       INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id,
              calidad, vector_cifrado, llave_ref, algoritmo, suprimir_en, sincronizada_en,
              estado, creado_por, actualizado_por)
       SELECT $1, c.persona_id, c.id, 0.9, '\\x0102'::bytea, 'vault:ncr/plantillas/v1',
              'AES-256-GCM', now() + interval '1 day',
              CASE WHEN $4 = 'SIN_CONSENTIMIENTO' THEN NULL ELSE now() END,
              CASE WHEN $4 = 'SIN_CONSENTIMIENTO' THEN 'pendiente_consentimiento'
                   ELSE 'activa' END::estado_plantilla, $3, $3 FROM c
       RETURNING id`,
      [COP_A, `RES${randomBytes(4).toString('hex').toUpperCase()}`, ACTOR, motivo],
    );
    return rows[0]?.id ?? '';
  } finally {
    await pool.end();
  }
};

export const sembrarResidentesConRostro = async (
  url: string,
): Promise<Record<MotivoDeResidente, string>> => ({
  PERMITIDO: await sembrarResidenteConRostro(url, 'PERMITIDO'),
  SIN_CONSENTIMIENTO: await sembrarResidenteConRostro(url, 'SIN_CONSENTIMIENTO'),
  LISTA_NEGRA: await sembrarResidenteConRostro(url, 'LISTA_NEGRA'),
});

/**
 * La interferencia de `biometria-pg`: revocar el consentimiento de una plantilla,
 * como hace su `beforeAll` con los que encuentra vigentes. Desde ese instante la
 * nube niega ese rostro; una instantánea tomada antes todavía lo reconoce.
 */
export const revocarConsentimientoDe = async (url: string, plantillaId: string): Promise<void> => {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const { rowCount } = await pool.query(
      `UPDATE public.consentimientos_biometricos c
          SET estado = 'revocado', revocado_en = now(), actualizado_en = now(),
              actualizado_por = $3
         FROM public.plantillas_biometricas p
        WHERE p.copropiedad_id = $1 AND p.id = $2
          AND c.copropiedad_id = p.copropiedad_id AND c.id = p.consentimiento_id
          AND c.estado = 'vigente'`,
      [COP_A, plantillaId, ACTOR],
    );
    if (rowCount !== 1) throw new Error(`la interferencia no revocó nada (${String(rowCount)})`);
  } finally {
    await pool.end();
  }
};
