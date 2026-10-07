import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { ResidentesPorPersonaPg, residentesDePersonasEn } from '../src/autorizaciones';
import { conCliente } from '../src/persistencia/con-cliente';
import { claimsDeServicio } from '../src/comun/claims-de-servicio';
import { COP_A, COP_B } from './constantes';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D1 · EL RESIDENTE DE UNA PERSONA, CONTRA LA BASE REAL
 *
 * La lectura que comparten el cargador de la nube y la instantánea del Edge:
 * qué fila elige (la activa; si no, la de la baja más reciente), qué baja corta
 * el derecho (la primera de residente, persona o vivienda) y que no cruza de
 * copropiedad aunque corra con identidad de servicio (RN-15).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const ACTOR = '00000000-0000-4000-8000-000000000002';
let pool: Pool | undefined;
let disponible = false;
const id = () => randomBytes(4).toString('hex').toUpperCase();

const vivienda = async (p: Pool): Promise<string> => {
  const { rows } = await p.query<{ id: string }>(
    `INSERT INTO public.viviendas (copropiedad_id, identificador, agrupacion, creado_por, actualizado_por)
     VALUES ($1, $2, 'Residentes por persona', $3, $3) RETURNING id`,
    [COP_A, `RP-${id()}`, ACTOR],
  );
  return rows[0]?.id ?? '';
};

const persona = async (p: Pool): Promise<string> => {
  const { rows } = await p.query<{ id: string }>(
    `INSERT INTO public.personas (copropiedad_id, tipo_documento, numero_documento, nombre_completo,
                                  creado_por, actualizado_por)
     VALUES ($1, 'cedula', $2, 'Residente por persona', $3, $3) RETURNING id`,
    [COP_A, `RP${id()}`, ACTOR],
  );
  return rows[0]?.id ?? '';
};

const residente = async (p: Pool, viviendaId: string, personaId: string): Promise<string> => {
  const { rows } = await p.query<{ id: string }>(
    `INSERT INTO public.residentes (copropiedad_id, vivienda_id, persona_id, creado_por, actualizado_por)
     VALUES ($1, $2, $3, $4, $4) RETURNING id`,
    [COP_A, viviendaId, personaId, ACTOR],
  );
  return rows[0]?.id ?? '';
};

const baja = async (
  p: Pool,
  tabla: 'residentes' | 'personas' | 'viviendas',
  fila: string,
  en: string,
) =>
  p.query(
    `UPDATE public.${tabla} SET estado = 'inactivo', desactivado_en = $2::timestamptz,
            desactivado_por = $3, actualizado_por = $3
      WHERE copropiedad_id = $4 AND id = $1`,
    [fila, en, ACTOR, COP_A],
  );

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 2 });
  try {
    await pool.query('SELECT 1 FROM public.residentes LIMIT 1');
    disponible = true;
  } catch {
    disponible = false;
  }
});
afterAll(async () => {
  await pool?.end();
});

exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);

describe.skipIf(URL_BASE === undefined)('15-X · D1 · ResidentesPorPersonaPg', () => {
  it('residente en servicio: su vivienda activa, su alta y sin baja', async () => {
    const p = pool as Pool;
    const [v, per] = [await vivienda(p), await persona(p)];
    const r = await residente(p, v, per);
    const leido = await new ResidentesPorPersonaPg(p).resolver(COP_A, per);
    expect(leido).toMatchObject({
      residenteId: r,
      personaId: per,
      viviendaId: v,
      viviendaActiva: true,
    });
    expect(leido?.bajaEn).toBeNull();
    expect(leido?.registradoEn).toBeInstanceOf(Date);
  });

  it('el de baja también se resuelve, con la baja como fin del derecho', async () => {
    const p = pool as Pool;
    const [v, per] = [await vivienda(p), await persona(p)];
    const r = await residente(p, v, per);
    await baja(p, 'residentes', r, '2026-10-01T05:00:00Z');
    const leido = await new ResidentesPorPersonaPg(p).resolver(COP_A, per);
    expect(leido?.residenteId).toBe(r);
    expect(leido?.bajaEn?.toISOString()).toBe('2026-10-01T05:00:00.000Z');
  });

  it('con una fila activa y otra de baja, gana la activa; sin activa, la baja más reciente', async () => {
    const p = pool as Pool;
    const [v1, v2, per, otra] = [
      await vivienda(p),
      await vivienda(p),
      await persona(p),
      await persona(p),
    ];
    await baja(p, 'residentes', await residente(p, v2, per), '2026-09-01T00:00:00Z');
    const activa = await residente(p, v1, per);
    expect((await new ResidentesPorPersonaPg(p).resolver(COP_A, per))?.residenteId).toBe(activa);

    await baja(p, 'residentes', await residente(p, v1, otra), '2026-08-01T00:00:00Z');
    const reciente = await residente(p, v2, otra);
    await baja(p, 'residentes', reciente, '2026-09-15T00:00:00Z');
    expect((await new ResidentesPorPersonaPg(p).resolver(COP_A, otra))?.residenteId).toBe(reciente);
  });

  it('la baja de la persona o de la vivienda corta el derecho: la PRIMERA de las tres', async () => {
    const p = pool as Pool;
    const [v, per] = [await vivienda(p), await persona(p)];
    await residente(p, v, per);
    await baja(p, 'personas', per, '2026-10-02T00:00:00Z');
    await baja(p, 'viviendas', v, '2026-10-03T00:00:00Z');
    const leido = await new ResidentesPorPersonaPg(p).resolver(COP_A, per);
    expect(leido?.viviendaActiva).toBe(false);
    expect(leido?.bajaEn?.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });

  it('no cruza de copropiedad (RN-15), y lo que no es un UUID no se pregunta', async () => {
    const p = pool as Pool;
    const [v, per] = [await vivienda(p), await persona(p)];
    await residente(p, v, per);
    expect(await new ResidentesPorPersonaPg(p).resolver(COP_B, per)).toBeNull();
    expect(await new ResidentesPorPersonaPg(p).resolver(COP_A, 'vehiculo:1')).toBeNull();
  });

  it('la lectura en bloque del Edge da UNA fila por persona, la misma que la de la nube', async () => {
    const p = pool as Pool;
    const [v1, v2, per] = [await vivienda(p), await vivienda(p), await persona(p)];
    await baja(p, 'residentes', await residente(p, v2, per), '2026-09-01T00:00:00Z');
    await residente(p, v1, per);
    // Como `FuenteDeReglasPg`: con la identidad de servicio de la copropiedad.
    const enBloque = await conCliente(p, async (c) => {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(COP_A)),
      ]);
      return residentesDePersonasEn(c, COP_A, [per, per]);
    });
    expect(enBloque).toHaveLength(1);
    expect(enBloque[0]).toEqual(await new ResidentesPorPersonaPg(p).resolver(COP_A, per));
  });
});
