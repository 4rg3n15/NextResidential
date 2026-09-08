import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { Acceso, FiltroDeEventos, VersionDeReglas, esExito } from '@ncr/domain-core';
import type { HechoDeAcceso } from '@ncr/domain-core';
import { permitir } from '@ncr/domain-core';
import { RepositorioEventosPg } from '../src/eventos/infraestructura/repositorio-eventos-pg';

/**
 * El adaptador PostgreSQL de eventos contra una base REAL — y con él, el
 * **pendiente que la ETAPA 01 dejó abierto**.
 *
 * El cierre de la ETAPA 01 anotó: «La prueba de ejecución del `UPDATE` quedó
 * pendiente por tabla de eventos vacía — es la única comprobación del cierre
 * que no está demostrada por ejecución». Sobre una tabla sin filas, un `UPDATE`
 * que no falla tampoco prueba nada: afecta a cero filas y devuelve éxito. Esta
 * etapa produce filas, así que la comprobación ya se puede hacer de verdad, y
 * se hace **sobre un evento insertado por el adaptador de la aplicación**, no
 * por un `INSERT` escrito a mano en un guion SQL: el camino que importa es el
 * que recorre el código.
 *
 * Se OMITE —no falla— sin `DATABASE_URL_PRUEBAS`. Cuando se omite, lo dice.
 * La ETAPA 14 la lleva a CI, donde deja de poder omitirse.
 */
/**
 * Sello único por EJECUCIÓN, no por milisegundo.
 *
 * `Date.now()` bastaba mientras la suite corría una vez; desde que el paso 14
 * la ejecuta tres veces seguidas contra la misma base, dos corridas pueden
 * caer en el mismo milisegundo y chocar con las filas que dejó la anterior —y
 * en `eventos` no hay borrado (RN-03), así que esas filas no se van.
 */
const CORRIDA = randomBytes(6).toString('hex');

const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';
const COP_AJENA = '10000000-0000-4000-8000-000000000002';

let pool: Pool | undefined;
let disponible = false;
let actorId = '';
let dispositivoId = '';
let viviendaId = '';

const claims = (copropiedadId = COP): Record<string, unknown> => ({
  rol: 'administrador',
  usuario_id: actorId,
  copropiedad_id: copropiedadId,
});

const version = (copropiedadId = COP): VersionDeReglas => {
  const v = VersionDeReglas.crear(1, copropiedadId);
  if (!esExito(v)) throw new Error('versión de prueba inválida');
  return v.valor;
};

let secuencia = 0;
const acceso = (extra: Partial<HechoDeAcceso> = {}): Acceso => {
  secuencia += 1;
  const hecho: HechoDeAcceso = {
    id: crypto.randomUUID(),
    copropiedadId: COP,
    ocurridoEn: new Date(),
    tipo: 'ingreso',
    metodo: 'placa',
    dispositivoId,
    viviendaId,
    placaDetectada: 'ABC123',
    confianza: 0.97,
    claveIdempotencia: `pg-prueba-${CORRIDA}-${secuencia}`,
    ...extra,
  };
  const a = Acceso.desdeDecision(hecho, permitir(version(hecho.copropiedadId), 'prueba.permite'));
  if (!esExito(a)) throw new Error(`hecho de prueba inválido: ${a.error.detalle}`);
  return a.valor;
};

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    pool = new Pool({ connectionString: URL_BASE, max: 10 });
    const c = await pool.connect();
    // La RLS está FORZADA y alcanza al dueño: sin claims estas consultas
    // devolverían cero filas y la prueba se omitiría creyendo que no hay base.
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        rol: 'administrador',
        usuario_id: '00000000-0000-4000-8000-000000000010',
        copropiedad_id: COP,
      }),
    ]);
    const u = await c.query<{ id: string }>(
      'SELECT id FROM public.usuarios WHERE copropiedad_id=$1 LIMIT 1',
      [COP],
    );
    const d = await c.query<{ id: string }>(
      'SELECT id FROM public.dispositivos WHERE copropiedad_id=$1 LIMIT 1',
      [COP],
    );
    const v = await c.query<{ id: string }>(
      "SELECT id FROM public.viviendas WHERE copropiedad_id=$1 AND estado='activo' LIMIT 1",
      [COP],
    );
    c.release();
    actorId = u.rows[0]?.id ?? '';
    dispositivoId = d.rows[0]?.id ?? '';
    viviendaId = v.rows[0]?.id ?? '';
    disponible = Boolean(actorId && dispositivoId && viviendaId);
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  await pool?.end();
});

