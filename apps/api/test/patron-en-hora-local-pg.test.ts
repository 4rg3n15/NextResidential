import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Placa, esExito, esFallo } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj, ResultadoAcceso } from '@ncr/domain-core';
import { CargadorDeContextoPg } from '../src/autorizaciones/infraestructura/cargador-pg';
import { VersionDeReglasFija } from '../src/autorizaciones/infraestructura/cargador-conservador';
import { RepositorioAutorizacionesPg } from '../src/autorizaciones/infraestructura/repositorio-autorizaciones-pg';
import { RepositorioListaNegraPg } from '../src/autorizaciones/infraestructura/repositorio-lista-negra-pg';
import { DecidirAcceso } from '../src/autorizaciones/aplicacion/evaluar-acceso';
import { CrearAutorizacion } from '../src/autorizaciones/aplicacion/casos-de-uso';
import type { ResolutorDePlaca } from '../src/autorizaciones/aplicacion/puertos';
import { RepositorioPadronPg } from '../src/padron/infraestructura/repositorio-pg';
import { RepositorioCopropiedadesPg } from '../src/multiempresa/repositorio-copropiedades-pg';
import type { ContextoTenant } from '../src/autenticacion/dominio/claims';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-15I-05 · EL PATRÓN SE GUARDA EN HORA LOCAL Y SE LEÍA COMO UTC
 *
 * `patrones_recurrencia.hora_inicio/hora_fin` son hora LOCAL de la copropiedad
 * (COMMENT de la 0006). Las dos lecturas del repositorio reconstruían el patrón
 * con `desplazamientoUtcMinutos: 0`, así que en Bogotá una franja de 14:00 a
 * 18:00 abría de 09:00 a 13:00, y después de las 19:00 locales el día de la
 * semana ya era el siguiente.
 *
 * Todo pasa por el camino real: la autorización se crea con el caso de uso de
 * la consola (o con SQL directo, para la fila «de antes»), el motor decide con
 * `CargadorDeContextoPg` contra la base, y el reloj es el MISMO para el motor y
 * para el repositorio. El desplazamiento que manda el navegador es a propósito
 * absurdo (+120): si decidiera algo, estas pruebas lo verían.
 *
 * Se salta sin `DATABASE_URL_PRUEBAS`, y el verificador lo cuenta como omitida.
 * ═════════════════════════════════════════════════════════════════════════════
 */

const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';
const VIVIENDA_CON_TITULAR = '30000000-0000-4000-8000-000000000001';
const DISPOSITIVO = '90000000-0000-4000-8000-000000000001';
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();
const BOGOTA_UTC_HORAS = 5;
const DESPLAZAMIENTO_DEL_NAVEGADOR = 120;

let pool: Pool | undefined;
let disponible = false;
let actorId = '';
let personaId = '';

let instante = new Date(0);
const reloj: Reloj = { ahora: () => instante };
const ids: GeneradorDeId = { nuevo: () => randomUUID() };
const bitacora: Bitacora = { registrar: () => undefined };

/**
 * Un lunes con al menos una semana de margen, como fecha civil. Relativo al
 * momento de la corrida para que la vigencia nunca nazca vencida frente a la
 * base, que compara con su propio `now()`.
 */
const lunes = ((): { a: number; m: number; d: number } => {
  const base = new Date(Date.now() + 8 * 24 * 3600 * 1000);
  const adelante = (8 - base.getUTCDay()) % 7;
  const f = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + adelante),
  );
  return { a: f.getUTCFullYear(), m: f.getUTCMonth(), d: f.getUTCDate() };
})();

/** Hora civil de Bogotá (UTC−5, sin horario de verano) del lunes, más `dias`. */
const enBogota = (hora: number, minuto: number, dias = 0): Date =>
  new Date(Date.UTC(lunes.a, lunes.m, lunes.d + dias, hora + BOGOTA_UTC_HORAS, minuto));

const ctx = (): ContextoTenant => ({
  usuarioId: actorId,
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});
const claims = () => ({ rol: 'administrador', usuario_id: actorId, copropiedad_id: COP });

const repositorio = (): RepositorioAutorizacionesPg =>
  new RepositorioAutorizacionesPg(pool as Pool, claims(), 'bucket-de-prueba', reloj);

