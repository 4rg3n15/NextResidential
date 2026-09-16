import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { PlanDeGeneracion } from '@ncr/domain-core';
import { RepositorioPadronPg } from '../src/padron/infraestructura/repositorio-pg';
import { GenerarViviendas } from '../src/padron/aplicacion/generar-viviendas';
import { BOM_UTF8, ExportarPadron } from '../src/padron/aplicacion/exportar-padron';
import type { ContextoTenant } from '../src/autenticacion/dominio/claims';

/**
 * La generación del padrón **contra base real**, que es donde vive lo único que
 * de verdad garantiza algo.
 *
 * Los dobles en memoria pueden comprobar que el caso de uso llama al puerto y
 * traduce el resultado. Lo que NO pueden comprobar es lo que este fichero
 * existe para probar:
 *
 *  · que `ON CONFLICT (copropiedad_id, coalesce(agrupacion,''), identificador)`
 *    infiere el índice compuesto de la migración `0029` —si no lo infiriese,
 *    PostgreSQL rechaza la sentencia entera y ningún doble lo vería—;
 *  · que el mismo número en dos agrupaciones entra sin chocar (H-2);
 *  · que una sola colisión revierte las 12 inserciones, y no deja 11.
 *
 * Se OMITE si no hay base, y lo dice: una omisión no es un verde.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';

let pool: Pool | undefined;
let disponible = false;
let actorId = '';

/** Sufijo por corrida: la prueba no puede depender de una base recién sembrada. */
const marca = String(Date.now()).slice(-6);

const contexto = (): ContextoTenant => ({
  usuarioId: actorId,
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});

/**
 * Tres «torres» con nombre irrepetible y dos pisos de dos: 12 viviendas, con el
 * 101 y el 102 repetidos en las tres. Es exactamente la forma que el índice
 * anterior no admitía.
 */
const PLAN: PlanDeGeneracion = {
  tipo: 'apartamentos',
  agrupaciones: 3,
  estilo: 'numeros',
  pisos: 2,
  porPiso: 2,
};

/** El plan nombra las torres 1, 2 y 3; se renombran para no chocar entre corridas. */
const renombrar = async (): Promise<void> => {
  await pool?.query(
    `UPDATE public.viviendas SET agrupacion = agrupacion || $2
      WHERE copropiedad_id = $1 AND agrupacion IN ('1','2','3') AND estado = 'activo'`,
    [COP, `-G${marca}`],
  );
};

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM public.usuarios WHERE copropiedad_id = $1 LIMIT 1',
      [COP],
    );
    actorId = rows[0]?.id ?? '';
    disponible = actorId !== '';
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  // Baja lógica, como manda RN-19: ni siquiera una prueba borra viviendas.
  await pool?.query(
    `UPDATE public.viviendas
        SET estado='inactivo', desactivado_en=now(), desactivado_por=$2,
            motivo_desactivacion='sonda de generacion-padron.test'
      WHERE copropiedad_id=$1 AND agrupacion LIKE $3 AND estado='activo'`,
    [COP, actorId, `%-G${marca}`],
  );
  await pool?.end();
});

describe('generación del padrón contra base', () => {
  it('crea las 12 en una sentencia, con el mismo número en tres agrupaciones', async () => {
    if (!disponible || pool === undefined) {
      console.log('OMITIDA: sin DATABASE_URL_PRUEBAS o sin semillas. Se ejecuta en CI (ETAPA 14).');
      return;
    }
    const caso = new GenerarViviendas(new RepositorioPadronPg(pool, {}));

    const vista = await caso.previsualizar(contexto(), PLAN);
    expect(vista.ok && vista.valor.total).toBe(12);
    expect(vista.ok && vista.valor.colisiones).toEqual([]);

    const aplicada = await caso.confirmar(contexto(), PLAN, 12);
    expect(aplicada.ok, aplicada.ok ? '' : aplicada.error.detalle).toBe(true);
    expect(aplicada.ok && aplicada.valor.creadas).toBe(12);

    // Lo que el índice anterior impedía: el 101 existe TRES veces, una por
    // agrupación, y las tres son filas distintas.
    const { rows } = await pool.query<{ agrupacion: string }>(
      `SELECT agrupacion FROM public.viviendas
        WHERE copropiedad_id = $1 AND identificador = '101' AND estado = 'activo'
          AND agrupacion IN ('1','2','3')`,
      [COP],
    );
    expect(rows).toHaveLength(3);
  });

  it('el rastro de quién generó y con qué plan queda en la misma transacción', async () => {
    if (!disponible || pool === undefined) return;
    const { rows } = await pool.query<{ identificador_solicitado: string }>(
      `SELECT identificador_solicitado FROM public.auditoria_seguridad
        WHERE tipo = 'generacion_de_padron' AND copropiedad_id_objetivo = $1
        ORDER BY creado_en DESC LIMIT 1`,
      [COP],
    );
    // Sin esta fila, «¿quién creó estas 300 viviendas?» se contesta leyendo 300
    // valores de `creado_por` idénticos.
    expect(rows[0]?.identificador_solicitado).toMatch(/apartamentos/);
    expect(rows[0]?.identificador_solicitado).toMatch(/12 viviendas/);
  });

  it('una sola colisión revierte las 12, no deja 11', async () => {
    if (!disponible || pool === undefined) return;
    const caso = new GenerarViviendas(new RepositorioPadronPg(pool, {}));

    const antes = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.viviendas
        WHERE copropiedad_id = $1 AND estado = 'activo'`,
      [COP],
    );

    // El MISMO plan otra vez: las 12 ya existen.
    const r = await caso.confirmar(contexto(), PLAN, 12);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.detalle).toMatch(/No se creó ninguna vivienda/);

    const despues = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.viviendas
        WHERE copropiedad_id = $1 AND estado = 'activo'`,
      [COP],
    );
    // Ni una más. Es la comprobación de que «regenerar» no es destructivo ni
    // parcial: o entran todas, o no entra ninguna.
    expect(despues.rows[0]?.n).toBe(antes.rows[0]?.n);
  });

  it('lo exportado lleva la agrupación, y sale una fila por vivienda vacía', async () => {
    if (!disponible || pool === undefined) return;
    const exportado = await new ExportarPadron(new RepositorioPadronPg(pool, {})).ejecutar(
      contexto(),
    );
    const lineas = exportado.csv.replace(BOM_UTF8, '').trim().split('\r\n');
    expect(lineas[0]).toBe(
      'identificador,agrupacion,documento,tipo_documento,nombre,placa,es_titular',
    );
    // Las 12 recién generadas están vacías: una fila cada una, con la
    // agrupación puesta y el resto de columnas en blanco.
    const vacias = lineas.filter((l) => /^(101|102|201|202),[123],,,,,$/.test(l));
    expect(vacias.length).toBeGreaterThanOrEqual(12);

    await renombrar();
  });
});
