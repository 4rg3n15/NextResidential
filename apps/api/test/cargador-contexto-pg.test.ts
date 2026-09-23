import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { Placa, esExito } from '@ncr/domain-core';
import type { Bitacora, ResultadoAcceso } from '@ncr/domain-core';
import { CargadorDeContextoPg } from '../src/autorizaciones/infraestructura/cargador-pg';
import { VersionDeReglasFija } from '../src/autorizaciones/infraestructura/cargador-conservador';
import { RepositorioAutorizacionesPg } from '../src/autorizaciones/infraestructura/repositorio-autorizaciones-pg';
import { RepositorioListaNegraPg } from '../src/autorizaciones/infraestructura/repositorio-lista-negra-pg';
import { DecidirAcceso } from '../src/autorizaciones/aplicacion/evaluar-acceso';
import type { ResolutorDePlaca } from '../src/autorizaciones/aplicacion/puertos';
import { RepositorioPadronPg } from '../src/padron/infraestructura/repositorio-pg';
import { RepositorioCopropiedadesPg } from '../src/multiempresa/repositorio-copropiedades-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-25 · LA TABLA 9.1, CONTRA BASE REAL Y NO CONTRA DOBLES
 *
 * Hasta la 15-D, toda lectura de placa acababa en FALLO_TECNICO porque el motor
 * recibía un contexto vacío. Esta suite es la que dice, caso por caso, qué
 * motivo sale ahora cuando el contexto se carga de verdad: padrón, autorizaciones
 * y lista negra de la base migrada con sus semillas.
 *
 * Se salta si `DATABASE_URL_PRUEBAS` no está definida —no es un verde: el
 * verificador lo cuenta como omitida y lo dice—. Con la base presente, un fallo
 * aquí es un fallo del cargador o del esquema, nunca «datos que faltan».
 */

const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP_A = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';
const DISPOSITIVO = '90000000-0000-4000-8000-000000000001';
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();

/** Placas de la semilla (`supabase/seed/seed.sql`). */
const PLACA_RESIDENTE = 'PCH2145'; // vehículo activo de la vivienda A-01, activa
const PLACA_VISITANTE_VIGENTE = 'ABC9999'; // autorización única vigente, vivienda B-42
const PLACA_VISITANTE_VENCIDA = 'XYZ9999'; // autorización vencida, vivienda C-89
const PLACA_VETADA = 'XYZ0000'; // en lista negra, sin autorización en la semilla
const PLACA_DE_OTRA_COPROPIEDAD = 'ABC1234'; // existe en A y en B: RN-15
const PLACA_INEXISTENTE = 'ZZZ9876';

let pool: Pool | undefined;
let disponible = false;
let actorId = '';

const claims = (copropiedadId: string) => ({
  rol: 'administrador',
  usuario_id: actorId,
  copropiedad_id: copropiedadId,
});

const bitacora: Bitacora = { registrar: () => undefined };

const decisorDe = (copropiedadId: string): DecidirAcceso => {
  const p = pool as Pool;
  const padron = new RepositorioPadronPg(p, claims(copropiedadId));
  const placas: ResolutorDePlaca = {
    resolver: async (cop, leida) => {
      const placa = Placa.crear(leida);
      return esExito(placa) ? padron.resolverPlaca(cop, placa.valor) : null;
    },
  };
  const cargador = new CargadorDeContextoPg(
    new VersionDeReglasFija(),
    new RepositorioAutorizacionesPg(p, claims(copropiedadId)),
    placas,
    new RepositorioListaNegraPg(p, claims(copropiedadId)),
    new RepositorioCopropiedadesPg(p),
    bitacora,
  );
  return new DecidirAcceso(cargador, { ahora: () => new Date() });
};

const decidir = async (
  copropiedadId: string,
  placa: string,
  confianza = 0.95,
): Promise<ResultadoAcceso> =>
  decisorDe(copropiedadId).ejecutar({
    copropiedadId,
    dispositivoId: DISPOSITIVO,
    metodo: 'placa',
    personaId: null,
    placaLeida: placa,
    zonaId: null,
    confianza,
  });

