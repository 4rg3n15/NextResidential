import type { Pool } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type {
  IdsPorResolver,
  NombresDeEventos,
  PersonaDelEvento,
  ResolutorDeNombres,
} from '../aplicacion/nombres-de-eventos';
import { SIN_NOMBRES } from '../aplicacion/nombres-de-eventos';

/**
 * D-145 · tres consultas por lotes (`= ANY($2::uuid[])`), parametrizadas
 * (§2.7.4), en una transacción de sólo lectura con los claims de servicio de
 * la copropiedad: la RLS es la segunda barrera y el `copropiedad_id` explícito
 * la primera, también para el operador (ver `OPERADORES`).
 */
const PERSONAS = `
SELECT p.id, p.nombre_completo AS nombre,
       EXISTS (SELECT 1 FROM public.residentes r
                WHERE r.copropiedad_id = $1 AND r.persona_id = p.id) AS es_residente
  FROM public.personas p
 WHERE p.copropiedad_id = $1 AND p.id = ANY($2::uuid[])`;

const VIVIENDAS = `
SELECT v.id, v.identificador AS nombre
  FROM public.viviendas v
 WHERE v.copropiedad_id = $1 AND v.id = ANY($2::uuid[])`;

/**
 * El operador puede no ser de la copropiedad: el de central la atiende por una
 * asignación en `roles_usuario`, y el superadministrador no tiene copropiedad.
 * Se nombra a quien es de ella o tiene o tuvo un rol en ella, y a los
 * superadministradores; lo mismo que deja leer la RLS del servicio (0060).
 */
const OPERADORES = `
SELECT u.id, u.nombre
  FROM public.usuarios u
 WHERE u.id = ANY($2::uuid[])
   AND (u.copropiedad_id = $1
        OR EXISTS (SELECT 1 FROM public.roles_usuario r
                    WHERE r.usuario_id = u.id
                      AND (r.copropiedad_id = $1 OR r.rol = 'superadministrador')))`;

export class ResolutorDeNombresPg implements ResolutorDeNombres {
  constructor(private readonly pool: Pool) {}

  async resolver(copropiedadId: string, ids: IdsPorResolver): Promise<NombresDeEventos> {
    if (ids.personas.length + ids.viviendas.length + ids.operadores.length === 0) {
      return SIN_NOMBRES;
    }
    return conCliente(this.pool, async (cliente) => {
      try {
        await cliente.query('BEGIN READ ONLY');
        await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [
          JSON.stringify(claimsDeServicio(copropiedadId)),
        ]);
        const consultar = async <F>(sql: string, lista: readonly string[]): Promise<F[]> =>
          lista.length === 0
            ? []
            : ((await cliente.query(sql, [copropiedadId, [...new Set(lista)]])).rows as F[]);
        const personas = await consultar<{ id: string; nombre: string; es_residente: boolean }>(
          PERSONAS,
          ids.personas,
        );
        const viviendas = await consultar<{ id: string; nombre: string }>(VIVIENDAS, ids.viviendas);
        const operadores = await consultar<{ id: string; nombre: string }>(
          OPERADORES,
          ids.operadores,
        );
        await cliente.query('COMMIT');
        return {
          personas: new Map<string, PersonaDelEvento>(
            personas.map((p) => [
              p.id,
              { nombre: p.nombre, clase: p.es_residente ? 'residente' : 'visitante' },
            ]),
          ),
          viviendas: new Map(viviendas.map((v) => [v.id, v.nombre])),
          operadores: new Map(operadores.map((o) => [o.id, o.nombre])),
        };
      } catch (error) {
        await cliente.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  }
}
