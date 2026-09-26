import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { capacidadesDescubiertas } from '@ncr/providers';
import type { ContextoTenant } from '../src/autenticacion';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { RegistroDeEquiposPg } from '../src/equipos/infraestructura/registro-de-equipos-pg';
import type { ResultadoDeSondeo } from '../src/equipos';
import { RepositorioDeAtestacionesPg } from '../src/equipos/infraestructura/atestaciones';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D5 y P6 · CONTRA BASE REAL, que es donde los dos defectos vivían escondidos
 *
 * · P6 · `credencialPara` filtraba por una columna que no existe (`activa`) y
 *   corría con los claims del administrador, a quien la política de
 *   `credenciales_de_equipo` no deja leer. Nunca falló porque la suite usaba
 *   el doble en memoria. Aquí se ejecuta contra PostgreSQL con la RLS forzada.
 * · D5 · el registro que alimenta al proveedor de hardware no existía. Aquí
 *   se da de alta un equipo como lo haría la consola y se comprueba que el
 *   registro lo resuelve a dirección, credencial DESCIFRADA y capacidades.
 *
 * Se salta si `DATABASE_URL_PRUEBAS` no está definida: el verificador lo
 * cuenta como omitida y lo dice.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP_A = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';
const LLAVE = 'llave-de-equipos-solo-para-pruebas-32+';
const CORRIDA = randomBytes(3).toString('hex');

let pool: Pool | undefined;
let disponible = false;
let actorId = '';

const ctxAdmin = (copropiedadId: string): ContextoTenant => ({
  usuarioId: actorId,
  rol: 'administrador',
  copropiedadId,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});

const VEREDICTO: ResultadoDeSondeo = {
  clase: 'alcanzado',
  detalle: 'responde',
  modelo: 'MODELO-DE-PRUEBA',
  firmware: 'V0',
  latenciaMs: 3,
  verificado: true,
  capacidades: capacidadesDescubiertas({
    aperturaRemota: 'si',
    audioBidireccional: { estado: 'si', canal: 2, formato: 'g711u' },
    senalizacionDeLlamada: 'no',
  }),
};

