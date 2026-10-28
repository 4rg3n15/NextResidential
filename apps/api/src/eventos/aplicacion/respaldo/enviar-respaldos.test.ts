import { describe, expect, it } from 'vitest';
import {
  CorreoSinConfigurar,
  DestinatariosSinBase,
} from '../../infraestructura/respaldo-en-memoria';
import { diasAnteriores } from './dias';
import {
  ACTOR,
  COP1,
  HORA_DEL_TRABAJO,
  SUPER1,
  SUPER2,
  acceso,
  correoDePrueba,
  montar,
} from './dobles-del-respaldo';
import { EnviarRespaldos, LIMITE_DEL_ADJUNTO_BYTES, asuntoDelRespaldo } from './enviar-respaldos';
import { sha256 } from './generar-respaldo';
import type { RespaldoGuardado } from './puertos';

/**
 * D-147 · el envío por correo: correcto, fallido que se reintenta, sin SMTP,
 * adjunto grande como enlace, y sólo a quien devuelve el puerto de
 * destinatarios (los superadministradores activos).
 */
const AYER = diasAnteriores(HORA_DEL_TRABAJO, 1)[0];
if (AYER === undefined) throw new Error('sin día');

const conRespaldo = async (m: ReturnType<typeof montar>): Promise<RespaldoGuardado> =>
  (await m.generar.ejecutar(COP1, AYER, ACTOR)).respaldo;