const motivoDe = (r: ResultadoAcceso): string => (r.permitido ? 'PERMITIDO' : r.motivo);

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM public.usuarios WHERE copropiedad_id = $1 ORDER BY id LIMIT 1`,
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

describe('D-25 · el motor decide con el contexto de la base (tabla 9.1)', () => {
  it('la base de pruebas contesta', () => {
    if (!URL_BASE) return;
    expect(disponible, 'DATABASE_URL_PRUEBAS definida pero la base no contesta').toBe(true);
  });

  it('1 · placa de vehículo activo + vivienda activa → PERMITIDO', async () => {
    if (!disponible) return;
    expect(motivoDe(await decidir(COP_A, PLACA_RESIDENTE))).toBe('PERMITIDO');
  });

  it('2 · misma placa con la vivienda DE BAJA → negado por vigencia, NO por FALLO_TECNICO', async () => {
    if (!disponible) return;
    const p = pool as Pool;
    const padron = new RepositorioPadronPg(p, claims(COP_A));
    const vivienda = await padron.registrarVivienda({
      copropiedadId: COP_A,
      identificador: `15D${CORRIDA}`,
      agrupacion: 'Z',
      actorId,
    });
    if (vivienda.tipo !== 'registrada') throw new Error('no se pudo crear la vivienda de prueba');
    const placa = Placa.crear(`TQ${CORRIDA}`);
    if (!esExito(placa)) throw new Error('placa de prueba inválida');
    const vehiculo = await padron.registrarVehiculo({
      copropiedadId: COP_A,
      viviendaId: vivienda.id,
      personaId: null,
      placa: placa.valor,
      actorId,
    });
    expect(vehiculo.tipo).toBe('registrado');
    expect(motivoDe(await decidir(COP_A, placa.valor.valor))).toBe('PERMITIDO');

    // RN-19 · baja LÓGICA con motivo; la vivienda conserva su historial.
    expect(await padron.desactivarVivienda(COP_A, vivienda.id, 'prueba 15-D · D-25', actorId)).toBe(
      true,
    );
    const r = await decidir(COP_A, placa.valor.valor);
    expect(motivoDe(r)).toBe('VIGENCIA_EXPIRADA');
    expect(r.reglaAplicada).toBe('politica.vigencia');
    expect(motivoDe(r)).not.toBe('FALLO_TECNICO');
  });

  it('3 · placa en LISTA NEGRA con autorización vigente → LISTA_NEGRA, no VIGENCIA_EXPIRADA (RN-06, CA-13)', async () => {
    if (!disponible) return;
    const p = pool as Pool;
    // Se le da a la placa vetada una autorización VIGENTE: el orden vinculante
    // `listaNegra > vigencia` es lo que se verifica aquí, o no se verifica.
    const cliente = await p.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claims(COP_A)),
      ]);
      await cliente.query(
        `INSERT INTO public.autorizaciones
           (copropiedad_id, vivienda_id, visitante_id, autorizado_por, tipo, placa, vigencia,
            permite_acceso_vehicular, creado_por, actualizado_por)
         VALUES ($1, '30000000-0000-4000-8000-000000000042', '60000000-0000-4000-8000-000000000101',
                 '50000000-0000-4000-8000-000000000042', 'unica', $2,
                 tstzrange(now() - interval '1 hour', now() + interval '2 hours', '[)'),
                 true, $3, $3)`,
        [COP_A, PLACA_VETADA, actorId],
      );
    } finally {
      cliente.release();
    }
    expect(motivoDe(await decidir(COP_A, PLACA_VETADA))).toBe('LISTA_NEGRA');
  });

  it('4 · autorización expirada → VIGENCIA_EXPIRADA', async () => {
    if (!disponible) return;
    expect(motivoDe(await decidir(COP_A, PLACA_VISITANTE_VENCIDA))).toBe('VIGENCIA_EXPIRADA');
  });

  it('4 bis · autorización de visitante VIGENTE con placa → PERMITIDO (CA-04)', async () => {
    if (!disponible) return;
    expect(motivoDe(await decidir(COP_A, PLACA_VISITANTE_VIGENTE))).toBe('PERMITIDO');
  });

  it('5 · placa inexistente en el padrón → PLACA_DESCONOCIDA', async () => {
    if (!disponible) return;
    expect(motivoDe(await decidir(COP_A, PLACA_INEXISTENTE))).toBe('PLACA_DESCONOCIDA');
  });

  it('6 · confianza por debajo del umbral → NO se decide sola (CU-01, excepción 3a)', async () => {
    if (!disponible) return;
    const dudosa = await decidir(COP_A, PLACA_RESIDENTE, 0.5);
    expect(dudosa.permitido).toBe(true);
    expect(dudosa.requiereConfirmacionHumana).toBe(true);
    const inservible = await decidir(COP_A, PLACA_RESIDENTE, 0.2);
    expect(motivoDe(inservible)).toBe('CONFIANZA_INSUFICIENTE');
  });

  it('7 · la misma placa leída en OTRA copropiedad no resuelve la vivienda ajena (RN-15)', async () => {
    if (!disponible) return;
    // ABC1234 existe en las dos copropiedades. La de B debe resolver SU
    // vehículo, y una copropiedad sin ese vehículo no debe ver el de la otra.
    expect(motivoDe(await decidir(COP_B, PLACA_DE_OTRA_COPROPIEDAD))).toBe('PERMITIDO');
    expect(motivoDe(await decidir(COP_B, PLACA_RESIDENTE))).toBe('PLACA_DESCONOCIDA');
  });

  it('8 · en ningún caso FALLO_TECNICO con información suficiente', async () => {
    if (!disponible) return;
    const motivos = await Promise.all(
      [
        PLACA_RESIDENTE,
        PLACA_VISITANTE_VIGENTE,
        PLACA_VISITANTE_VENCIDA,
        PLACA_VETADA,
        PLACA_INEXISTENTE,
      ].map(async (placa) => motivoDe(await decidir(COP_A, placa))),
    );
    expect(motivos).not.toContain('FALLO_TECNICO');
  });
});
