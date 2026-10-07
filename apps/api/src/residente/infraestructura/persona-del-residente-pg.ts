import type { PoolClient } from 'pg';
import type { PerfilValido } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA PERSONA Y EL RESIDENTE DE UNA CUENTA · ETAPA 15-I · RONDA 15-W
 *
 * Lo comparten el primer ingreso (15-W, D3: la cuenta ya trae su vivienda) y el
 * cambio de vivienda (3.5, con código). Sale de `alta-pg.ts` sin cambiar una
 * línea de su lógica: antes eran dos métodos privados de allí.
 *
 * La persona se busca por su documento. Si ya existe —estaba en el padrón— se
 * REUTILIZA sólo si está libre: sin otra cuenta vinculada y sin ser residente
 * de otra vivienda. Si no, `null` (DOCUMENTO_EN_USO): nadie se apropia de la
 * ficha de otro escribiendo su cédula.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface CuentaQueSeVincula {
  readonly copropiedadId: string;
  readonly usuarioId: string;
  readonly viviendaId: string;
  readonly perfil: PerfilValido;
}

/** `null` = el documento es de otra persona que no está libre. */
export const personaDeLaCuenta = async (
  c: PoolClient,
  p: CuentaQueSeVincula,
): Promise<string | null> => {
  const d = p.perfil;
  const { rows: mia } = await c.query<{ persona_id: string | null }>(
    'SELECT persona_id FROM public.usuarios WHERE id = $1',
    [p.usuarioId],
  );
  const propia = mia[0]?.persona_id ?? null;
  const { rows: delDocumento } = await c.query<{ id: string; libre: boolean }>(
    `SELECT p.id,
            NOT EXISTS (SELECT 1 FROM public.usuarios u
                         WHERE u.persona_id = p.id AND u.id <> $4 AND u.estado = 'activo')
        AND NOT EXISTS (SELECT 1 FROM public.residentes r
                         WHERE r.persona_id = p.id AND r.estado = 'activo' AND r.vivienda_id <> $5
                           AND p.id IS DISTINCT FROM $6::uuid) AS libre
       FROM public.personas p
      WHERE p.copropiedad_id = $1 AND p.tipo_documento = $2::tipo_documento
        AND p.numero_documento = $3 AND p.estado = 'activo'`,
    [p.copropiedadId, d.tipoDocumento, d.numeroDocumento, p.usuarioId, p.viviendaId, propia],
  );
  const existente = delDocumento[0];
  if (existente !== undefined && existente.id !== propia && !existente.libre) return null;
  const personaId = existente?.id ?? propia;
  const valores = [
    d.tipoDocumento,
    d.numeroDocumento,
    `${d.nombres} ${d.apellidos}`.slice(0, 200),
    d.nombres,
    d.apellidos,
    d.fechaNacimiento,
    d.telefono,
    d.correo,
  ];
  if (personaId === null) {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO public.personas
         (copropiedad_id, tipo_documento, numero_documento, nombre_completo, nombres, apellidos,
          fecha_nacimiento, telefono, correo, creado_por, actualizado_por)
       VALUES ($1, $2::tipo_documento, $3, $4, $5, $6, $7::date, $8, $9, $10, $10)
       RETURNING id`,
      [p.copropiedadId, ...valores, p.usuarioId],
    );
    return rows[0]?.id ?? null;
  }
  await c.query(
    `UPDATE public.personas
        SET tipo_documento = $2::tipo_documento, numero_documento = $3, nombre_completo = $4,
            nombres = $5, apellidos = $6, fecha_nacimiento = $7::date, telefono = $8,
            correo = coalesce($9, correo)
      WHERE id = $1`,
    [personaId, ...valores],
  );
  return personaId;
};

/** El residente de esa persona en ESA vivienda: el que ya hay, o uno nuevo. */
export const residenteEnLaVivienda = async (
  c: PoolClient,
  p: CuentaQueSeVincula,
  personaId: string,
  esTitular: boolean,
): Promise<string> => {
  const { rows: ya } = await c.query<{ id: string }>(
    `SELECT id FROM public.residentes
      WHERE persona_id = $1 AND vivienda_id = $2 AND estado = 'activo'`,
    [personaId, p.viviendaId],
  );
  if (ya[0] !== undefined) return ya[0].id;
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO public.residentes
       (copropiedad_id, vivienda_id, persona_id, es_titular, nivel_acceso_id, creado_por, actualizado_por)
     VALUES ($1, $2, $3, $4,
             (SELECT n.id FROM public.niveles_acceso n
               WHERE n.copropiedad_id = $1 AND n.estado = 'activo' AND n.permite_autorizar
               ORDER BY n.orden LIMIT 1),
             $5, $5)
     RETURNING id`,
    [p.copropiedadId, p.viviendaId, personaId, esTitular, p.usuarioId],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('el alta de residente no devolvió identificador');
  return id;
};