const decidir = async (placa: string, cuando: Date): Promise<ResultadoAcceso> => {
  instante = cuando;
  const p = pool as Pool;
  const padron = new RepositorioPadronPg(p, claims());
  const placas: ResolutorDePlaca = {
    resolver: async (cop, leida) => {
      const v = Placa.crear(leida);
      return esExito(v) ? padron.resolverPlaca(cop, v.valor) : null;
    },
  };
  const cargador = new CargadorDeContextoPg(
    new VersionDeReglasFija(),
    repositorio(),
    placas,
    new RepositorioListaNegraPg(p, claims()),
    new RepositorioCopropiedadesPg(p),
    bitacora,
  );
  return new DecidirAcceso(cargador, reloj).ejecutar({
    copropiedadId: COP,
    dispositivoId: DISPOSITIVO,
    metodo: 'placa',
    personaId: null,
    placaLeida: placa,
    zonaId: null,
    confianza: 0.95,
  });
};

const motivoDe = (r: ResultadoAcceso): string => (r.permitido ? 'PERMITIDO' : r.motivo);

/** Recurrente creada por la CONSOLA, con el caso de uso y el repositorio reales. */
const crearDesdeLaConsola = async (
  placa: string,
  dias: number[],
  minutoInicio: number,
  minutoFin: number,
): Promise<string> => {
  instante = enBogota(0, 0, -1);
  const r = await new CrearAutorizacion(repositorio(), reloj, ids).ejecutar(ctx(), {
    viviendaId: VIVIENDA_CON_TITULAR,
    personaId,
    desde: enBogota(0, 0, -2).toISOString(),
    hasta: enBogota(0, 0, 7).toISOString(),
    placa,
    observaciones: `15-J ${CORRIDA}`,
    patron: {
      dias,
      minutoInicio,
      minutoFin,
      desplazamientoUtcMinutos: DESPLAZAMIENTO_DEL_NAVEGADOR,
    },
  });
  expect(esExito(r), esFallo(r) ? r.error.detalle : '').toBe(true);
  if (!esExito(r)) throw new Error('no se creó la autorización de prueba');
  return r.valor.id;
};

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    const usuario = await pool.query<{ id: string }>(
      `SELECT id FROM public.usuarios WHERE copropiedad_id = $1 ORDER BY id LIMIT 1`,
      [COP],
    );
    actorId = usuario.rows[0]?.id ?? '';
    // Una persona NUEVA por corrida: ninguna lista negra ni autorización previa
    // puede decidir por el patrón.
    const persona = await pool.query<{ id: string }>(
      `INSERT INTO public.personas
         (copropiedad_id, tipo_documento, numero_documento, nombre_completo,
          creado_por, actualizado_por)
       VALUES ($1, 'cedula', $2, $3, $4, $4) RETURNING id`,
      [
        COP,
        `97${parseInt(CORRIDA, 16).toString().padStart(8, '0')}`,
        `Visita 15-J ${CORRIDA}`,
        actorId,
      ],
    );
    personaId = persona.rows[0]?.id ?? '';
    disponible = actorId !== '' && personaId !== '';
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  await pool?.end();
});

