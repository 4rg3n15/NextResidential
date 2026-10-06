import { describe, expect, it } from 'vitest';
import { TIEMPO_MINIMO_DE_REGISTRO_FALLIDO_MS } from '../src/cuentas/aplicacion/registrar-residente';
import { DOMINIO_SINTETICO } from '../src/cuentas/dominio/correo-sintetico';
import { COP_B } from './utilidades';
import { NUEVA, POLITICA, bancoDelHogar } from './banco-del-hogar-pg';
import type { Sesion } from './banco-del-hogar-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * RONDA 15-W · D2 · «CREAR CUENTA» CON EL CÓDIGO DE UNA PLAZA (D-W1, D-W8, ADR-037)
 *
 * La única ruta pública nueva. Lo que se demuestra, contra la base real:
 *
 *  · un código de plaza válido crea la cuenta YA atada a ESA plaza, nunca como
 *    titular, sin cambio obligatorio y sin emitir tokens;
 *  · incorrecto, usado, de otro conjunto o de un conjunto que no existe: la
 *    MISMA respuesta y al menos el MISMO tiempo mínimo — no se enumera nada;
 *  · forma (campos, confirmación, política) → 400 por campo y con la política;
 *    un menor → 400 y NADA creado, ni en el proveedor ni en la base;
 *  · nadie elige su rol, su vivienda ni su plaza: 400;
 *  · el mismo código dos veces a la vez → una cuenta, y la identidad sobrante
 *    se elimina del proveedor;
 *  · la suspensión por intentos y el límite por IP: `autorregistro-limites.e2e`.
 *
 * Copropiedad propia: los fallos cuentan para la suspensión de la copropiedad.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const banco = bancoDelHogar('sin DATABASE_URL_PRUEBAS o sin las migraciones 0055 y 0056');
const omitida = (): boolean => !banco.disponible;
const MENSAJE = 'El código de invitación no es válido o ya se usó';
const sinCorrelacion = (b: { correlacion?: string }) => ({ ...b, correlacion: undefined });

