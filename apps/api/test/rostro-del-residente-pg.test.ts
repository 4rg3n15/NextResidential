import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { POLITICA_DEL_ROSTRO } from '../src/residente/aplicacion/politica-del-rostro';
import { ipDePrueba } from './banco-del-hogar-pg';
import { bancoConTerminales } from './terminales-de-rostro-pg';
import type { Sesion } from './banco-del-hogar-pg';
import { interferenciaActiva, sesionAjenaParada } from './interferencia';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · «MI ROSTRO» CONTRA LA BASE REAL (ADR-039, D-W3, Ley 1581)
 *
 * Alta con la política vigente y el consentimiento del titular · reemplazo en
 * una transacción, con el anterior fuera de los equipos en el acto · dos
 * registros a la vez, con rostro previo o sin él: uno gana y el otro 409, sin
 * consentimiento huérfano · el vecino no alcanza mi rostro ·
 * 5 capturas en 24 h contadas en la base y la sexta 429 con Retry-After ·
 * retiro que revoca y suprime en el acto · la baja de la cuenta lo suprime ·
 * y nunca la imagen.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const {
  banco,
  espia,
  terminales: altaDeTerminales,
} = bancoConTerminales('sin DATABASE_URL_PRUEBAS o sin la migración 0057');
const omitida = (): boolean => !banco.disponible;

const jpeg = (): string =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    randomBytes(96),
    Buffer.from([0xff, 0xd9]),
  ]).toString('base64');
const MEDIDAS = { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 };
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  contenidoBase64: jpeg(),
  tipoMime: 'image/jpeg',
  medidas: MEDIDAS,
  versionPolitica: POLITICA_DEL_ROSTRO.version,
  aceptaPolitica: true,
  ...extra,
});