beforeAll(async () => {
  if (URL_BASE === undefined) return;
  pool = new Pool({ connectionString: URL_BASE, max: 3 });
  try {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT u.id FROM public.usuarios u JOIN public.roles_usuario r ON r.usuario_id = u.id
        WHERE r.copropiedad_id = $1 AND r.rol = 'administrador' LIMIT 1`,
      [COP_A],
    );
    actorId = rows[0]?.id ?? '';
    disponible = actorId !== '';
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(URL_BASE === undefined)('registro de equipos contra base real (D5, P6)', () => {
  it('un equipo dado de alta desde la consola se resuelve con su credencial DESCIFRADA', async () => {
    if (!disponible)
      throw new Error('la base de pruebas no tiene el actor administrador de la semilla');
    const p = pool as Pool;
    const repo = new RepositorioDeEquiposPg(p, LLAVE, 'env:EQUIPOS_LLAVE');
    const secreto = `clave-${CORRIDA}`;
    const creado = await repo.crear(
      ctxAdmin(COP_A),
      COP_A,
      {
        nombre: `Portero de prueba ${CORRIDA}`,
        tipo: 'intercom',
        host: `198.51.100.${String(1 + (parseInt(CORRIDA, 16) % 200))}`,
        puerto: 80,
        protocolo: 'http',
        usuario: 'servicio',
        secreto,
        fabricante: 'Marca de prueba',
        numeroDePuerta: 1,
        canalDeAudioHabilitado: true,
      },
      VEREDICTO,
    );

    // P6 · la lectura del sobre desde el repositorio ya funciona.
    await expect(repo.credencialPara(ctxAdmin(COP_A), COP_A, creado.id)).resolves.toBe(secreto);

    // D5 · el registro del proveedor resuelve el identificador del dominio.
    const registro = new RegistroDeEquiposPg(p, LLAVE);
    const equipo = await registro.buscar(creado.id);
    expect(equipo).not.toBeNull();
    expect(equipo?.clave).toBe(secreto);
    expect(equipo?.usuario).toBe('servicio');
    expect(equipo?.tipo).toBe('intercom');
    expect(equipo?.numeroDePuerta).toBe(1);
    expect(equipo?.canalDeAudioHabilitado).toBe(true);
    expect(equipo?.fabricante).toBe('Marca de prueba');
    // Las capacidades PERSISTIDAS vuelven con su origen y su canal descubierto.
    expect(equipo?.capacidades?.origen).toBe('descubiertas');
    expect(equipo?.capacidades?.audioBidireccional.canal).toBe(2);
    expect(equipo?.capacidades?.senalizacionDeLlamada).toBe('no');
  });

  it('el secreto de OTRA copropiedad no se lee con los claims de la primera (RN-15)', async () => {
    const p = pool as Pool;
    const repo = new RepositorioDeEquiposPg(p, LLAVE, 'env:EQUIPOS_LLAVE');
    const { rows } = await p.query<{ id: string }>(
      `SELECT u.id FROM public.usuarios u JOIN public.roles_usuario r ON r.usuario_id = u.id
        WHERE r.copropiedad_id = $1 AND r.rol = 'administrador' LIMIT 1`,
      [COP_B],
    );
    const adminB = rows[0]?.id ?? actorId;
    const creado = await repo.crear(
      { ...ctxAdmin(COP_B), usuarioId: adminB },
      COP_B,
      {
        nombre: `Cámara B ${CORRIDA}`,
        tipo: 'camara_lpr',
        host: `198.51.100.${String(1 + ((parseInt(CORRIDA, 16) + 7) % 200))}`,
        puerto: 80,
        protocolo: 'http',
        usuario: 'servicio',
        secreto: `otra-${CORRIDA}`,
      },
      { ...VEREDICTO, capacidades: undefined } as ResultadoDeSondeo,
    );
    // Pedir el sobre del equipo de B con la copropiedad A en los claims: nada.
    await expect(repo.credencialPara(ctxAdmin(COP_A), COP_A, creado.id)).resolves.toBeNull();
  });

  it('D-11 · sólo el superadministrador atesta, y la atestación viaja al proveedor', async () => {
    const p = pool as Pool;
    const repo = new RepositorioDeEquiposPg(p, LLAVE, 'env:EQUIPOS_LLAVE');
    const camara = await repo.crear(
      ctxAdmin(COP_A),
      COP_A,
      {
        nombre: `Cámara atestada ${CORRIDA}`,
        tipo: 'camara_lpr',
        host: `198.51.100.${String(1 + ((parseInt(CORRIDA, 16) + 13) % 200))}`,
        puerto: 80,
        protocolo: 'http',
        usuario: 'servicio',
        secreto: `camara-${CORRIDA}`,
      },
      VEREDICTO,
    );
    // Con el rol de la API (dueño, no superusuario) y no con el de la cadena de
    // pruebas: un superusuario omite la RLS y la prueba negativa no probaría nada.
    const comoLaApi = new Pool({
      connectionString: URL_BASE,
      max: 2,
      options: '-c role=sb_postgres_sim',
    });
    const atestaciones = new RepositorioDeAtestacionesPg(comoLaApi);
    const nueva = {
      dispositivoId: camara.id,
      firmware: 'V0',
      placaEnListaBlanca: 'ABC123',
      placaDesconocida: 'XYZ987',
      evidencia: 'Carril 1: dos pasadas, el brazo no subió en ninguna.',
    };
    // El administrador del conjunto NO atesta: la RLS de la 0039 lo rechaza.
    await expect(
      atestaciones.registrar(ctxAdmin(COP_A), COP_A, { ...nueva, registradaPor: actorId }),
    ).rejects.toThrow();
    const superadmin: ContextoTenant = {
      usuarioId: '00000000-0000-4000-8000-000000000002',
      rol: 'superadministrador',
      copropiedadId: null,
      copropiedadesAtendidas: [],
      mfaVerificado: true,
    };
    const hecha = await atestaciones.registrar(superadmin, COP_A, {
      ...nueva,
      registradaPor: superadmin.usuarioId,
    });
    expect(hecha.firmware).toBe('V0');

    // La administración la LEE; la otra copropiedad, no.
    const propias = await atestaciones.ultimasPorEquipo(ctxAdmin(COP_A), COP_A);
    expect(propias.get(camara.id)?.placaDesconocida).toBe('XYZ987');
    const ajenas = await atestaciones.ultimasPorEquipo(ctxAdmin(COP_B), COP_A);
    expect(ajenas.size).toBe(0);

    // Y el registro del proveedor la entrega con el equipo.
    const registrado = await new RegistroDeEquiposPg(p, LLAVE).buscar(camara.id);
    expect(registrado?.atestacion).toEqual({ firmware: 'V0' });
    await comoLaApi.end();
  });

  it('un equipo que no existe o está dado de baja no se resuelve', async () => {
    const registro = new RegistroDeEquiposPg(pool as Pool, LLAVE);
    await expect(registro.buscar('00000000-0000-4000-8000-0000000000ff')).resolves.toBeNull();
  });
});
