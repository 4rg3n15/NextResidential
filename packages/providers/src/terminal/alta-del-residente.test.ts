import { describe, expect, it, vi } from 'vitest';
import { personaEnElEquipo } from './persona-en-el-equipo';
import { TerminalFacial } from './terminal-facial';
import { jpegConMedidas } from '../simulacion/imagenes-de-prueba';

/**
 * Prueba directa contra los dos equipos (20/10):
 *  · `Valid {enable:false}` SIN fechas → rechazada en los dos y la persona no se
 *    crea: terminal DS-K1T344 «required node does not exist.beginTime»,
 *    videoportero DS-KD9633 «required element(beginTime)», los dos
 *    `MessageParametersLack`.
 *  · Con `beginTime`, `endTime` y `timeType` → OK y la persona existe.
 *  · Alta repetida → `subStatusCode` `employeeNoAlreadyExist` en los dos.
 * Y en el sistema real el texto «does not exist» se leía como «ya existe»: se
 * intentaba MODIFICAR una persona inexistente y la terminal acababa en
 * `employeeNoNotExist` al subir el rostro, escondiendo el rechazo original.
 */
const json = (cuerpo: object): string => JSON.stringify(cuerpo);
const OK = json({ statusCode: 1, statusString: 'OK', subStatusCode: 'ok' });
const FALTA_EN_TERMINAL = json({
  statusCode: 6,
  statusString: 'Invalid Content',
  subStatusCode: 'MessageParametersLack',
  errorCode: 1610612738,
  errorMsg: 'required node does not exist.beginTime',
});
const FALTA_EN_VIDEOPORTERO = json({
  statusCode: 6,
  statusString: 'Invalid Content',
  subStatusCode: 'MessageParametersLack',
  errorCode: 1610612738,
  errorMsg: 'required element(beginTime)',
});
const YA_EXISTE = json({
  statusCode: 6,
  statusString: 'Invalid Content',
  subStatusCode: 'employeeNoAlreadyExist',
  errorCode: 1610637344,
  errorMsg: 'employeeNoAlreadyExist',
});

const respuesta = (estado: number, cuerpo: string): Response =>
  new Response(cuerpo, { status: estado, headers: { 'content-type': 'application/json' } });

/** Una terminal que contesta el alta con `alAlta` y todo lo demás con OK; guarda cada llamada. */
const montar = (alAlta: string, estadoDelAlta = 400) => {
  const llamadas: { metodo: string; url: string; cuerpo: string }[] = [];
  const peticion = vi.fn(async (url: string, opciones: RequestInit) => {
    const metodo = opciones.method ?? 'GET';
    llamadas.push({ metodo, url, cuerpo: typeof opciones.body === 'string' ? opciones.body : '' });
    if (url.includes('/UserInfo/Record')) return respuesta(estadoDelAlta, alAlta);
    return respuesta(200, OK);
  });
  const terminal = new TerminalFacial({
    host: 'terminal.invalid',
    usuario: 'servicio',
    clave: 'secreta',
    modo: 'reporta_y_espera',
    numeroDePuerta: null,
    // Con la compuerta de reloj armada: si se activara sin vigencia, se vería la llamada.
    desvioDeRelojMaximoS: 120,
    peticion: peticion as unknown as typeof fetch,
    ahora: (() => {
      let t = 1000;
      return () => (t += 40);
    })(),
    generarCnonce: () => 'cnonce-fijo',
  });
  return { terminal, llamadas };
};

const modificaciones = (llamadas: readonly { url: string }[]): number =>
  llamadas.filter((l) => l.url.includes('/UserInfo/Modify')).length;

describe('el alta del residente (sin vigencia) en los dos equipos', () => {
  it('sin vigencia: permanente (enable false) pero CON beginTime, endTime y timeType, y userType normal', () => {
    const p = personaEnElEquipo('p7', undefined, null);
    expect(p.userType).toBe('normal');
    expect(p.Valid).toEqual({
      enable: false,
      beginTime: '2020-01-01T00:00:00',
      endTime: '2037-12-31T23:59:59',
      timeType: 'local',
    });
  });

  it.each([
    ['terminal', FALTA_EN_TERMINAL],
    ['videoportero', FALTA_EN_VIDEOPORTERO],
  ])(
    '%s · un rechazo MessageParametersLack NO se convierte en una modificación y su error se ve',
    async (_equipo, rechazo) => {
      const { terminal, llamadas } = montar(rechazo);
      const fallo = await terminal.sincronizar('t-1', 'plantilla-7', jpegConMedidas()).then(
        () => null,
        (e: unknown) => e as Error,
      );
      expect(fallo).not.toBeNull();
      expect(fallo?.message).toMatch(/MessageParametersLack/);
      expect(modificaciones(llamadas)).toBe(0);
    },
  );

  it('employeeNoAlreadyExist SÍ se modifica: la sincronización tiene que poder reintentarse', async () => {
    const { terminal, llamadas } = montar(YA_EXISTE);
    await expect(
      terminal.sincronizar('t-1', 'plantilla-7', jpegConMedidas()),
    ).resolves.toBeUndefined();
    expect(modificaciones(llamadas)).toBe(1);
  });

  it('lo que viaja al equipo lleva las fechas, y sin vigencia no se pide la hora del equipo', async () => {
    const { terminal, llamadas } = montar(OK, 200);
    await terminal.sincronizar('t-1', 'plantilla-7', jpegConMedidas());
    const alta = llamadas.find((l) => l.url.includes('/UserInfo/Record'));
    expect(JSON.parse(alta?.cuerpo ?? '{}')).toMatchObject({
      UserInfo: {
        userType: 'normal',
        Valid: {
          enable: false,
          beginTime: '2020-01-01T00:00:00',
          endTime: '2037-12-31T23:59:59',
          timeType: 'local',
        },
      },
    });
    expect(llamadas.some((l) => /\/System\/time/i.test(l.url))).toBe(false);
  });
});