const omitida = (): boolean => {
  if (disponible) return false;
  console.warn('OMITIDA: sin DATABASE_URL_PRUEBAS o sin semillas. Se ejecuta en CI (ETAPA 14).');
  return true;
};

describe('RepositorioEventosPg · anexado idempotente (RN-17, CA-22)', () => {
  it('anexa un evento y lo devuelve por identificador', async () => {
    if (omitida()) return;
    const repo = new RepositorioEventosPg(pool as Pool, claims());
    const a = acceso();

    expect(await repo.anexar(a, actorId)).toEqual({ tipo: 'anexado', id: a.id });
    const leido = await repo.porId(COP, a.id);
    expect(leido?.reglaAplicada).toBe('prueba.permite');
    expect(leido?.metodo).toBe('placa');
    expect(leido?.confianza).toBe(0.97);
  });

  it('el segundo anexado con la MISMA clave devuelve `duplicado` con el id del primero', async () => {
    if (omitida()) return;
    const repo = new RepositorioEventosPg(pool as Pool, claims());
    const primero = acceso();
    await repo.anexar(primero, actorId);

    // Mismo hecho, instante recalculado y otro id: es exactamente lo que hace
    // el Edge al reconciliar, y lo que el índice único particionado NO puede
    // detectar. Lo detiene `recepciones_evento` (migración 0019).
    const reintento = acceso({
      claveIdempotencia: primero.claveIdempotencia,
      ocurridoEn: new Date(Date.now() + 5_000),
    });

    expect(await repo.anexar(reintento, actorId)).toEqual({
      tipo: 'duplicado',
      id: primero.id,
    });
    expect(await repo.porId(COP, reintento.id)).toBeNull();
  });

  it('el duplicado NO deja una fila a medias: la recepción se escribe primero', async () => {
    if (omitida()) return;
    const repo = new RepositorioEventosPg(pool as Pool, claims());
    const primero = acceso();
    await repo.anexar(primero, actorId);

    const antes = await contarEventos();
    await repo.anexar(acceso({ claveIdempotencia: primero.claveIdempotencia }), actorId);
    expect(await contarEventos()).toBe(antes);
  });

  it('una clave distinta del mismo dispositivo sí entra', async () => {
    if (omitida()) return;
    const repo = new RepositorioEventosPg(pool as Pool, claims());
    const a = acceso();
    const b = acceso();
    await repo.anexar(a, actorId);
    expect((await repo.anexar(b, actorId)).tipo).toBe('anexado');
  });
});

