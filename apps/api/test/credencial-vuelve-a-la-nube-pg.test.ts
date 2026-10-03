import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import type { ContextoTenant } from '../src/autenticacion';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * 15-Q2 · D3 · LA REVERSIÓN DEL TRASLADO: una credencial que se mudó al Edge
 * (la fila queda, sin bytes; el equipo dice `edge:<gw>` y guarda una huella)
 * VUELVE a la nube cuando, quitado el puente, se escribe otra vez su clave desde
 * la consola. La referencia regresa a la bóveda y la huella vieja se borra: sin
 * eso, `reversion/0050_revert.sql` se negaría a correr por un `edge:` huérfano.
 */
const SUPER = '00000000-0000-4000-8000-000000000002';
const SERVICIO = '00000000-0000-4000-8000-000000000014';
const LLAVE = 'llave-de-equipos-solo-para-pruebas-32+';
const SUFIJO = randomBytes(3).toString('hex');
let pool: Pool | undefined;
let repo: RepositorioDeEquiposPg;
let cop = '';
let equipo = '';
let disponible = false;

const ctx = (): ContextoTenant => ({
  usuarioId: SUPER,
  rol: 'superadministrador',
  copropiedadId: cop,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});
const ALTA = {
  nombre: `Cámara que vuelve ${SUFIJO}`,
  tipo: 'camara_lpr' as const,
  host: '192.0.2.31',
  puerto: 80,
  protocolo: 'http' as const,
  usuario: 'servicio',
};
const SIN_PROBAR = {
  clase: 'alcanzado' as const,
  detalle: 'no se probó',
  modelo: null,
  firmware: null,
  latenciaMs: 0,
  verificado: false,
};

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 2 });
  const nueva = await pool.query<{ id: string }>(
    `INSERT INTO public.copropiedades (nombre, nit, creado_por, actualizado_por)
     VALUES ($1, $2, $3, $3) RETURNING id`,
    [`Reversión ${SUFIJO}`, `8${String(Date.now()).slice(-9)}`, SUPER],
  );
  cop = nueva.rows[0]?.id ?? '';
  repo = new RepositorioDeEquiposPg(pool, LLAVE, 'env:EQUIPOS_LLAVE');
  equipo = (await repo.crear(ctx(), cop, { ...ALTA, secreto: 'clave-original' }, SIN_PROBAR)).id;
  // Lo que deja la migración (D3): el Edge la tiene; en la nube, la fila sin bytes.
  const gw = await pool.query<{ id: string }>(
    `INSERT INTO public.edge_gateways (copropiedad_id, nombre, usuario_servicio_id, credencial_ref,
                                       creado_por, actualizado_por)
     VALUES ($1, $2, $3, 'env:INGESTA_FIRMA_SECRETO/g1', $4, $4) RETURNING id`,
    [cop, `Edge ${SUFIJO}`, SERVICIO, SUPER],
  );
  const edgeId = gw.rows[0]?.id ?? '';
  await pool.query(
    `UPDATE public.credenciales_de_equipo
        SET iv = NULL, cuerpo = NULL, etiqueta = NULL, estado = 'inactivo', desactivado_en = now(),
            trasladada_al_edge = $2, trasladada_en = now()
      WHERE dispositivo_id = $1 AND estado = 'activo'`,
    [equipo, edgeId],
  );
  await pool.query(
    `UPDATE public.dispositivos SET credencial_ref = $2, huella_de_credencial = $3 WHERE id = $1`,
    [equipo, `edge:${edgeId}`, 'ab'.repeat(32)],
  );
  disponible = true;
}, 60_000);

afterAll(async () => {
  await pool?.end();
});

exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);

describe.skipIf(URL_BASE === undefined)('D3 · la credencial vuelve a la nube (15-Q2)', () => {
  it('trasladada: la nube no la tiene', async () => {
    expect(await repo.credencialPara(ctx(), cop, equipo)).toBeNull();
  });

  it('escrita otra vez desde la consola: cifrada en la nube, referencia a la bóveda, sin huella', async () => {
    await repo.editar(ctx(), cop, equipo, { ...ALTA, secreto: 'clave-de-vuelta' }, SIN_PROBAR);
    expect(await repo.credencialPara(ctx(), cop, equipo)).toBe('clave-de-vuelta');
    const { rows } = await (pool as Pool).query<{ ref: string; huella: string | null }>(
      'SELECT credencial_ref AS ref, huella_de_credencial AS huella FROM public.dispositivos WHERE id = $1',
      [equipo],
    );
    expect(rows[0]).toEqual({ ref: `vault:equipos/${equipo}`, huella: null });
  });

  it('un equipo que nunca estuvo en un Edge no cambia de referencia al rotar', async () => {
    const otro = await repo.crear(
      ctx(),
      cop,
      { ...ALTA, nombre: `Otra ${SUFIJO}`, host: '192.0.2.32', secreto: 'uno' },
      SIN_PROBAR,
    );
    await repo.editar(
      ctx(),
      cop,
      otro.id,
      { ...ALTA, host: '192.0.2.32', secreto: 'dos' },
      SIN_PROBAR,
    );
    const { rows } = await (pool as Pool).query<{ ref: string }>(
      'SELECT credencial_ref AS ref FROM public.dispositivos WHERE id = $1',
      [otro.id],
    );
    expect(rows[0]?.ref).toBe(`vault:equipos/${otro.id}`);
    expect(await repo.credencialPara(ctx(), cop, otro.id)).toBe('dos');
  });
});
