import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { RepositorioEventosDeEquipoPg } from '../src/eventos/infraestructura/repositorio-eventos-de-equipo-pg';
import { PreferenciasDeAtencionPg } from '../src/guardia/infraestructura/preferencias-de-atencion-pg';
import { mezclarPreferencias } from '../src/guardia/aplicacion/preferencias-de-atencion';
import { ACTOR_INGESTA } from '../src/comun/actores-de-servicio';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * G1 · G2 (15-N) · LA COLA DE ATENCIÓN CONTRA POSTGRESQL (RLS FORZADA)
 *
 * La función pura y el cableado ya se prueban en memoria. Aquí lo que sólo la
 * base puede decir: que el filtro de la cola lee por RECEPCIÓN —el videoportero
 * del 29/09 fechaba 13 h atrás y por hora del equipo su llamada no aparecía—,
 * que deja fuera el histórico y lo que no dispara, y que las preferencias se
 * guardan y leen por copropiedad (migración 0046).
 */
const COP = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';
const CORRIDA = randomBytes(4).toString('hex');
let pool: Pool | undefined;
let dispositivoId = '';

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    pool = new Pool({ connectionString: URL_BASE, max: 4 });
    const c = await pool.connect();
    try {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ rol: 'superadministrador', usuario_id: ACTOR_INGESTA }),
      ]);
      const r = await c.query<{ id: string }>(
        `INSERT INTO public.dispositivos
           (copropiedad_id, nombre, tipo, host, puerto, credencial_ref, creado_por, actualizado_por)
         VALUES ($1, $2, 'intercom', $3, 80, 'vault:pendiente', $4, $4)
         RETURNING id`,
        [COP, `Videoportero de la cola ${CORRIDA}`, `cola-${CORRIDA}.invalid`, ACTOR_INGESTA],
      );
      dispositivoId = r.rows[0]?.id ?? '';
    } finally {
      c.release();
    }
  } catch {
    dispositivoId = '';
  }
});
afterAll(async () => {
  await pool?.end();
});

const omitida = (): boolean => dispositivoId === '';

const registrar = (tipo: string, enVivo: boolean, ocurridoEn: Date, sufijo: string) =>
  new RepositorioEventosDeEquipoPg(pool as Pool).registrar({
    copropiedadId: COP,
    dispositivoId,
    tipo,
    titulo: `${tipo} ${sufijo}`,
    codigoMayor: null,
    codigoMenor: null,
    origen: 'equipo',
    enVivo,
    ocurridoEn,
    horaDelEquipo: null,
    eventoId: null,
    claveIdempotencia: `cola-${CORRIDA}-${sufijo}`,
    carga: {},
    creadoPor: ACTOR_INGESTA,
  });

describe('G1 · lo que la cola lee de `eventos_de_equipo`', () => {
  exigirBase('sin DATABASE_URL_PRUEBAS o sin semillas', () => dispositivoId !== '');

  it('por recepción, en vivo y sólo lo que dispara: el reloj 13 h atrasado no la esconde', async () => {
    if (omitida()) return;
    const ahora = new Date();
    const trece = new Date(ahora.getTime() - 46_727_000);
    await registrar('llamada', true, trece, 'atrasada');
    await registrar('llamada', false, ahora, 'historica');
    await registrar('puerta_abierta', true, ahora, 'puerta');
    const repo = new RepositorioEventosDeEquipoPg(pool as Pool);
    const ventana = {
      copropiedadId: COP,
      desde: new Date(ahora.getTime() - 60_000),
      hasta: new Date(ahora.getTime() + 60_000),
      dispositivoId,
      limite: 50,
    };
    const deLaCola = await repo.consultar({
      ...ventana,
      porRecepcion: true,
      soloEnVivo: true,
      tipos: ['llamada', 'llamada_colgada'],
    });
    expect(deLaCola.map((e) => e.titulo)).toEqual(['llamada atrasada']);
    // Por hora del equipo —como antes de la 15-N— la misma llamada no sale.
    const porHoraDelEquipo = await repo.consultar({ ...ventana, tipos: ['llamada'] });
    expect(porHoraDelEquipo.map((e) => e.titulo)).not.toContain('llamada atrasada');
  });
});

describe('G2 · preferencias de atención (0046)', () => {
  exigirBase('sin DATABASE_URL_PRUEBAS o sin semillas', () => dispositivoId !== '');

  it('se guardan por copropiedad y otra copropiedad no las ve', async () => {
    if (omitida()) return;
    const repo = new PreferenciasDeAtencionPg(pool as Pool);
    const propias = mezclarPreferencias({ placa: { sonar: false } });
    await repo.guardar(COP, propias, ACTOR_INGESTA);
    expect(mezclarPreferencias(await repo.leer(COP)).placa).toEqual({ abrir: true, sonar: false });
    await repo.guardar(COP, mezclarPreferencias({ placa: { abrir: false } }), ACTOR_INGESTA);
    expect(mezclarPreferencias(await repo.leer(COP)).placa).toEqual({ abrir: false, sonar: true });
    // Con los claims de A la fila se ve; con los de B no existe (RLS forzada).
    // La positiva va primero: sin ella, unos claims mal formados darían un
    // «no la ve» que no prueba nada.
    const filasCon = async (copropiedadId: string): Promise<number> => {
      const c = await (pool as Pool).connect();
      try {
        await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
          JSON.stringify({
            rol: 'administrador',
            copropiedad_id: copropiedadId,
            usuario_id: ACTOR_INGESTA,
          }),
        ]);
        await c.query('SET ROLE authenticated');
        const { rows } = await c.query(
          'SELECT 1 FROM public.preferencias_de_atencion WHERE copropiedad_id = $1',
          [COP],
        );
        return rows.length;
      } finally {
        await c.query('RESET ROLE');
        c.release();
      }
    };
    expect(await filasCon(COP)).toBe(1);
    expect(await filasCon(COP_B)).toBe(0);
  });
});