describe('EnviarRespaldos', () => {
  it('envía un correo a todos los superadministradores con asunto, cuerpo y el Excel adjunto', async () => {
    const correo = correoDePrueba();
    const m = montar({
      correo,
      destinatarios: [SUPER1, SUPER2],
      eventos: [
        acceso(new Date(Date.UTC(2026, 9, 27, 15))),
        acceso(new Date(Date.UTC(2026, 9, 27, 16)), { resultado: 'negado', motivo: 'LISTA_NEGRA' }),
      ],
    });
    const respaldo = await conRespaldo(m);
    const parte = await m.enviar.ejecutar(COP1, [respaldo], ACTOR);

    expect(parte).toEqual({ enviados: 2, fallidos: 0, sinConfigurar: 0 });
    expect(correo.enviados).toHaveLength(1);
    const enviado = correo.enviados[0];
    expect(enviado?.destinatarios).toEqual([SUPER1.correo, SUPER2.correo]);
    expect(enviado?.asunto).toBe(`Eventos del 2026-10-27 · ${COP1}`);
    expect(enviado?.cuerpo).toContain('Eventos: 2');
    expect(enviado?.cuerpo).toContain('Permitidos: 1');
    expect(enviado?.cuerpo).toContain('Negados: 1');
    expect(enviado?.cuerpo).toContain(respaldo.sha256);
    expect(enviado?.adjuntos[0]?.nombre).toBe('eventos-2026-10-27.xls');
    expect(enviado?.adjuntos[0]?.contenido).toEqual(m.almacen.objetos.get(respaldo.ruta));
    const intentos = await m.envios.intentos(COP1, [respaldo.id]);
    expect(intentos.map((i) => i.resultado)).toEqual(['enviado', 'enviado']);
    expect(intentos.every((i) => i.enviadoEn?.getTime() === HORA_DEL_TRABAJO.getTime())).toBe(true);
  });

  it('un envío hecho no se repite en la siguiente ejecución', async () => {
    const correo = correoDePrueba();
    const m = montar({ correo });
    const respaldo = await conRespaldo(m);
    await m.enviar.ejecutar(COP1, [respaldo], ACTOR);
    const segunda = await m.enviar.ejecutar(COP1, [respaldo], ACTOR);
    expect(segunda).toEqual({ enviados: 0, fallidos: 0, sinConfigurar: 0 });
    expect(correo.enviados).toHaveLength(1);
  });

  it('un envío fallido queda anotado sin la dirección y se reintenta en la siguiente', async () => {
    const correo = correoDePrueba([
      { estado: 'error', detalle: 'buzón uno@ejemplo.test lleno\u0000' },
    ]);
    const m = montar({ correo });
    const respaldo = await conRespaldo(m);

    expect(await m.enviar.ejecutar(COP1, [respaldo], ACTOR)).toEqual({
      enviados: 0,
      fallidos: 1,
      sinConfigurar: 0,
    });
    const [fallido] = await m.envios.intentos(COP1, [respaldo.id]);
    expect(fallido?.resultado).toBe('error');
    expect(fallido?.error).toBe('buzón [dirección] lleno');

    m.reloj.avanzar(86_400_000);
    expect((await m.enviar.ejecutar(COP1, [respaldo], ACTOR)).enviados).toBe(1);
    expect(correo.enviados).toHaveLength(2);
    // Los dos intentos quedan: nada se reescribe (C-68).
    expect((await m.envios.intentos(COP1, [respaldo.id])).map((i) => i.resultado)).toEqual([
      'enviado',
      'error',
    ]);
  });

  it('una excepción del SMTP no tumba la ejecución: es un intento fallido', async () => {
    const m = montar({
      correo: {
        configurado: true,
        enviar: async () => {
          throw new Error('ETIMEDOUT');
        },
      },
    });
    const respaldo = await conRespaldo(m);
    expect((await m.enviar.ejecutar(COP1, [respaldo], ACTOR)).fallidos).toBe(1);
  });

  it('sin SMTP configurado: se anota «sin configurar» una sola vez y no se intenta enviar', async () => {
    const m = montar({ correo: new CorreoSinConfigurar(), destinatarios: [SUPER1, SUPER2] });
    const respaldo = await conRespaldo(m);
    expect((await m.enviar.ejecutar(COP1, [respaldo], ACTOR)).sinConfigurar).toBe(2);
    expect((await m.enviar.ejecutar(COP1, [respaldo], ACTOR)).sinConfigurar).toBe(0);
    const intentos = await m.envios.intentos(COP1, [respaldo.id]);
    expect(intentos.map((i) => i.resultado)).toEqual(['sin_configurar', 'sin_configurar']);
    // El respaldo está guardado igual.
    expect(m.almacen.objetos.has(respaldo.ruta)).toBe(true);
  });

  it('cuando se configura el SMTP, lo que quedó «sin configurar» se envía', async () => {
    const m = montar({ correo: new CorreoSinConfigurar() });
    const respaldo = await conRespaldo(m);
    await m.enviar.ejecutar(COP1, [respaldo], ACTOR);
    // Mismo repositorio y almacén, otro correo: el despliegue tras configurar SMTP.
    const correo = correoDePrueba();
    const configurado = new EnviarRespaldos(
      m.envios,
      m.almacen,
      new DestinatariosSinBase([SUPER1]),
      correo,
      m.reloj,
    );
    expect((await configurado.ejecutar(COP1, [respaldo], ACTOR)).enviados).toBe(1);
  });

  it('un adjunto de más de 10 MB viaja como enlace firmado, no como fichero', async () => {
    const correo = correoDePrueba();
    const m = montar({ correo });
    const respaldo = await conRespaldo(m);
    const grande = new Uint8Array(LIMITE_DEL_ADJUNTO_BYTES + 1);
    m.almacen.objetos.set(respaldo.ruta, grande);
    const conHuella = { ...respaldo, sha256: sha256(grande), tamanoBytes: grande.byteLength };

    await m.enviar.ejecutar(COP1, [conHuella], ACTOR);
    expect(correo.enviados[0]?.adjuntos).toEqual([]);
    expect(correo.enviados[0]?.cuerpo).toContain(
      `memoria://respaldo-de-eventos/${respaldo.ruta}?vida=86400`,
    );
    expect((await m.envios.intentos(COP1, [respaldo.id]))[0]?.conEnlace).toBe(true);
  });

  it('si el fichero del bucket no es el de la constancia, no sale', async () => {
    const correo = correoDePrueba();
    const m = montar({ correo });
    const respaldo = await conRespaldo(m);
    m.almacen.objetos.set(respaldo.ruta, new TextEncoder().encode('alterado'));
    expect((await m.enviar.ejecutar(COP1, [respaldo], ACTOR)).fallidos).toBe(1);
    expect(correo.enviados).toHaveLength(0);
    expect((await m.envios.intentos(COP1, [respaldo.id]))[0]?.error).toMatch(/huella/);
  });

  it('sólo reciben los que da el puerto de destinatarios; sin ninguno, no se envía nada', async () => {
    const correo = correoDePrueba();
    const m = montar({ correo, destinatarios: [] });
    const respaldo = await conRespaldo(m);
    expect(await m.enviar.ejecutar(COP1, [respaldo], ACTOR)).toEqual({
      enviados: 0,
      fallidos: 0,
      sinConfigurar: 0,
    });
    expect(correo.enviados).toHaveLength(0);
  });

  it('un superadministrador nuevo recibe lo que le falta; los demás no lo reciben dos veces', async () => {
    const correo = correoDePrueba();
    const m = montar({ correo, destinatarios: [SUPER1] });
    const respaldo = await conRespaldo(m);
    await m.enviar.ejecutar(COP1, [respaldo], ACTOR);
    const conDos = new EnviarRespaldos(
      m.envios,
      m.almacen,
      new DestinatariosSinBase([SUPER1, SUPER2]),
      correo,
      m.reloj,
    );
    await conDos.ejecutar(COP1, [respaldo], ACTOR);
    expect(correo.enviados.map((c) => c.destinatarios)).toEqual([[SUPER1.correo], [SUPER2.correo]]);
  });

  it('el asunto lleva la fecha y el nombre de la copropiedad', () => {
    expect(asuntoDelRespaldo({ fecha: '2026-10-27' } as RespaldoGuardado, 'Villa Verde')).toBe(
      'Eventos del 2026-10-27 · Villa Verde',
    );
  });
});