describe('RepositorioEventosPg · consulta y paginación', () => {
  it('filtra por rango y pagina por cursor sin repetir ni saltar filas', async () => {
    if (omitida()) return;
    const repo = new RepositorioEventosPg(pool as Pool, claims());
    const marca = `lote-${CORRIDA}`;
    for (let i = 0; i < 5; i += 1) {
      await repo.anexar(acceso({ claveIdempotencia: `${marca}-${i}` }), actorId);
    }

    const criterios = {
      copropiedadId: COP,
      desde: new Date(Date.now() - 600_000),
      hasta: new Date(Date.now() + 600_000),
      tamanoPagina: 2,
    };
    const filtro = FiltroDeEventos.crear(criterios);
    if (!esExito(filtro)) throw new Error('filtro inválido');

    const primera = await repo.consultar(filtro.valor);
    expect(primera.filas.length).toBe(2);
    expect(primera.siguiente).not.toBeNull();

    const segundoFiltro = FiltroDeEventos.crear({ ...criterios, cursor: primera.siguiente });
    if (!esExito(segundoFiltro)) throw new Error('filtro inválido');
    const segunda = await repo.consultar(segundoFiltro.valor);

    const ids = [...primera.filas, ...segunda.filas].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('traduce el método del enumerado de la base al del dominio', async () => {
    if (omitida()) return;
    const repo = new RepositorioEventosPg(pool as Pool, claims());
    const a = acceso({ metodo: 'facial', placaDetectada: null });
    await repo.anexar(a, actorId);
    // En la base se guarda `rostro`; el dominio dice `facial`.
    expect((await repo.porId(COP, a.id))?.metodo).toBe('facial');
    expect(await metodoEnBase(a.id)).toBe('rostro');
  });

  it('no devuelve un evento de otra copropiedad (RN-15)', async () => {
    if (omitida()) return;
    const repo = new RepositorioEventosPg(pool as Pool, claims());
    const a = acceso();
    await repo.anexar(a, actorId);
    expect(await repo.porId(COP_AJENA, a.id)).toBeNull();
  });
});

describe('INMUTABILIDAD SOBRE UN EVENTO REAL · cierra el pendiente de la ETAPA 01', () => {
  it('un UPDATE sobre un evento que EXISTE es rechazado (RN-03, CA-23, ADR-005)', async () => {
    if (omitida()) return;
    const repo = new RepositorioEventosPg(pool as Pool, claims());
    const a = acceso();
    await repo.anexar(a, actorId);

    // Aquí está la diferencia con lo que se pudo hacer en la ETAPA 01: la fila
    // existe, así que si el UPDATE tuviera éxito afectaría a UNA fila y la
    // alteraría. Un `rowCount` de 0 sería un falso verde, y por eso se
    // comprueba además que la regla siguió intacta.
    const cliente = await (pool as Pool).connect();
    let fallo: unknown = null;
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claims()),
      ]);
      await cliente.query('UPDATE public.eventos SET regla_aplicada=$2 WHERE id=$1', [
        a.id,
        'ALTERADA',
      ]);
    } catch (e) {
      fallo = e;
    } finally {
      cliente.release();
    }

    expect(fallo, 'el UPDATE sobre un evento existente NO fue rechazado').not.toBeNull();
    expect(String(fallo)).toMatch(/append-only|permission denied|restrict/i);

    const despues = await repo.porId(COP, a.id);
    expect(despues?.reglaAplicada).toBe('prueba.permite');
  });

  it('un DELETE sobre ese mismo evento también es rechazado', async () => {
    if (omitida()) return;
    const repo = new RepositorioEventosPg(pool as Pool, claims());
    const a = acceso();
    await repo.anexar(a, actorId);

    const cliente = await (pool as Pool).connect();
    let fallo: unknown = null;
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claims()),
      ]);
      await cliente.query('DELETE FROM public.eventos WHERE id=$1', [a.id]);
    } catch (e) {
      fallo = e;
    } finally {
      cliente.release();
    }

    expect(fallo, 'el DELETE sobre un evento existente NO fue rechazado').not.toBeNull();
    expect(await repo.porId(COP, a.id)).not.toBeNull();
  });

  it('el libro de recepciones también es inmutable', async () => {
    if (omitida()) return;
    const repo = new RepositorioEventosPg(pool as Pool, claims());
    const a = acceso();
    await repo.anexar(a, actorId);

    const cliente = await (pool as Pool).connect();
    let fallo: unknown = null;
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claims()),
      ]);
      await cliente.query(
        'UPDATE public.recepciones_evento SET evento_id=$2 WHERE copropiedad_id=$3 AND clave_idempotencia=$1',
        [a.claveIdempotencia, crypto.randomUUID(), COP],
      );
    } catch (e) {
      fallo = e;
    } finally {
      cliente.release();
    }
    // Sin esto, reapuntar la recepción a otro evento permitiría colar un
    // duplicado: la idempotencia dejaría de ser una garantía.
    expect(fallo).not.toBeNull();
  });
});

const contarEventos = async (): Promise<number> => {
  const cliente = await (pool as Pool).connect();
  try {
    await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claims()),
    ]);
    const { rows } = await cliente.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM public.eventos WHERE copropiedad_id=$1',
      [COP],
    );
    return Number(rows[0]?.n ?? '0');
  } finally {
    cliente.release();
  }
};

const metodoEnBase = async (eventoId: string): Promise<string> => {
  const cliente = await (pool as Pool).connect();
  try {
    await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claims()),
    ]);
    const { rows } = await cliente.query<{ metodo: string }>(
      'SELECT metodo::text FROM public.eventos WHERE id=$1',
      [eventoId],
    );
    return rows[0]?.metodo ?? '';
  } finally {
    cliente.release();
  }
};
