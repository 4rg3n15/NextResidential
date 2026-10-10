import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type { FaceTemplateProvider } from '@ncr/domain-core';

/** Lo que `visitas-pg` necesita para generar visitas con foto (fuera del fichero en la 15-S5). */
/**
 * El equipo que rechaza: la respuesta de la terminal real cuando el cuerpo no
 * le cuadra (H-SITIO, anexo 15-K) — un 400 con su `subStatusCode`.
 */
export const RESPUESTA_400 = 'la terminal respondió 400 (badJsonContent)';

export class TerminalesSimuladas implements FaceTemplateProvider {
  readonly recibidas: string[] = [];
  readonly retiradas: string[] = [];
  readonly rechazan = new Set<string>();
  async sincronizar(dispositivoId: string, plantillaId: string): Promise<void> {
    if (this.rechazan.has(dispositivoId)) throw new Error(RESPUESTA_400);
    this.recibidas.push(`${dispositivoId}/${plantillaId}`);
  }
  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    this.retiradas.push(`${dispositivoId}/${plantillaId}`);
  }
}

/** Un JPEG mínimo: los bytes de cabecera y de cierre que el tipo real exige. */
export const jpeg = (): string =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    randomBytes(96),
    Buffer.from([0xff, 0xd9]),
  ]).toString('base64');

export const MEDIDAS_BUENAS = {
  rostrosDetectados: 1,
  nitidez: 0.9,
  iluminacion: 0.6,
  proporcionRostro: 0.4,
};

/**
 * 15-S5 · DT-15M-C01 · UN HOGAR PROPIO EN COP_A: vivienda, titular y su cuenta
 * de residente con nivel «completo» (puede autorizar). La app del residente lista las 200 autorizaciones de SU vivienda
 * de inicio más reciente, y la del residente de la semilla (C-42) acumula las
 * de todas las corridas —las que empiezan en el futuro, por encima—: la visita
 * de la prueba dejaba de salir (interferencia `autorizaciones-futuras`).
 */
export const hogarPropio = async (superusuario: Pool, sufijo: string): Promise<string> => {
  const actor = '00000000-0000-4000-8000-000000000002';
  const { rows } = await superusuario.query<{ id: string }>(
    `WITH v AS (
       INSERT INTO public.viviendas (copropiedad_id, identificador, agrupacion, creado_por, actualizado_por)
       VALUES ($1, $2, '3i', $3, $3) RETURNING id
     ), p AS (
       INSERT INTO public.personas (copropiedad_id, tipo_documento, numero_documento,
                                    nombre_completo, creado_por, actualizado_por)
       VALUES ($1, 'cedula', $2, 'Residente 3i', $3, $3) RETURNING id
     ), r AS (
       INSERT INTO public.residentes (copropiedad_id, vivienda_id, persona_id, es_titular,
                                     nivel_acceso_id, creado_por, actualizado_por)
       SELECT $1, v.id, p.id, true, n.id, $3, $3
         FROM v, p, public.niveles_acceso n
        WHERE n.copropiedad_id = $1 AND n.clave = 'completo'
       RETURNING persona_id
     ), u AS (
       INSERT INTO public.usuarios (copropiedad_id, auth_user_id, correo, nombre, persona_id,
                                    creado_por, actualizado_por)
       SELECT $1, gen_random_uuid(), lower($2) || '@3i.invalid', 'Residente 3i', r.persona_id, $3, $3
         FROM r RETURNING id
     )
     INSERT INTO public.roles_usuario (copropiedad_id, usuario_id, rol, creado_por, actualizado_por)
     SELECT $1, u.id, 'residente', $3, $3 FROM u RETURNING usuario_id AS id`,
    [
      '10000000-0000-4000-8000-000000000001',
      `H3I${sufijo}${randomBytes(2).toString('hex').toUpperCase()}`,
      actor,
    ],
  );
  return rows[0]?.id ?? '';
};