describe('H-15I-05 · el patrón guardado en hora local se evalúa en la hora de la copropiedad', () => {
  it('la base de pruebas contesta y la copropiedad está en America/Bogota', async () => {
    if (!URL_BASE) return;
    expect(disponible, 'DATABASE_URL_PRUEBAS definida pero la base no contesta').toBe(true);
    const { rows } = await (pool as Pool).query<{ zona_horaria: string }>(
      `SELECT zona_horaria FROM public.copropiedades WHERE id = $1`,
      [COP],
    );
    expect(rows[0]?.zona_horaria).toBe('America/Bogota');
  });

  describe('recurrente L-V de 14:00 a 18:00, creada desde la consola', () => {
    const placa = `PA${CORRIDA}`;
    let autorizacionId = '';

    it('se guarda en HORA LOCAL: ni el desplazamiento del navegador ni UTC tocan la fila', async () => {
      if (!disponible) return;
      autorizacionId = await crearDesdeLaConsola(placa, [1, 2, 3, 4, 5], 14 * 60, 18 * 60);
      const { rows } = await (pool as Pool).query<{ hora_inicio: string; hora_fin: string }>(
        `SELECT DISTINCT hora_inicio::text AS hora_inicio, hora_fin::text AS hora_fin
           FROM public.patrones_recurrencia
          WHERE copropiedad_id = $1 AND autorizacion_id = $2`,
        [COP, autorizacionId],
      );
      expect(rows).toEqual([{ hora_inicio: '14:00:00', hora_fin: '18:00:00' }]);
    });

    it('lunes 15:00 en Bogotá → PERMITIDO', async () => {
      if (!disponible || autorizacionId === '') return;
      expect(motivoDe(await decidir(placa, enBogota(15, 0)))).toBe('PERMITIDO');
    });

    it('lunes 10:00 en Bogotá → FUERA_DE_PATRON (antes de la corrección, abría: son las 15:00 UTC)', async () => {
      if (!disponible || autorizacionId === '') return;
      expect(motivoDe(await decidir(placa, enBogota(10, 0)))).toBe('FUERA_DE_PATRON');
    });

    it('lunes 18:01 en Bogotá → FUERA_DE_PATRON', async () => {
      if (!disponible || autorizacionId === '') return;
      expect(motivoDe(await decidir(placa, enBogota(18, 1)))).toBe('FUERA_DE_PATRON');
    });

    it('la otra lectura (`porId`) rehidrata con el desplazamiento de la ZONA, no con el del navegador', async () => {
      if (!disponible || autorizacionId === '') return;
      instante = enBogota(15, 0);
      const a = await repositorio().porId(COP, autorizacionId);
      expect(a?.patron?.desplazamientoUtcMinutos).toBe(-BOGOTA_UTC_HORAS * 60);
      expect(a?.patron?.aplicaEn(enBogota(15, 0))).toBe(true);
      expect(a?.patron?.aplicaEn(enBogota(10, 0))).toBe(false);
    });
  });

  describe('sólo lunes, de 19:00 a 21:00: a las 20:00 locales ya es MARTES en UTC', () => {
    const placa = `PB${CORRIDA}`;
    let autorizacionId = '';

    it('lunes 20:00 en Bogotá → PERMITIDO', async () => {
      if (!disponible) return;
      autorizacionId = await crearDesdeLaConsola(placa, [1], 19 * 60, 21 * 60);
      expect(motivoDe(await decidir(placa, enBogota(20, 0)))).toBe('PERMITIDO');
    });

    it('martes 20:00 en Bogotá → FUERA_DE_PATRON', async () => {
      if (!disponible || autorizacionId === '') return;
      expect(motivoDe(await decidir(placa, enBogota(20, 0, 1)))).toBe('FUERA_DE_PATRON');
    });
  });

  describe('una fila escrita ANTES de la corrección se evalúa bien sin migración', () => {
    const placa = `PC${CORRIDA}`;
    let autorizacionId = '';

    it('se inserta como la escribía el adaptador —hora local, sin columna nueva— y decide en hora local', async () => {
      if (!disponible || pool === undefined) return;
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
          JSON.stringify(claims()),
        ]);
        const visitante = await c.query<{ id: string }>(
          `INSERT INTO public.visitantes (copropiedad_id, persona_id, creado_por, actualizado_por)
           VALUES ($1, $2, $3, $3)
           ON CONFLICT DO NOTHING RETURNING id`,
          [COP, personaId, actorId],
        );
        const visitanteId =
          visitante.rows[0]?.id ??
          (
            await c.query<{ id: string }>(
              `SELECT id FROM public.visitantes
                WHERE copropiedad_id = $1 AND persona_id = $2 AND estado = 'activo'`,
              [COP, personaId],
            )
          ).rows[0]?.id;
        const titular = await c.query<{ id: string }>(
          `SELECT id FROM public.residentes
            WHERE copropiedad_id = $1 AND vivienda_id = $2 AND es_titular AND estado = 'activo'
            ORDER BY creado_en LIMIT 1`,
          [COP, VIVIENDA_CON_TITULAR],
        );
        const creada = await c.query<{ id: string }>(
          `INSERT INTO public.autorizaciones
             (copropiedad_id, vivienda_id, visitante_id, autorizado_por, tipo, vigencia,
              placa, permite_acceso_vehicular, estado, creado_por, actualizado_por)
           VALUES ($1, $2, $3, $4, 'recurrente', tstzrange($5, $6, '[)'),
                   $7, true, 'activa', $8, $8)
           RETURNING id`,
          [
            COP,
            VIVIENDA_CON_TITULAR,
            visitanteId,
            titular.rows[0]?.id,
            enBogota(0, 0, -2),
            enBogota(0, 0, 7),
            placa,
            actorId,
          ],
        );
        autorizacionId = creada.rows[0]?.id ?? '';
        for (const dia of [1, 2, 3, 4, 5]) {
          await c.query(
            `INSERT INTO public.patrones_recurrencia
               (copropiedad_id, autorizacion_id, dia_semana, hora_inicio, hora_fin,
                creado_por, actualizado_por)
             VALUES ($1, $2, $3, '14:00'::time, '18:00'::time, $4, $4)`,
            [COP, autorizacionId, dia, actorId],
          );
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
      expect(autorizacionId).not.toBe('');
      expect(motivoDe(await decidir(placa, enBogota(15, 0)))).toBe('PERMITIDO');
      expect(motivoDe(await decidir(placa, enBogota(10, 0)))).toBe('FUERA_DE_PATRON');
    });
  });
});
