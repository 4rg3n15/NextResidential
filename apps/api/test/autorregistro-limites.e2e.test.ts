import { describe, expect, it } from 'vitest';
import { bancoDelHogar, ipDePrueba } from './banco-del-hogar-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * RONDA 15-W · D2 · LOS LÍMITES DE «CREAR CUENTA» (§7 del encargo, ADR-037)
 *
 * La ruta es pública, así que su defensa son sus límites:
 *
 *  · 30 códigos fallidos en una hora suspenden el registro de ESA copropiedad
 *    —hasta un código bueno contesta entonces como uno malo, y ya no cuenta—,
 *    con la alerta al superadministrador (S-15W-09), que lo reanuda con motivo;
 *  · el límite por IP: la undécima petición en diez minutos da 429.
 *
 * Copropiedad propia: la suspensión es estado de la copropiedad (banco).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const banco = bancoDelHogar('sin DATABASE_URL_PRUEBAS o sin las migraciones 0055 y 0056');
const omitida = (): boolean => !banco.disponible;
const MENSAJE = 'El código de invitación no es válido o ya se usó';
/** El alfabeto de los códigos (sin I, O, 0 ni 1): un código malo BIEN FORMADO sí se evalúa. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const malo = (prefijo: string, i: number): string =>
  `${prefijo}-BBBB-${ALFABETO[i % 32] ?? 'A'}${ALFABETO[Math.floor(i / 32) % 32] ?? 'A'}CC`;

describe('15-W · D2 · suspensión por intentos y límite por IP', () => {
  const s = banco.sufijo;
  let cop = { id: '', codigo: '' };
  let bueno = '';
  const cuerpo = (usuario: string, codigo: string) => banco.cuerpoDeRegistro(usuario, codigo);

  it('prepara una copropiedad con su titular y un código de plaza BUENO', async () => {
    if (omitida()) return;
    cop = await banco.copropiedadPropia();
    const titular = await banco.titular(cop.id, await banco.vivienda(cop.id, '201'), `tit.${s}`);
    await banco.completarAlta(cop.id, titular.token, banco.perfil(1));
    const ocupantes = `/copropiedades/${cop.id}/mi/ocupantes`;
    const r = await banco.con(titular.token, 'post', ocupantes, { numero: 2 });
    bueno = r.body.plazas.find((p: { libre: boolean }) => p.libre)?.codigo as string;
    expect(bueno.startsWith(`${cop.codigo}-`), JSON.stringify(r.body)).toBe(true);
  });

  it('30 fallos en una hora suspenden el registro de ESA copropiedad; el superadministrador lo reanuda', async () => {
    if (omitida()) return;
    const registro = `/copropiedades/${cop.id}/residentes/registro`;
    expect((await banco.comoSuper('get', registro)).body.suspendido).toBe(false);
    const fallos = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        banco.registrar(cuerpo(`fallo${String(i)}.${s}`, malo(cop.codigo, i))),
      ),
    );
    expect(
      fallos
        .filter((r) => r.status !== 400)
        .map((r) => `${String(r.status)} ${JSON.stringify(r.body)}`),
    ).toEqual([]);
    const estado = await banco.comoSuper('get', registro);
    expect(estado.body, JSON.stringify(estado.body)).toMatchObject({ suspendido: true });
    expect(estado.body.hasta).not.toBeNull();
    // S-15W-09 · la alerta: la auditoría de seguridad, sin IP.
    const alerta = await banco.uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.auditoria_seguridad
        WHERE tipo = 'rate_limit' AND recurso = 'auth/registro' AND copropiedad_id_objetivo = $1`,
      [cop.id],
    );
    expect(alerta?.n).toBe('1');
    // Suspendido, un código BUENO contesta como uno malo, y no cuenta.
    const antes = await banco.uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE copropiedad_id = $1 AND tipo = 'registro_codigo_incorrecto'`,
      [cop.id],
    );
    const negado = await banco.registrar(cuerpo(`suspendido.${s}`, bueno));
    expect(negado.status).toBe(400);
    expect(negado.body.mensaje.message).toBe(MENSAJE);
    expect(await banco.usuarioId(cop.id, `suspendido.${s}`)).toBeUndefined();
    expect(
      (
        await banco.uno<{ n: string }>(
          `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
            WHERE copropiedad_id = $1 AND tipo = 'registro_codigo_incorrecto'`,
          [cop.id],
        )
      )?.n,
    ).toBe(antes?.n);
    // Reanudar exige motivo, queda auditado, y el código bueno vuelve a servir.
    expect((await banco.comoSuper('post', `${registro}/reanudacion`, {})).status).toBe(400);
    const reanudado = await banco.comoSuper('post', `${registro}/reanudacion`, {
      motivo: 'Intentos revisados con la portería',
    });
    expect(reanudado.status, JSON.stringify(reanudado.body)).toBe(200);
    expect(reanudado.body).toEqual({ reanudado: true });
    expect((await banco.comoSuper('get', registro)).body.suspendido).toBe(false);
    expect(
      (await banco.comoSuper('post', `${registro}/reanudacion`, { motivo: 'Otra vez' })).status,
    ).toBe(409);
    const ahora = await banco.registrar(cuerpo(`reanudado.${s}`, bueno));
    expect(ahora.status, JSON.stringify(ahora.body)).toBe(201);
  }, 30_000);

  it('el límite por IP: la undécima en diez minutos da 429 con Retry-After', async () => {
    if (omitida()) return;
    const ip = ipDePrueba();
    // Prefijos distintos e inexistentes: sin conjunto no hay fallos que contar,
    // y el limitador por (IP, prefijo) no salta antes que el de la IP.
    const respuestas = await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        banco.registrar(cuerpo(`limite${String(i)}.${s}`, `NOHAY${String(i)}-ABCD-EFGH`), ip),
      ),
    );
    const limitadas = respuestas.filter((r) => r.status === 429);
    expect(limitadas, respuestas.map((r) => r.status).join(',')).toHaveLength(1);
    expect(Number(limitadas[0]?.headers['retry-after'])).toBeGreaterThan(0);
  }, 20_000);
});
