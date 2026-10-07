import { describe, expect, it } from 'vitest';
import { NUEVA, bancoDelHogar } from './banco-del-hogar-pg';
import type { Sesion } from './banco-del-hogar-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * RONDA 15-W · D4 · LOS MENORES DEL HOGAR, SIN CUENTA (D-W2, ADR-038)
 *
 * Un menor es `personas` + `residentes` SIN `usuarios`. Lo registra, edita y da
 * de baja CUALQUIER adulto con cuenta de su vivienda; nadie de otra vivienda lo
 * alcanza (404). La edad la decide el dominio con el día de Bogotá y la base
 * la repite: sin cuenta, sólo un menor ocupa plaza. Cuando cumple 18, el
 * titular le da un código de TRASPASO y la persona crea su cuenta conservando
 * su historial: la MISMA persona, la MISMA plaza.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const banco = bancoDelHogar('sin DATABASE_URL_PRUEBAS o sin las migraciones 0055 y 0056');
const omitida = (): boolean => !banco.disponible;

describe('15-W · D4 · los menores del hogar', () => {
  const s = banco.sufijo;
  let cop = { id: '', codigo: '' };
  let titular: Sesion = { usuarioId: '', token: '' };
  let adulto: Sesion = { usuarioId: '', token: '' };
  let vecino: Sesion = { usuarioId: '', token: '' };
  let plazas: { id: string; numero: number; libre: boolean; codigo: string | null }[] = [];
  let menorId = '';
  const ruta = () => `/copropiedades/${cop.id}/mi/menores`;
  const menor = (plazaId: string, extra: Record<string, unknown> = {}) => ({
    nombres: 'Sofía',
    apellidos: `Prueba ${s}`,
    fechaNacimiento: '2015-08-21',
    tipoDocumento: 'tarjeta_identidad',
    numeroDocumento: `1${s}9`,
    parentesco: 'Hija',
    plazaId,
    ...extra,
  });
  const ocupantes = () => `/copropiedades/${cop.id}/mi/ocupantes`;
  const libres = async (token: string) =>
    (await banco.con(token, 'get', ocupantes())).body.plazas.filter(
      (p: { libre: boolean }) => p.libre,
    ) as typeof plazas;

  it('prepara: el titular con 4 plazas, un adulto con su código y un vecino de otra vivienda', async () => {
    if (omitida()) return;
    cop = await banco.copropiedadPropia();
    const casa = await banco.vivienda(cop.id, '7');
    titular = await banco.titular(cop.id, casa, `tit.${s}`);
    await banco.completarAlta(cop.id, titular.token, banco.perfil(1));
    const declaradas = await banco.con(titular.token, 'post', ocupantes(), { numero: 4 });
    plazas = declaradas.body.plazas;
    adulto = await banco.adultoConCodigo(
      cop.id,
      String(plazas[1]?.codigo),
      `adu.${s}`,
      banco.perfil(2),
    );
    vecino = await banco.titular(cop.id, await banco.vivienda(cop.id, '8'), `vec.${s}`);
    await banco.completarAlta(cop.id, vecino.token, banco.perfil(3));
    expect(await libres(titular.token)).toHaveLength(2);
  });

  it('un adulto que NO es el titular registra, ve, edita y da de baja a un menor', async () => {
    if (omitida()) return;
    const [plaza] = await libres(adulto.token);
    const alta = await banco.con(adulto.token, 'post', ruta(), menor(String(plaza?.id)));
    expect(alta.status, JSON.stringify(alta.body)).toBe(201);
    menorId = alta.body.residenteId as string;
    const lista = await banco.con(titular.token, 'get', ruta());
    expect(lista.status).toBe(200);
    expect(lista.body).toEqual([
      expect.objectContaining({
        residenteId: menorId,
        nombreCompleto: `Sofía Prueba ${s}`,
        tipoDocumento: 'tarjeta_identidad',
        documento: `••••${`1${s}9`.slice(-4)}`,
        parentesco: 'Hija',
        plazaId: plaza?.id,
        tieneRostro: false,
      }),
    ]);
    // El número entero no sale hacia la app.
    expect(JSON.stringify(lista.body)).not.toContain(`1${s}9`);
    expect(typeof lista.body[0].edad).toBe('number');
    // La plaza la ocupa una persona SIN cuenta; la persona no tiene cuenta.
    const ocupada = await banco.uno(
      `SELECT p.usuario_id, (SELECT count(*)::int FROM public.usuarios u WHERE u.persona_id = p.persona_id) AS cuentas
         FROM public.plazas_de_ocupante p WHERE p.id = $1`,
      [plaza?.id],
    );
    expect(ocupada).toEqual({ usuario_id: null, cuentas: 0 });
    const editado = await banco.con(adulto.token, 'put', `${ruta()}/${menorId}`, {
      nombres: 'Sofía Andrea',
      apellidos: `Prueba ${s}`,
      fechaNacimiento: '2015-08-22',
      parentesco: 'Hija menor',
    });
    expect(editado.status, JSON.stringify(editado.body)).toBe(200);
    const rastro = await banco.uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE copropiedad_id = $1 AND tipo IN ('menor_registrado', 'menor_editado') AND actor_id = $2`,
      [cop.id, adulto.usuarioId],
    );
    expect(rastro?.n).toBe('2');
  });

  it('18 años o más → 400; un documento de adulto o un campo de más → 400; nada se crea', async () => {
    if (omitida()) return;
    const [plaza] = await libres(adulto.token);
    const mayor = await banco.con(
      adulto.token,
      'post',
      ruta(),
      menor(String(plaza?.id), {
        fechaNacimiento: '2000-01-01',
        numeroDocumento: `2${s}9`,
      }),
    );
    expect(mayor.status).toBe(400);
    expect(JSON.stringify(mayor.body)).toContain(
      'Una persona mayor de edad crea su propia cuenta con un código de plaza',
    );
    for (const intruso of [
      { tipoDocumento: 'cedula' },
      { viviendaId: cop.id },
      { personaId: cop.id },
      { es_titular: true },
    ]) {
      const r = await banco.con(
        adulto.token,
        'post',
        ruta(),
        menor(String(plaza?.id), {
          numeroDocumento: `3${s}9`,
          ...intruso,
        }),
      );
      expect(r.status, JSON.stringify(intruso)).toBe(400);
    }
    // Una fecha que lo vuelve mayor tampoco entra por la edición.
    const mayorPorEdicion = await banco.con(adulto.token, 'put', `${ruta()}/${menorId}`, {
      nombres: 'Sofía',
      apellidos: `Prueba ${s}`,
      fechaNacimiento: '2001-01-01',
      parentesco: 'Hija',
    });
    expect(mayorPorEdicion.status).toBe(400);
    expect((await banco.con(adulto.token, 'get', ruta())).body).toHaveLength(1);
  });

  it('plaza ocupada → 409; dos altas a la vez sobre la misma plaza → una sola', async () => {
    if (omitida()) return;
    const ocupada = await banco.con(
      adulto.token,
      'post',
      ruta(),
      menor(String(plazas[1]?.id), { numeroDocumento: `4${s}9` }),
    );
    expect(ocupada.status, JSON.stringify(ocupada.body)).toBe(409);
    const [plaza] = await libres(adulto.token);
    const intentos = await Promise.all(
      [5, 6].map((n) =>
        banco.con(
          n === 5 ? adulto.token : titular.token,
          'post',
          ruta(),
          menor(String(plaza?.id), {
            nombres: `Gemelo${String(n)}`,
            numeroDocumento: `${String(n)}${s}9`,
          }),
        ),
      ),
    );
    expect(
      intentos.map((r) => r.status).sort(),
      JSON.stringify(intentos.map((r) => r.body)),
    ).toEqual([201, 409]);
    expect((await banco.con(titular.token, 'get', ruta())).body).toHaveLength(2);
  });

  it('un adulto de OTRA vivienda no ve ni toca a los menores de ésta: 404', async () => {
    if (omitida()) return;
    expect((await banco.con(vecino.token, 'get', ruta())).body).toEqual([]);
    const cambios = {
      nombres: 'X',
      apellidos: 'Y',
      fechaNacimiento: '2015-01-01',
      parentesco: 'Z',
    };
    expect((await banco.con(vecino.token, 'put', `${ruta()}/${menorId}`, cambios)).status).toBe(
      404,
    );
    expect(
      (await banco.con(vecino.token, 'post', `${ruta()}/${menorId}/baja`, { motivo: 'No es mío' }))
        .status,
    ).toBe(404);
    expect(
      (await banco.con(vecino.token, 'post', `${ruta()}/${menorId}/codigo-de-traspaso`)).status,
    ).toBe(404);
    // Una plaza de otra vivienda tampoco existe para él.
    const ajena = await banco.con(
      vecino.token,
      'post',
      ruta(),
      menor(String(plazas[3]?.id), { numeroDocumento: `7${s}9` }),
    );
    expect(ajena.status).toBe(404);
  });

  it('el código de traspaso: sólo el titular y sólo con 18 cumplidos; la persona conserva su historial', async () => {
    if (omitida()) return;
    const traspaso = `${ruta()}/${menorId}/codigo-de-traspaso`;
    expect((await banco.con(titular.token, 'post', traspaso)).status).toBe(409);
    // Pasan los años: lo monta el superusuario, no lo que se prueba.
    await banco.pool.query(
      `UPDATE public.personas SET fecha_nacimiento = '2000-05-17'
        WHERE id = (SELECT persona_id FROM public.residentes WHERE id = $1)`,
      [menorId],
    );
    expect((await banco.con(adulto.token, 'post', traspaso)).status).toBe(403);
    const r = await banco.con(titular.token, 'post', traspaso);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const codigo = String(r.body.codigo);
    expect(codigo.startsWith(`${cop.codigo}-`)).toBe(true);
    // El código solo no basta: la fecha tiene que ser la que el hogar registró.
    const otraFecha = await banco.registrar(
      banco.cuerpoDeRegistro(`sofi.${s}`, codigo, '2000-05-18'),
    );
    expect(otraFecha.status).toBe(400);
    const cuenta = await banco.registrar(banco.cuerpoDeRegistro(`sofi.${s}`, codigo, '2000-05-17'));
    expect(cuenta.status, JSON.stringify(cuenta.body)).toBe(201);
    const usuarioId = await banco.usuarioId(cop.id, `sofi.${s}`);
    const misma = await banco.uno(
      `SELECT (u.persona_id = r.persona_id) AS misma_persona, p.usuario_id::text AS cuenta,
              p.persona_id AS persona_en_plaza, r.estado::text AS estado
         FROM public.usuarios u, public.residentes r, public.plazas_de_ocupante p
        WHERE u.id = $1 AND r.id = $2 AND p.usuario_id = u.id AND p.estado = 'activo'`,
      [usuarioId, menorId],
    );
    expect(misma).toEqual({
      misma_persona: true,
      cuenta: usuarioId,
      persona_en_plaza: null,
      estado: 'activo',
    });
    // Ya tiene cuenta: deja de ser «menor del hogar», y el código no sirve dos veces.
    expect(
      (await banco.con(titular.token, 'get', ruta())).body.map(
        (m: { residenteId: string }) => m.residenteId,
      ),
    ).not.toContain(menorId);
    const otraVez = await banco.registrar(
      banco.cuerpoDeRegistro(`sofi2.${s}`, codigo, '2000-05-17'),
    );
    expect(otraVez.status).toBe(400);
    const token = await banco.sesion(usuarioId ?? '', NUEVA);
    expect((await banco.con(token, 'get', `/copropiedades/${cop.id}/mi/alta`)).body).toMatchObject({
      viviendaVinculada: true,
    });
  });

  it('la baja libera la plaza con OTRO código y deja la persona en el padrón, inactiva', async () => {
    if (omitida()) return;
    const [gemelo] = (await banco.con(titular.token, 'get', ruta())).body as {
      residenteId: string;
      plazaId: string;
    }[];
    const antes = await banco.uno<{ generacion: number }>(
      'SELECT generacion FROM public.plazas_de_ocupante WHERE id = $1',
      [gemelo?.plazaId],
    );
    expect(
      (await banco.con(titular.token, 'post', `${ruta()}/${String(gemelo?.residenteId)}/baja`, {}))
        .status,
    ).toBe(400);
    const baja = await banco.con(
      titular.token,
      'post',
      `${ruta()}/${String(gemelo?.residenteId)}/baja`,
      {
        motivo: 'Se mudó con su madre',
      },
    );
    expect(baja.status, JSON.stringify(baja.body)).toBe(200);
    expect(
      await banco.uno(
        `SELECT p.persona_id, p.generacion = $2 + 1 AS regenerada,
                (SELECT r.estado::text FROM public.residentes r WHERE r.id = $3) AS residente
           FROM public.plazas_de_ocupante p WHERE p.id = $1`,
        [gemelo?.plazaId, antes?.generacion, gemelo?.residenteId],
      ),
    ).toEqual({ persona_id: null, regenerada: true, residente: 'inactivo' });
    expect((await banco.con(titular.token, 'get', ruta())).body).toEqual([]);
    expect((await libres(titular.token)).map((p) => p.id)).toContain(gemelo?.plazaId);
  });
});
