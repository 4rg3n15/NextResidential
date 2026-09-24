import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Placa, esExito, esFallo } from '@ncr/domain-core';
import type { GeneradorDeId, PlanDeGeneracion, Reloj } from '@ncr/domain-core';
import { RepositorioPadronPg } from '../src/padron/infraestructura/repositorio-pg';
import { GenerarViviendas } from '../src/padron/aplicacion/generar-viviendas';
import { BorrarVehiculoDefinitivamente } from '../src/padron/aplicacion/casos-de-uso';
import { RepositorioAutorizacionesPg } from '../src/autorizaciones/infraestructura/repositorio-autorizaciones-pg';
import { CrearAutorizacion } from '../src/autorizaciones/aplicacion/casos-de-uso';
import type { ContextoTenant } from '../src/autenticacion/dominio/claims';

/**
 * O3 · lo que la consola necesita del padrón, contra base real:
 *
 *  · regenerar con `conservar` (no toca lo que existe) y `sobrescribir`
 *    (reactiva lo dado de baja, y NUNCA borra ni renombra: RN-19);
 *  · editar una vivienda y un vehículo;
 *  · borrar DEFINITIVAMENTE un vehículo sólo si no tiene historial, y que lo
 *    garantice el disparador de la base (0034), no el código.
 *
 * Se OMITE si no hay base, y lo dice.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';
const VIVIENDA_CON_TITULAR = '30000000-0000-4000-8000-000000000001';
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();

let pool: Pool | undefined;
let disponible = false;
let actorId = '';
let personaId = '';

const ctx = (): ContextoTenant => ({
  usuarioId: actorId,
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});

// Sin agrupación y numerado por piso: 101, 102, 103 con agrupación NULA, que
// no choca con la suite de generación (agrupaciones «1», «2», «3»).
const PLAN: PlanDeGeneracion = { agrupaciones: 0, estilo: 'numeros', cantidad: 3, porPiso: 4 };
const IDS = ['101', '102', '103'];

const idDe = async (identificador: string): Promise<string> => {
  const { rows } = await (pool as Pool).query<{ id: string }>(
    `SELECT id FROM public.viviendas
      WHERE copropiedad_id=$1 AND agrupacion IS NULL AND identificador=$2`,
    [COP, identificador],
  );
  return rows[0]?.id ?? '';
};

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    const usuario = await pool.query<{ id: string }>(
      `SELECT id FROM public.usuarios WHERE copropiedad_id = $1 ORDER BY id LIMIT 1`,
      [COP],
    );
    const persona = await pool.query<{ id: string }>(
      `SELECT id FROM public.personas WHERE copropiedad_id = $1 ORDER BY id LIMIT 1`,
      [COP],
    );
    actorId = usuario.rows[0]?.id ?? '';
    personaId = persona.rows[0]?.id ?? '';
    disponible = actorId !== '' && personaId !== '';
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  // Baja lógica y renombrado, como la suite de generación: nada se borra, y la
  // próxima corrida no encuentra estas filas en su camino.
  await pool?.query(
    `UPDATE public.viviendas
        SET agrupacion = $3, estado='inactivo', desactivado_en=now(), desactivado_por=$2,
            motivo_desactivacion='sonda de padron-edicion-pg.test'
      WHERE copropiedad_id=$1 AND agrupacion IS NULL AND identificador = ANY($4)`,
    [COP, actorId, `P${CORRIDA}`, IDS],
  );
  await pool?.end();
});

describe('O3 · regeneración con modos, edición y borrado definitivo contra base', () => {
  it('la base de pruebas contesta', () => {
    if (!URL_BASE) return;
    expect(disponible, 'DATABASE_URL_PRUEBAS definida pero la base no contesta').toBe(true);
  });

  it('estricto crea las 3; conservar sobre lo mismo crea 0 y conserva 3', async () => {
    if (!disponible || pool === undefined) return;
    const caso = new GenerarViviendas(new RepositorioPadronPg(pool, {}));
    const primera = await caso.confirmar(ctx(), PLAN, 3, 'estricto');
    expect(primera.ok, primera.ok ? '' : primera.error.detalle).toBe(true);
    expect(primera.ok && primera.valor).toEqual({ creadas: 3, conservadas: 0, reactivadas: 0 });

    const segunda = await caso.confirmar(ctx(), PLAN, 3, 'conservar');
    expect(segunda.ok, segunda.ok ? '' : segunda.error.detalle).toBe(true);
    expect(segunda.ok && segunda.valor).toEqual({ creadas: 0, conservadas: 3, reactivadas: 0 });
  });

  it('sobrescribir REACTIVA la dada de baja y conserva las demás; no borra ni renombra (RN-19)', async () => {
    if (!disponible || pool === undefined) return;
    const dadaDeBaja = await idDe('102');
    expect(dadaDeBaja).not.toBe('');
    await pool.query(
      `UPDATE public.viviendas
          SET estado='inactivo', desactivado_en=now(), desactivado_por=$2, motivo_desactivacion='prueba'
        WHERE copropiedad_id=$1 AND id=$3`,
      [COP, actorId, dadaDeBaja],
    );
    const caso = new GenerarViviendas(new RepositorioPadronPg(pool, {}));
    const r = await caso.confirmar(ctx(), PLAN, 3, 'sobrescribir');
    expect(r.ok, r.ok ? '' : r.error.detalle).toBe(true);
    expect(r.ok && r.valor).toEqual({ creadas: 0, conservadas: 2, reactivadas: 1 });

    const { rows } = await pool.query<{ id: string; estado: string; desactivado_en: Date | null }>(
      `SELECT id, estado::text AS estado, desactivado_en FROM public.viviendas
        WHERE copropiedad_id=$1 AND id=$2`,
      [COP, dadaDeBaja],
    );
    // La MISMA fila (mismo id) vuelve a estar activa: no se creó otra.
    expect(rows[0]?.id).toBe(dadaDeBaja);
    expect(rows[0]?.estado).toBe('activo');
    expect(rows[0]?.desactivado_en).toBeNull();
  });

  it('editar vivienda: estado administrativo; y el identificador duplicado se rechaza con nombre', async () => {
    if (!disponible || pool === undefined) return;
    const padron = new RepositorioPadronPg(pool, {});
    const viviendaId = await idDe('103');
    const editada = await padron.editarVivienda({
      copropiedadId: COP,
      viviendaId,
      estadoAdministrativo: 'en_mora',
      actorId,
    });
    expect(editada).toEqual({ tipo: 'editada' });
    const { rows } = await pool.query<{ estado: string; actualizado_por: string }>(
      `SELECT estado_administrativo::text AS estado, actualizado_por FROM public.viviendas
        WHERE copropiedad_id=$1 AND id=$2`,
      [COP, viviendaId],
    );
    expect(rows[0]?.estado).toBe('en_mora');
    expect(rows[0]?.actualizado_por).toBe(actorId);

    const duplicada = await padron.editarVivienda({
      copropiedadId: COP,
      viviendaId,
      identificador: '101',
      actorId,
    });
    expect(duplicada).toEqual({ tipo: 'identificador_duplicado' });
    expect(
      await padron.editarVivienda({
        copropiedadId: COP,
        viviendaId: randomUUID(),
        actorId,
        agrupacion: 'x',
      }),
    ).toEqual({ tipo: 'no_encontrada' });
  });

  it('editar vehículo: color y placa por el objeto de valor; la placa activa ajena se rechaza', async () => {
    if (!disponible || pool === undefined) return;
    const padron = new RepositorioPadronPg(pool, {});
    const viviendaId = await idDe('101');
    const placa = Placa.crear(`VE${CORRIDA}`);
    const otra = Placa.crear(`VO${CORRIDA}`);
    if (!esExito(placa) || !esExito(otra)) throw new Error('placa de prueba inválida');
    const alta = await padron.registrarVehiculo({
      copropiedadId: COP,
      viviendaId,
      personaId: null,
      placa: placa.valor,
      color: 'Rojo',
      actorId,
    });
    const otraAlta = await padron.registrarVehiculo({
      copropiedadId: COP,
      viviendaId,
      personaId: null,
      placa: otra.valor,
      actorId,
    });
    if (alta.tipo !== 'registrado' || otraAlta.tipo !== 'registrado') {
      throw new Error('no se pudieron registrar los vehículos de prueba');
    }

    const nueva = Placa.crear(`VF${CORRIDA}`);
    if (!esExito(nueva)) throw new Error('placa de prueba inválida');
    expect(
      await padron.editarVehiculo({
        copropiedadId: COP,
        vehiculoId: alta.id,
        placa: nueva.valor,
        color: 'Azul',
        actorId,
      }),
    ).toEqual({ tipo: 'editado' });
    const { rows } = await pool.query<{ placa: string; color: string | null }>(
      `SELECT placa, color FROM public.vehiculos WHERE copropiedad_id=$1 AND id=$2`,
      [COP, alta.id],
    );
    expect(rows[0]).toEqual({ placa: `VF${CORRIDA}`, color: 'Azul' });

    // RN-04 / ADR-04: la placa activa del otro vehículo la impide el índice, no un SELECT previo.
    expect(
      await padron.editarVehiculo({
        copropiedadId: COP,
        vehiculoId: alta.id,
        placa: otra.valor,
        actorId,
      }),
    ).toEqual({ tipo: 'placa_activa_duplicada' });
  });

  it('borrar definitivamente: sin historial se va; con una autorización, ni el caso de uso ni la base lo permiten', async () => {
    if (!disponible || pool === undefined) return;
    // D-136 · con los claims REALES, no vacíos. La función de borrado es
    // SECURITY DEFINER a propósito (0032, prueba 70): dentro manda el dueño de
    // la tabla, sujeto a la RLS forzada, y con claims vacíos el vehículo «no
    // existe». Con el dueño superusuario de una base local la prueba salía
    // verde igual; con el dueño que replica Supabase (`--modo-supabase`), no.
    const padron = new RepositorioPadronPg(pool, {
      rol: 'administrador',
      usuario_id: actorId,
      copropiedad_id: COP,
    });
    const caso = new BorrarVehiculoDefinitivamente(padron);
    const sinHistorial = await pool.query<{ id: string }>(
      `SELECT id FROM public.vehiculos WHERE copropiedad_id=$1 AND placa=$2`,
      [COP, `VF${CORRIDA}`],
    );
    const vehiculoId = sinHistorial.rows[0]?.id ?? '';
    const r = await caso.ejecutar(ctx(), vehiculoId);
    expect(esExito(r) && r.valor.placa).toBe(`VF${CORRIDA}`);
    const quedan = await pool.query(
      `SELECT 1 FROM public.vehiculos WHERE copropiedad_id=$1 AND id=$2`,
      [COP, vehiculoId],
    );
    expect(quedan.rowCount).toBe(0);
    const rastro = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.auditoria_seguridad
        WHERE copropiedad_id_objetivo=$1 AND tipo='borrado_definitivo_de_vehiculo'
          AND identificador_solicitado LIKE $2`,
      [COP, `%VF${CORRIDA}%`],
    );
    expect(Number(rastro.rows[0]?.n)).toBeGreaterThan(0);

    // Con historial: el vehículo VO… recibe una autorización con su placa.
    const reloj: Reloj = { ahora: () => new Date() };
    const ids: GeneradorDeId = { nuevo: () => randomUUID() };
    const autorizacion = await new CrearAutorizacion(
      new RepositorioAutorizacionesPg(pool, {}, 'bucket-de-prueba'),
      reloj,
      ids,
    ).ejecutar(ctx(), {
      viviendaId: VIVIENDA_CON_TITULAR,
      personaId,
      desde: new Date(Date.now() - 3600 * 1000).toISOString(),
      hasta: new Date(Date.now() + 3600 * 1000).toISOString(),
      placa: `VO${CORRIDA}`,
    });
    expect(esExito(autorizacion), esFallo(autorizacion) ? autorizacion.error.detalle : '').toBe(
      true,
    );
    const conHistorial = await pool.query<{ id: string }>(
      `SELECT id FROM public.vehiculos WHERE copropiedad_id=$1 AND placa=$2`,
      [COP, `VO${CORRIDA}`],
    );
    const negado = await caso.ejecutar(ctx(), conHistorial.rows[0]?.id ?? '');
    expect(esFallo(negado) && negado.error.codigo).toBe('OPERACION_NO_PERMITIDA');
    expect(esFallo(negado) && negado.error.detalle).toMatch(/1 autorización/);

    // Y saltándose el código: el disparador de la base dice que no.
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await expect(
        cliente.query(`DELETE FROM public.vehiculos WHERE copropiedad_id=$1 AND placa=$2`, [
          COP,
          `VO${CORRIDA}`,
        ]),
      ).rejects.toThrow(/historial/);
    } finally {
      await cliente.query('ROLLBACK');
      cliente.release();
    }
  });
});
