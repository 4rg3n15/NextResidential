import type { ConsentimientoBiometrico } from '@ncr/domain-core';

/**
 * 15-X · la fila de un consentimiento, escrita igual por los dos que la
 * guardan: `RepositorioConsentimientosPg.guardar` y el alta del rostro de un
 * residente (`ReemplazoDeRostroPg`), que la mete en la MISMA transacción que su
 * plantilla para que una no quede sin la otra.
 *
 * Alta o cambio de estado en UNA sentencia: la fila nace `pendiente` en la
 * captura y la misma llamada la lleva a `vigente`, `rechazado`, `revocado` o
 * `expirado`. Lo que NO cambia nunca tras nacer —titular, finalidad, versión,
 * canal, solicitado_en— no está en el `UPDATE`, así que tampoco puede cambiar
 * por un descuido del llamador.
 *
 * F4 (15-L) · el ORIGEN sí se actualiza: una declaración que el titular
 * confirma en persona pasa a ser suya. Quién la declaró, no: se escribe al
 * nacer y se conserva.
 */
export const GUARDAR_CONSENTIMIENTO = `INSERT INTO public.consentimientos_biometricos
           (id, copropiedad_id, persona_id, finalidad, version_politica, canal, solicitado_en,
            otorgado_en, revocado_en, evidencia_id, estado, origen, declarado_por,
            creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $13, $14, $12, $12)
         ON CONFLICT (id) DO UPDATE SET
           origen          = EXCLUDED.origen,
           otorgado_en     = EXCLUDED.otorgado_en,
           revocado_en     = EXCLUDED.revocado_en,
           evidencia_id    = EXCLUDED.evidencia_id,
           estado          = EXCLUDED.estado,
           actualizado_en  = now(),
           actualizado_por = EXCLUDED.actualizado_por`;

export const parametrosDeConsentimiento = (c: ConsentimientoBiometrico, actorId: string) => [
  c.id,
  c.copropiedadId,
  c.titularId,
  c.finalidad,
  c.versionPolitica,
  c.canal,
  c.solicitadoEn,
  c.otorgadoEn,
  c.revocadoEn,
  c.evidenciaId,
  c.estado,
  actorId,
  c.origen,
  c.declaradoPor,
];