describe('15-W · D2 · «Crear cuenta» con código de plaza', () => {
  const s = banco.sufijo;
  let cop = { id: '', codigo: '' };
  let titular: Sesion = { usuarioId: '', token: '' };
  let viviendaId = '';
  let codigos: string[] = [];
  const cuerpo = (usuario: string, codigo: string, extra: Record<string, unknown> = {}) => ({
    ...banco.cuerpoDeRegistro(usuario, codigo),
    ...extra,
  });

  it('prepara una copropiedad con su titular y tres plazas libres, con el prefijo del conjunto', async () => {
    if (omitida()) return;
    cop = await banco.copropiedadPropia();
    viviendaId = await banco.vivienda(cop.id, '101');
    titular = await banco.titular(cop.id, viviendaId, `titular.${s}`);
    await banco.completarAlta(cop.id, titular.token, banco.perfil(1));
    const r = await banco.con(titular.token, 'post', `/copropiedades/${cop.id}/mi/ocupantes`, {
      numero: 4,
    });
    codigos = r.body.plazas
      .filter((p: { libre: boolean }) => p.libre)
      .map((p: { codigo: string }) => p.codigo);
    expect(codigos).toHaveLength(3);
    expect(
      codigos.every((c) => c.startsWith(`${cop.codigo}-`)),
      codigos.join(' '),
    ).toBe(true);
  });

  it('el formulario vacío da 400 con la política vigente: así la lee la app', async () => {
    if (omitida()) return;
    const r = await banco.registrar({});
    expect(r.status).toBe(400);
    expect(r.body.mensaje.politica).toEqual({ version: POLITICA, texto: expect.any(String) });
    expect(String(r.body.mensaje.politica.texto)).toContain('Ley 1581 de 2012');
  });

  it('forma: campo vacío, contraseñas distintas, contraseña débil o política vieja → 400 por campo', async () => {
    if (omitida()) return;
    const vacio = await banco.registrar(cuerpo('', String(codigos[0])));
    expect(vacio.status).toBe(400);
    expect(JSON.stringify(vacio.body.mensaje.message)).toContain('usuario');
    const casos: [Record<string, unknown>, string][] = [
      [{ confirmacion: 'Otra#2026xy' }, 'confirmacion'],
      [{ contrasena: 'corta', confirmacion: 'corta' }, 'contrasena'],
      [{ versionPolitica: '2020-01-vieja' }, 'versionPolitica'],
      [{ fechaNacimiento: '1990-02-30' }, 'fechaNacimiento'],
    ];
    for (const [extra, campo] of casos) {
      const r = await banco.registrar(cuerpo(`forma.${s}`, String(codigos[0]), extra));
      expect(r.status, JSON.stringify(r.body)).toBe(400);
      expect(r.body.mensaje.campos.map((c: { campo: string }) => c.campo)).toContain(campo);
      expect(r.body.mensaje.politica.version).toBe(POLITICA);
    }
    const sinAceptar = await banco.registrar(
      cuerpo(`forma.${s}`, String(codigos[0]), { aceptaTratamientoDeDatos: false }),
    );
    expect(sinAceptar.status).toBe(400);
    expect(await banco.usuarioId(cop.id, `forma.${s}`)).toBeUndefined();
  });

  it('nadie elige su rol, su copropiedad, su vivienda ni su plaza: 400', async () => {
    if (omitida()) return;
    for (const intruso of [
      { rol: 'administrador' },
      { copropiedadId: cop.id },
      { viviendaId },
      { plazaId: viviendaId },
      { esTitular: true },
    ]) {
      const r = await banco.registrar(cuerpo(`intruso.${s}`, String(codigos[0]), intruso));
      expect(r.status, JSON.stringify(intruso)).toBe(400);
    }
    expect(await banco.usuarioId(cop.id, `intruso.${s}`)).toBeUndefined();
  });

  it('un menor de edad → 400 y NADA creado: ni en el proveedor ni en la base, ni el código gastado', async () => {
    if (omitida()) return;
    const recibidos = banco.proveedor.correosRecibidos.length;
    const r = await banco.registrar(
      cuerpo(`menor.${s}`, String(codigos[0]), { fechaNacimiento: '2012-06-01' }),
    );
    expect(r.status).toBe(400);
    expect(r.body.mensaje.message).toBe(
      'Las cuentas son para mayores de edad. Un adulto de su hogar lo registra desde Mi familia',
    );
    expect(banco.proveedor.correosRecibidos.length, 'el menor llegó al proveedor').toBe(recibidos);
    expect(await banco.usuarioId(cop.id, `menor.${s}`)).toBeUndefined();
  });

  it('código válido → la cuenta nace en ESA plaza, nunca de titular, y la ruta no da tokens', async () => {
    if (omitida()) return;
    const r = await banco.registrar(cuerpo(`ana.${s}`, String(codigos[0])));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toEqual({ creada: true });
    expect(JSON.stringify(r.headers)).not.toMatch(/token|set-cookie/i);
    const usuarioId = await banco.usuarioId(cop.id, `ana.${s}`);
    expect(
      await banco.uno(
        `SELECT u.origen_de_alta AS origen, u.debe_cambiar_contrasena AS cambia, p.numero,
                (SELECT o.primer_residente_id::text FROM public.ocupacion_de_viviendas o
                  WHERE o.vivienda_id = p.vivienda_id) AS titular
           FROM public.usuarios u JOIN public.plazas_de_ocupante p ON p.usuario_id = u.id
          WHERE u.id = $1 AND p.estado = 'activo'`,
        [usuarioId],
      ),
    ).toEqual({ origen: 'autorregistro', cambia: false, numero: 2, titular: titular.usuarioId });
    const rastro = await banco.uno<{ detalle: string }>(
      `SELECT detalle FROM public.bitacora_de_residentes WHERE usuario_id = $1 AND tipo = 'autorregistro'`,
      [usuarioId],
    );
    expect(rastro?.detalle).toBe(`plaza 2 · política ${POLITICA}`);
    // Entra con la contraseña que eligió, y su primer ingreso la completa.
    const token = await banco.sesion(usuarioId ?? '', NUEVA);
    await banco.completarAlta(cop.id, token, banco.perfil(2));
  });

  it('incorrecto, usado, de otro conjunto o de uno inexistente: la MISMA respuesta y el tiempo mínimo', async () => {
    if (omitida()) return;
    const parte = String(codigos[1]).slice(cop.codigo.length + 1);
    const intentos = [
      `${cop.codigo}-AAAA-AAAA`, // incorrecto
      String(codigos[0]), // usado
      `ROBLE-${parte}`, // de otro conjunto (El Roble, COP_B)
      `NOEXISTE-${parte}`, // conjunto inexistente
    ];
    const cuerpos: unknown[] = [];
    for (const [i, codigo] of intentos.entries()) {
      const inicio = Date.now();
      const r = await banco.registrar(cuerpo(`igual${String(i)}.${s}`, codigo));
      const ms = Date.now() - inicio;
      expect(r.status, `${codigo}: ${JSON.stringify(r.body)}`).toBe(400);
      expect(r.body.mensaje.message).toBe(MENSAJE);
      expect(ms, `${codigo} contestó en ${String(ms)} ms`).toBeGreaterThanOrEqual(
        TIEMPO_MINIMO_DE_REGISTRO_FALLIDO_MS - 10,
      );
      cuerpos.push(sinCorrelacion(r.body));
    }
    for (const c of cuerpos) expect(c).toEqual(cuerpos[0]);
    // El fallo en El Roble cuenta para SU registro, con un HMAC de la IP: nunca la IP.
    const huellas = await banco.pool.query<{ detalle: string }>(
      `SELECT detalle FROM public.bitacora_de_residentes
        WHERE copropiedad_id = ANY($1::uuid[]) AND tipo = 'registro_codigo_incorrecto'`,
      [[cop.id, COP_B]],
    );
    expect(huellas.rows.length).toBeGreaterThanOrEqual(2);
    for (const h of huellas.rows) expect(h.detalle).toMatch(/^ip:[0-9a-f]{16}$/);
  }, 20_000);

  it('usuario ocupado → 409, y el código sigue sirviendo para otra persona', async () => {
    if (omitida()) return;
    const ocupado = await banco.registrar(cuerpo(`titular.${s}`, String(codigos[1])));
    expect(ocupado.status, JSON.stringify(ocupado.body)).toBe(409);
    expect(ocupado.body.mensaje.message).toBe('Ese usuario no está disponible');
    const libre = await banco.registrar(cuerpo(`beto.${s}`, String(codigos[1]).toLowerCase()));
    expect(libre.status, JSON.stringify(libre.body)).toBe(201);
  });

  it('el mismo código cuatro veces a la vez → UNA cuenta, y ninguna identidad sobrante queda viva', async () => {
    if (omitida()) return;
    // Quien pierde lo hace en uno de dos sitios, según llegue: al resolver el
    // código (la plaza ya no está libre: 400, el genérico) o en la transacción,
    // con su identidad YA creada en el proveedor (409, y la compensación la
    // borra). El orden no se controla; el invariante, sí: una cuenta, y ninguna
    // identidad de un perdedor sobrevive. La compensación sola, sin depender
    // del azar, la prueba `crear-cuenta-con-vinculo.test.ts`.
    const usuarios = [1, 2, 3, 4].map((i) => `par${String(i)}.${s}`);
    const intentos = await Promise.all(
      usuarios.map((u) => banco.registrar(cuerpo(u, String(codigos[2])))),
    );
    const estados = intentos.map((r) => r.status);
    expect(
      estados.filter((e) => e === 201),
      JSON.stringify(intentos.map((r) => r.body)),
    ).toHaveLength(1);
    expect(
      estados.every((e) => e === 201 || e === 400 || e === 409),
      estados.join(','),
    ).toBe(true);
    for (const [i, usuario] of usuarios.entries()) {
      if (intentos[i]?.status === 201) continue;
      expect(intentos[i]?.body.mensaje.message).toBe(MENSAJE);
      expect(await banco.usuarioId(cop.id, usuario), usuario).toBeUndefined();
      const correo = `${usuario}@${cop.id}.${DOMINIO_SINTETICO}`;
      expect(
        await banco.proveedor.iniciarSesion(correo, NUEVA),
        `identidad huérfana de ${usuario}`,
      ).toBeNull();
    }
  }, 20_000);
});
