import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type { FaceTemplateProvider } from '@ncr/domain-core';
import type { RepositorioPlantillas } from '../../src/biometria/aplicacion/puertos';

/** La terminal facial espía de `biometria-pg`: anota lo que recibe y lo que retira. */
export class TerminalEspia implements FaceTemplateProvider {
  readonly recibidas: string[] = [];
  readonly retiradas: string[] = [];
  bytes: Uint8Array | null = null;
  async sincronizar(dispositivoId: string, plantillaId: string, plantilla: Uint8Array) {
    this.bytes = plantilla;
    this.recibidas.push(`${dispositivoId}/${plantillaId}`);
  }
  async suprimir(dispositivoId: string, plantillaId: string) {
    this.retiradas.push(`${dispositivoId}/${plantillaId}`);
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-S5 · DT-15M-C01 · EL BARRIDO DE UNA PRUEBA BARRE LO SUYO
 *
 * `BarrerPlantillasVencidas` suprime TODO lo vencido de la copropiedad, y
 * `biometria-pg` barre COP_A con el reloj DOS HORAS por delante. Suprimía así,
 * a mitad de su prueba, la plantilla de una visita de `visitas-pg` (vence a los
 * 115 minutos) y las de AYER de `verificacion-remota-armada-pg`.
 *
 * El repositorio sigue siendo el real y la consulta de `vencidas` la de
 * PostgreSQL: de su resultado sólo se descarta lo que esta corrida no capturó.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const soloLasPropias = (
  repo: RepositorioPlantillas,
  propias: ReadonlySet<string>,
): RepositorioPlantillas => {
  const acotado: RepositorioPlantillas = Object.create(repo) as RepositorioPlantillas;
  acotado.vencidas = async (copropiedadId, ahora) =>
    (await repo.vencidas(copropiedadId, ahora)).filter((p) => propias.has(p.id));
  return acotado;
};

/**
 * La interferencia, fija: la plantilla de «otro fichero» que vence dentro de
 * `minutos`, activa y con su consentimiento vigente, como la de una visita.
 */
export const ajenaQueVence = async (
  superusuario: Pool,
  copropiedadId: string,
  minutos: number,
): Promise<string> => {
  const actor = '00000000-0000-4000-8000-000000000002';
  const { rows } = await superusuario.query<{ id: string }>(
    `WITH p AS (
       INSERT INTO public.personas (copropiedad_id, tipo_documento, numero_documento,
                                    nombre_completo, creado_por, actualizado_por)
       VALUES ($1, 'cedula', $2, 'Visita de otro fichero', $3, $3) RETURNING id
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
            'AES-256-GCM', now() + $4 * interval '1 minute', now(), 'activa', $3, $3 FROM c
     RETURNING id`,
    [copropiedadId, `AJE${randomBytes(4).toString('hex').toUpperCase()}`, actor, minutos],
  );
  return rows[0]?.id ?? '';
};