describe('15-X · D2 · mi rostro', () => {
  const s = banco.sufijo;
  let cop = { id: '', codigo: '' };
  let yo: Sesion = { usuarioId: '', token: '' };
  let vecino: Sesion = { usuarioId: '', token: '' };
  const terminales: string[] = [];
  const ruta = () => `/copropiedades/${cop.id}/mi/rostro`;
  const pedir = (t: string, metodo: 'get' | 'post', r: string, c?: object) =>
    banco.con(t, metodo, r, c).set('x-forwarded-for', ipDePrueba());
  const vivas = async (usuarioId: string) =>
    (
      await banco.pool.query<{ id: string; suprimir_en: Date }>(
        `SELECT p.id, p.suprimir_en FROM public.plantillas_biometricas p
           JOIN public.usuarios u ON u.persona_id = p.persona_id
          WHERE u.id = $1 AND p.autorizacion_id IS NULL
            AND p.estado IN ('pendiente_consentimiento','pendiente_sincronizacion','activa')`,
        [usuarioId],
      )
    ).rows;

  /**
   * Dos registros de `quien` que se paran tras el cerrojo de `bloqueo` y salen
   * a la vez cuando los dos esperan un cerrojo en la transacción del alta: en
   * el consentimiento o en el rostro anterior, según quién llegó primero.
   */
  /**
   * 15-S5 · DT-15M-C01 · cuántas sesiones esperan, directa o indirectamente, a
   * la que tiene `cerrojo`: las peticiones de ESTA prueba y nadie más. Contar
   * en `pg_stat_activity` por el texto del SQL contaba también a otras.
   */
  const detrasDe = async (cerrojo: PoolClient): Promise<number> => {
    const { rows } = await cerrojo.query<{ n: number }>(
      `WITH RECURSIVE cadena(pid) AS (
         SELECT a.pid FROM pg_stat_activity a WHERE pg_backend_pid() = ANY(pg_blocking_pids(a.pid))
         UNION
         SELECT a.pid FROM pg_stat_activity a, cadena c WHERE c.pid = ANY(pg_blocking_pids(a.pid))
       ) SELECT count(*)::int AS n FROM cadena`,
    );
    return rows[0]?.n ?? 0;
  };

  const aLaVez = async (quien: Sesion, bloqueo: string, params: unknown[]) => {
    const cerrojo = await banco.pool.connect();
    // 15-S5 · una sesión de otro fichero parada con el mismo SQL, en la misma base.
    const ajenas = interferenciaActiva('sesion-ajena-parada')
      ? await Promise.all(
          [1, 2].map(() =>
            sesionAjenaParada(banco.pool, 'INSERT INTO public.consentimientos_biometricos'),
          ),
        )
      : [];
    const soltar = async () => {
      for (const s of ajenas) await s();
    };
    try {
      await cerrojo.query('BEGIN');
      await cerrojo.query(bloqueo, params);
      const dos = [1, 2].map(() => pedir(quien.token, 'post', ruta(), cuerpo()).then((x) => x));
      for (let i = 0; i < 200 && (await detrasDe(cerrojo)) < 2; i += 1) {
        await new Promise((listo) => setTimeout(listo, 25));
      }
      // 15-S5 · las DOS peticiones de esta prueba esperan detrás del cerrojo al soltarlo.
      expect(await detrasDe(cerrojo), 'las dos peticiones esperaban').toBeGreaterThanOrEqual(2);
      await cerrojo.query('COMMIT');
      return (await Promise.all(dos)).map((x) => x.status).sort();
    } finally {
      cerrojo.release();
      await soltar();
    }
  };

  it('prepara: la 0057, una copropiedad con dos terminales de rostros, yo y un vecino', async () => {
    if (omitida()) return;
    expect(
      await banco.uno(
        "SELECT 1 AS si FROM pg_indexes WHERE indexname = 'plantillas_residente_viva_uk'",
        [],
      ),
    ).toEqual({ si: 1 });
    cop = await banco.copropiedadPropia();
    yo = await banco.titular(cop.id, await banco.vivienda(cop.id, '1'), `ros.${s}`);
    await banco.completarAlta(cop.id, yo.token, banco.perfil(1));
    vecino = await banco.titular(cop.id, await banco.vivienda(cop.id, '2'), `vro.${s}`);
    await banco.completarAlta(cop.id, vecino.token, banco.perfil(2));
    terminales.push(...(await altaDeTerminales(cop.id, ['Terminal A', 'Videoportero B'])));
  });

  it('sin rostro: el estado y la política vigente, y ni rastro de imagen', async () => {
    if (omitida()) return;
    const r = await pedir(yo.token, 'get', ruta());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toMatchObject({
      estado: 'sin_rostro',
      equiposConRostro: 2,
      politica: POLITICA_DEL_ROSTRO,
    });
  });

  it('con una política que ya no es la vigente: 409, y no se crea nada', async () => {
    if (omitida()) return;
    const r = await pedir(yo.token, 'post', ruta(), cuerpo({ versionPolitica: 'rostro-vieja' }));
    expect(r.status).toBe(409);
    expect(await vivas(yo.usuarioId)).toEqual([]);
  });

  let primera = '';
  it('alta: 201, en los dos equipos, consentimiento del titular, 365 días y la bitácora sin bytes', async () => {
    if (omitida()) return;
    const foto = cuerpo();
    const r = await pedir(yo.token, 'post', ruta(), foto);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ estado: 'activa', equiposConMiRostro: 2 });
    expect(JSON.stringify(r.body)).not.toContain(foto.contenidoBase64.slice(0, 24));
    const [viva] = await vivas(yo.usuarioId);
    primera = viva?.id ?? '';
    const dias = ((viva?.suprimir_en.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(364);
    expect(dias).toBeLessThan(366);
    expect(terminales.map((t) => espia.recibidas.includes(`${t}/${primera}`))).toEqual([
      true,
      true,
    ]);
    expect(
      await banco.uno<{ origen: string; canal: string; estado: string }>(
        `SELECT c.origen, c.canal::text, c.estado::text FROM public.consentimientos_biometricos c
           JOIN public.plantillas_biometricas p ON p.consentimiento_id = c.id WHERE p.id = $1`,
        [primera],
      ),
    ).toEqual({ origen: 'otorgado_por_el_titular', canal: 'app', estado: 'vigente' });
    const hecho = await banco.uno<{ detalle: string | null }>(
      `SELECT detalle FROM public.bitacora_de_residentes WHERE usuario_id = $1 AND tipo = 'rostro_registrado'`,
      [yo.usuarioId],
    );
    expect(hecho?.detalle).toBe(`politica:${POLITICA_DEL_ROSTRO.version}`);
  });

  it('reemplazo: el anterior suprimido y fuera de los dos equipos en el acto; uno vivo', async () => {
    if (omitida()) return;
    const r = await pedir(yo.token, 'post', ruta(), cuerpo());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect((await vivas(yo.usuarioId)).map((v) => v.id)).not.toContain(primera);
    expect(await vivas(yo.usuarioId)).toHaveLength(1);
    expect(terminales.map((t) => espia.retiradas.includes(`${t}/${primera}`))).toEqual([
      true,
      true,
    ]);
  });

  it('dos registros a la vez sobre el mismo rostro: uno gana y el otro 409', async () => {
    if (omitida()) return;
    const [anterior] = await vivas(yo.usuarioId);
    const bloqueo = 'SELECT 1 FROM public.plantillas_biometricas WHERE id = $1 FOR UPDATE';
    const estados = await aLaVez(yo, bloqueo, [anterior?.id]);
    expect(estados).toEqual([201, 409]);
    expect(await vivas(yo.usuarioId)).toHaveLength(1);
  });

  it('el vecino no alcanza mi rostro: ve el suyo (ninguno) y su retiro es 404', async () => {
    if (omitida()) return;
    expect((await pedir(vecino.token, 'get', ruta())).body).toMatchObject({ estado: 'sin_rostro' });
    expect((await pedir(vecino.token, 'post', `${ruta()}/retiro`)).status).toBe(404);
    expect(await vivas(yo.usuarioId)).toHaveLength(1);
  });

  it('5 capturas en 24 h contadas en la base: la sexta, 429 con Retry-After', async () => {
    if (omitida()) return;
    for (let i = 0; i < 2; i += 1)
      expect((await pedir(yo.token, 'post', ruta(), cuerpo())).status).toBe(201);
    const r = await pedir(yo.token, 'post', ruta(), cuerpo());
    expect(r.status).toBe(429);
    expect(String(r.body.mensaje)).toMatch(/5 veces en 24 horas/);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('retiro: revoca y suprime en el acto, también en los equipos; queda en la bitácora', async () => {
    if (omitida()) return;
    const [viva] = await vivas(yo.usuarioId);
    const r = await pedir(yo.token, 'post', `${ruta()}/retiro`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.estado).toBe('sin_rostro');
    expect(await vivas(yo.usuarioId)).toEqual([]);
    expect(terminales.map((t) => espia.retiradas.includes(`${t}/${String(viva?.id)}`))).toEqual([
      true,
      true,
    ]);
    expect(
      await banco.uno(
        `SELECT 1 AS si FROM public.bitacora_de_residentes WHERE usuario_id = $1 AND tipo = 'rostro_retirado'`,
        [yo.usuarioId],
      ),
    ).toEqual({ si: 1 });
  });

  it('dos PRIMERAS capturas a la vez: 201 y 409, un consentimiento y un rostro', async () => {
    if (omitida()) return;
    // Las dos se paran en la clave foránea de la persona y salen a la vez.
    const bloqueo = `SELECT 1 FROM public.personas
      WHERE id = (SELECT persona_id FROM public.usuarios WHERE id = $1) FOR UPDATE`;
    const estados = await aLaVez(vecino, bloqueo, [vecino.usuarioId]);
    expect(estados).toEqual([201, 409]);
    const vigentes = await banco.pool.query(
      `SELECT 1 FROM public.consentimientos_biometricos c JOIN public.usuarios u
          ON u.persona_id = c.persona_id WHERE u.id = $1 AND c.estado = 'vigente'`,
      [vecino.usuarioId],
    );
    expect(vigentes.rowCount).toBe(1);
  });

  it('la baja de la cuenta suprime su rostro y lo saca de los equipos en el acto', async () => {
    if (omitida()) return;
    const [viva] = await vivas(vecino.usuarioId);
    expect(viva).toBeDefined();
    const baja = await banco.comoSuper(
      'post',
      `/copropiedades/${cop.id}/residentes/cuentas/${vecino.usuarioId}/baja`,
      { motivo: 'Se mudó del conjunto' },
    );
    expect(baja.status, JSON.stringify(baja.body)).toBeLessThan(300);
    expect(await vivas(vecino.usuarioId)).toEqual([]);
    // 15-X · sin esperar al barrido de 6 h, como la baja de un menor.
    expect(terminales.map((t) => espia.retiradas.includes(`${t}/${String(viva?.id)}`))).toEqual([
      true,
      true,
    ]);
  });
});
