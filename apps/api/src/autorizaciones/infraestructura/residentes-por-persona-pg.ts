import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type { ResidenteResuelto, ResidentesPorPersona } from '../aplicacion/residentes-por-persona';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D1 · EL RESIDENTE DE UNA PERSONA, LEÍDO UNA VEZ PARA LOS DOS CAMINOS
 *
 * Un modelo de LECTURA del padrón, como `FuenteDeReglasPg` (15-Q): no escribe
 * ni rehidrata el agregado `Vivienda`; dice lo que el motor necesita para el
 * derecho del residente. La nube lo pide para la persona de un rostro y la
 * instantánea del Edge para las personas con plantilla: la MISMA sentencia,
 * con la misma elección de fila, porque RN-16 se rompe en silencio el día que
 * las dos lecturas difieren.
 *
 * Qué fila: con S-08 hay a lo sumo un residente ACTIVO por persona; si no lo
 * hay, el de la baja más reciente (su derecho venció en ella). La baja es la
 * PRIMERA de las tres que lo cortan: la del residente, la de la persona o la de
 * la vivienda (`LEAST` ignora los nulos). La copropiedad va SIEMPRE en el
 * filtro, además de la RLS: esta lectura corre con identidad de servicio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const RESIDENTES_DE_PERSONAS = `
  SELECT DISTINCT ON (r.persona_id)
         r.id AS residente_id, r.persona_id, r.vivienda_id,
         vi.estado::text AS vivienda_estado, r.creado_en,
         LEAST(r.desactivado_en, pe.desactivado_en,
               CASE WHEN vi.estado = 'inactivo' THEN vi.desactivado_en END) AS baja_en
    FROM public.residentes r
    JOIN public.viviendas vi
      ON vi.copropiedad_id = r.copropiedad_id AND vi.id = r.vivienda_id
    JOIN public.personas pe
      ON pe.copropiedad_id = r.copropiedad_id AND pe.id = r.persona_id
   WHERE r.copropiedad_id = $1 AND r.persona_id = ANY($2::uuid[])
   ORDER BY r.persona_id, (r.estado = 'activo') DESC, r.desactivado_en DESC NULLS FIRST,
            r.creado_en DESC`;

interface FilaDeResidente {
  readonly residente_id: string;
  readonly persona_id: string;
  readonly vivienda_id: string;
  readonly vivienda_estado: string;
  readonly creado_en: Date;
  readonly baja_en: Date | null;
}

/** La lectura compartida: un residente por persona, de las que se piden. */
export const residentesDePersonasEn = async (
  c: PoolClient,
  copropiedadId: string,
  personaIds: readonly string[],
): Promise<ResidenteResuelto[]> => {
  if (personaIds.length === 0) return [];
  const { rows } = await c.query<FilaDeResidente>(RESIDENTES_DE_PERSONAS, [
    copropiedadId,
    [...personaIds],
  ]);
  return rows.map((f) => ({
    residenteId: f.residente_id,
    personaId: f.persona_id,
    viviendaId: f.vivienda_id,
    viviendaActiva: f.vivienda_estado === 'activo',
    registradoEn: f.creado_en,
    bajaEn: f.baja_en,
  }));
};

/** Un identificador que no es un UUID no es una persona del padrón: no se pregunta. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ResidentesPorPersonaPg implements ResidentesPorPersona {
  constructor(private readonly pool: Pool) {}

  async resolver(copropiedadId: string, personaId: string): Promise<ResidenteResuelto | null> {
    if (!UUID.test(personaId)) return null;
    return conCliente(this.pool, async (c) => {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      const [residente] = await residentesDePersonasEn(c, copropiedadId, [personaId]);
      return residente ?? null;
    });
  }
}
