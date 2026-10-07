import type { Pool, PoolClient } from 'pg';
import type {
  PedidoDePrimerIngreso,
  PrimerIngreso,
  PrimerIngresoEscrito,
} from '../aplicacion/puertos-del-primer-ingreso';
import { Deshacer, comoServicio, deshaciendo, violacion } from './con-identidad';
import { personaDeLaCuenta, residenteEnLaVivienda } from './persona-del-residente-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PRIMER INGRESO CONTRA POSTGRESQL · RONDA 15-W (D3)
 *
 * La API escribe como SERVICIO de la copropiedad con la propia cuenta como
 * actor, en una transacción y con el MISMO bloqueo por vivienda que la
 * vinculación (`ncr:vinculacion:<vivienda>`): bajo él se vuelve a comprobar que
 * la vivienda sigue asignada a esta cuenta —titular de su ocupación o dueña de
 * una plaza viva— antes de escribir nada. La base repite lo que importa: la
 * cuenta no se ata a un menor (`tg_cuenta_solo_mayores`, 0055).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SQL_SIGUE_ASIGNADA = `
  SELECT 1 FROM public.viviendas v
   WHERE v.id = $3 AND v.copropiedad_id = $1 AND v.estado = 'activo'
     AND (($4::boolean AND EXISTS (SELECT 1 FROM public.ocupacion_de_viviendas o
                                    WHERE o.vivienda_id = v.id AND o.primer_residente_id = $2))
       OR (NOT $4::boolean AND EXISTS (SELECT 1 FROM public.plazas_de_ocupante p
                                        WHERE p.vivienda_id = v.id AND p.usuario_id = $2
                                          AND p.estado = 'activo')))`;

export class PrimerIngresoPg implements PrimerIngreso {
  constructor(private readonly pool: Pool) {}

  async completar(p: PedidoDePrimerIngreso): Promise<PrimerIngresoEscrito> {
    try {
      return await deshaciendo(() =>
        comoServicio(this.pool, p.copropiedadId, p.usuarioId, (c) => this.enTransaccion(c, p)),
      );
    } catch (e) {
      const { codigo, restriccion } = violacion(e);
      if (
        codigo === '23505' &&
        (restriccion === 'personas_documento_uk' || restriccion === 'residentes_persona_uk')
      ) {
        return { ok: false, motivo: 'DOCUMENTO_EN_USO' };
      }
      throw e;
    }
  }

  private async enTransaccion(
    c: PoolClient,
    p: PedidoDePrimerIngreso,
  ): Promise<PrimerIngresoEscrito> {
    const v = [p.copropiedadId, p.usuarioId, p.viviendaId];
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended('ncr:vinculacion:' || $1, 0))`, [
      p.viviendaId,
    ]);
    const sigue = await c.query(SQL_SIGUE_ASIGNADA, [...v, p.comoTitular]);
    if ((sigue.rowCount ?? 0) === 0) {
      throw new Deshacer<PrimerIngresoEscrito>({ ok: false, motivo: 'SIN_VIVIENDA' });
    }
    const personaId = await personaDeLaCuenta(c, p);
    if (personaId === null) {
      throw new Deshacer<PrimerIngresoEscrito>({ ok: false, motivo: 'DOCUMENTO_EN_USO' });
    }
    const residenteId = await residenteEnLaVivienda(c, p, personaId, p.comoTitular);
    // La cuenta, atada a su persona; su nombre visible deja de ser el usuario (S-15W-07).
    await c.query(
      `UPDATE public.usuarios SET persona_id = $2, nombre = left($3, 200) WHERE id = $1`,
      [p.usuarioId, personaId, `${p.perfil.nombres} ${p.perfil.apellidos}`],
    );
    await c.query(
      `INSERT INTO public.bitacora_de_residentes
         (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, vivienda_id, detalle, creado_por)
       VALUES ($1, $4, 'vinculacion', $2, $2, $3, $5, $2)`,
      [...v, p.ahora, p.comoTitular ? 'primer ingreso del titular' : 'primer ingreso por su plaza'],
    );
    return { ok: true, residenteId };
  }

  async bloquearPorEdad(copropiedadId: string, usuarioId: string, ahora: Date): Promise<void> {
    await comoServicio(this.pool, copropiedadId, usuarioId, async (c) => {
      const motivo = 'cuenta bloqueada por edad: las cuentas son para mayores de edad (D-W2)';
      await c.query(
        `UPDATE public.usuarios
            SET estado = 'inactivo', desactivado_en = $3, desactivado_por = $2,
                motivo_desactivacion = $4
          WHERE id = $2 AND copropiedad_id = $1 AND estado = 'activo'`,
        [copropiedadId, usuarioId, ahora, motivo],
      );
      await c.query(
        `UPDATE public.roles_usuario
            SET estado = 'inactivo', desactivado_en = $3, desactivado_por = $2,
                motivo_desactivacion = $4
          WHERE usuario_id = $2 AND copropiedad_id = $1 AND estado = 'activo'`,
        [copropiedadId, usuarioId, ahora, motivo],
      );
      // Su plaza vuelve a estar libre, con otro código (la generación sube).
      await c.query(
        `UPDATE public.plazas_de_ocupante
            SET usuario_id = NULL, usada_en = NULL, generacion = generacion + 1
          WHERE usuario_id = $2 AND copropiedad_id = $1 AND estado = 'activo'`,
        [copropiedadId, usuarioId],
      );
      await c.query(
        `INSERT INTO public.bitacora_de_residentes
           (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, creado_por)
         VALUES ($1, $3, 'cuenta_bloqueada_por_edad', $2, $2, $2)`,
        [copropiedadId, usuarioId, ahora],
      );
    });
  }
}
