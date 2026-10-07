import type { PlantillaBiometrica } from '@ncr/domain-core';

/**
 * 15-X · la fila de una plantilla, escrita igual por los dos que la insertan:
 * `RepositorioPlantillasPg.guardar` (con su `ON CONFLICT` de ciclo de vida) y
 * el reemplazo del rostro de un residente (`ReemplazoDeRostroPg`, en su
 * transacción). Lo que identifica la plantilla sólo se escribe al nacer.
 *
 * `suprimir_en` con margen: el CHECK `plantillas_supresion_acotada` exige que
 * sea POSTERIOR a la creación, y en el mismo milisegundo serían iguales.
 */
export const INSERTAR_PLANTILLA = `INSERT INTO public.plantillas_biometricas
           (id, copropiedad_id, persona_id, consentimiento_id, autorizacion_id, calidad,
            suprimir_en, creado_en, sincronizada_en, suprimida_en, estado,
            creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $6,
                 GREATEST($7::timestamptz, $8::timestamptz + interval '1 millisecond'),
                 $8, $9, $10, $11, $12, $12)`;

export const parametrosDePlantilla = (plantilla: PlantillaBiometrica, actorId: string) => [
  plantilla.id,
  plantilla.copropiedadId,
  plantilla.titularId,
  plantilla.consentimientoId,
  plantilla.autorizacionId,
  plantilla.calidad.valor,
  plantilla.suprimirEn,
  plantilla.creadoEn,
  plantilla.sincronizadaEn,
  plantilla.suprimidaEn,
  plantilla.estado,
  actorId,
];
