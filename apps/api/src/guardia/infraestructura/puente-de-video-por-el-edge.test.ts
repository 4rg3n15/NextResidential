import { describe, expect, it } from 'vitest';
import { from, lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { EdgeDesconectado, FUENTE_EN_EL_EDGE } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import type { CredencialesEnElEdge } from '../../comun/credenciales-en-el-edge';
import { InterceptorDeCopropiedadEnCurso } from '../../proveedores';
import { PuenteDeVideoFallo, PuenteDeVideoNoConfigurado } from '../aplicacion/puertos';
import type { PuenteDeVideo } from '../aplicacion/puertos';
import { NegociarVistaEnVivo } from '../aplicacion/vista-en-vivo';
import type { SolicitudDeVistaEnVivo } from '../aplicacion/vista-en-vivo';
import {
  PuenteDeVideoPorElEdge,
  VistaEnVivoPorCopropiedad,
  vistaEnVivoPorCopropiedad,
} from './puente-de-video-por-el-edge';

/**
 * 15-Q2 · E2 · el video de un equipo con puente lo negocia el go2rtc del Edge:
 * la oferta SDP viaja por el túnel (`video.whep`) y la respuesta vuelve igual.
 * Cualquier otra fuente va al puente directo de siempre, o falla como antes (R1).
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = 'd0000001-0000-4000-8000-000000000001';
const OFERTA = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n';
const RESPUESTA = 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n';
const RTSP_DIRECTO = 'rtsp://operador:clave-de-prueba@192.0.2.50:554/flujo/101';

const enCopropiedad = <T>(copropiedadId: string, hacer: () => Promise<T>): Promise<T> => {
  const contexto = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ url: `/copropiedades/${copropiedadId}/video` }) }),
  } as unknown as ExecutionContext;
  const siguiente: CallHandler = { handle: () => from(hacer()) };
  return lastValueFrom(
    new InterceptorDeCopropiedadEnCurso().intercept(contexto, siguiente),
  ) as Promise<T>;
};

const montar = (o: { directo?: boolean; respuesta?: () => Promise<unknown> } = {}) => {
  const directas: string[] = [];
  const directo: PuenteDeVideo = {
    asegurarFlujo: async (nombre, fuente) => void directas.push(`asegurar:${nombre}:${fuente}`),
    negociar: async (nombre) => {
      directas.push(`negociar:${nombre}`);
      return 'v=0 directo';
    },
  };
  const pedidos: { copropiedadId: string; nombre: string; carga: unknown; plazoMs: number }[] = [];
  const edge = {
    pedir: async (copropiedadId: string, nombre: string, carga: unknown, plazoMs: number) => {
      pedidos.push({ copropiedadId, nombre, carga, plazoMs });
      return (o.respuesta ?? (async () => RESPUESTA))();
    },
  } as unknown as CredencialesEnElEdge;
  const puente = new PuenteDeVideoPorElEdge(o.directo === false ? null : directo, edge);
  return { puente, directas, pedidos };
};

const delEdge = async (m: ReturnType<typeof montar>, nombre = 'equipo-video') => {
  await m.puente.asegurarFlujo(nombre, `${FUENTE_EN_EL_EDGE}${EQUIPO}`);
  return nombre;
};

describe('PuenteDeVideoPorElEdge (15-Q2, E2)', () => {
  it('con puente: la oferta va por el túnel como `video.whep` y vuelve el SDP del Edge', async () => {
    const m = montar();
    const nombre = await delEdge(m);
    const sdp = await enCopropiedad(COP, () => m.puente.negociar(nombre, OFERTA));
    expect(sdp).toBe(RESPUESTA);
    expect(m.pedidos).toEqual([
      {
        copropiedadId: COP,
        nombre: 'video.whep',
        carga: { dispositivoId: EQUIPO, nombre, ofertaSdp: OFERTA },
        plazoMs: 15_000,
      },
    ]);
    expect(m.directas).toEqual([]);
  });

  it('R1 · otra fuente: el puente directo de siempre, para asegurar y negociar', async () => {
    const m = montar();
    await m.puente.asegurarFlujo('equipo-video', RTSP_DIRECTO);
    expect(await m.puente.negociar('equipo-video', OFERTA)).toBe('v=0 directo');
    expect(m.directas).toEqual([`asegurar:equipo-video:${RTSP_DIRECTO}`, 'negociar:equipo-video']);
    expect(m.pedidos).toEqual([]);
  });

  it('R1 · sin puente directo configurado: PuenteDeVideoNoConfigurado, como antes', async () => {
    const m = montar({ directo: false });
    await expect(m.puente.asegurarFlujo('x', RTSP_DIRECTO)).rejects.toBeInstanceOf(
      PuenteDeVideoNoConfigurado,
    );
    await expect(m.puente.negociar('x', OFERTA)).rejects.toBeInstanceOf(PuenteDeVideoNoConfigurado);
  });

  it('sin puente directo, la fuente del Edge sigue sirviendo', async () => {
    const m = montar({ directo: false });
    const nombre = await delEdge(m);
    expect(await enCopropiedad(COP, () => m.puente.negociar(nombre, OFERTA))).toBe(RESPUESTA);
  });

  it('si el flujo deja de ser del Edge, se olvida: el siguiente negocia por el directo', async () => {
    const m = montar();
    const nombre = await delEdge(m);
    await m.puente.asegurarFlujo(nombre, RTSP_DIRECTO);
    expect(await enCopropiedad(COP, () => m.puente.negociar(nombre, OFERTA))).toBe('v=0 directo');
    expect(m.pedidos).toEqual([]);
  });

  it('fuera de la ruta de su copropiedad: PuenteDeVideoFallo, sin tocar el túnel', async () => {
    const m = montar();
    const nombre = await delEdge(m);
    const error = await m.puente.negociar(nombre, OFERTA).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PuenteDeVideoFallo);
    expect((error as PuenteDeVideoFallo).motivo).toBe(
      'la negociación no llegó por la ruta de su copropiedad',
    );
    expect(m.pedidos).toEqual([]);
  });

  it.each([
    ['un texto que no es SDP', async () => 'no soy un SDP'],
    ['algo que no es texto', async () => ({ sdp: RESPUESTA })],
  ])('si el Edge contesta %s: PuenteDeVideoFallo «no contestó SDP»', async (_caso, respuesta) => {
    const m = montar({ respuesta });
    const nombre = await delEdge(m);
    const error = await enCopropiedad(COP, () => m.puente.negociar(nombre, OFERTA)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PuenteDeVideoFallo);
    expect((error as PuenteDeVideoFallo).motivo).toBe('el go2rtc del Edge no contestó SDP');
  });

  it('el túnel caído llega como PuenteDeVideoFallo con su motivo', async () => {
    const m = montar({ respuesta: () => Promise.reject(new EdgeDesconectado()) });
    const nombre = await delEdge(m);
    const error = await enCopropiedad(COP, () => m.puente.negociar(nombre, OFERTA)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PuenteDeVideoFallo);
    expect((error as PuenteDeVideoFallo).motivo).toBe(
      'go2rtc del Edge: el Edge del conjunto no está conectado',
    );
  });

  it('RN-21 · una URL RTSP con credencial en el error del Edge sale redactada', async () => {
    const m = montar({ respuesta: () => Promise.reject(new Error(`no abre ${RTSP_DIRECTO}`)) });
    const nombre = await delEdge(m);
    const error = await enCopropiedad(COP, () => m.puente.negociar(nombre, OFERTA)).catch(
      (e: unknown) => e,
    );
    expect((error as PuenteDeVideoFallo).motivo).toBe(
      'go2rtc del Edge: no abre rtsp://[redactado]',
    );
    expect((error as Error).message).not.toContain('clave-de-prueba');
  });

  it('un rechazo que no es Error también se redacta y se envuelve', async () => {
    const m = montar({ respuesta: () => Promise.reject(`fallo ${RTSP_DIRECTO}`) });
    const nombre = await delEdge(m);
    const error = await enCopropiedad(COP, () => m.puente.negociar(nombre, OFERTA)).catch(
      (e: unknown) => e,
    );
    expect((error as PuenteDeVideoFallo).motivo).toBe('go2rtc del Edge: fallo rtsp://[redactado]');
  });
});

describe('VistaEnVivoPorCopropiedad (15-Q2, E2 · R1)', () => {
  const SOLICITUD: SolicitudDeVistaEnVivo = {
    copropiedadId: COP,
    dispositivoId: EQUIPO,
    operadorId: '00000000-0000-4000-8000-0000000000b1',
    ofertaSdp: OFERTA,
  };
  const negociacion = (quien: string, vistas: string[]) => ({
    ejecutar: async (s: SolicitudDeVistaEnVivo) => {
      vistas.push(`${quien}:${s.dispositivoId}`);
      return {
        respuestaSdp: RESPUESTA,
        flujo: 'principal' as const,
        detalle: quien,
        latenciaMs: 1,
        via: 'directo' as const,
      };
    },
  });
  const conPuente = (puente: string | null) =>
    ({ puenteDe: async () => puente }) as unknown as CredencialesEnElEdge;

  it('R1 · copropiedad sin puente: el caso de uso de siempre; con puente, el del Edge', async () => {
    const vistas: string[] = [];
    const sin = new VistaEnVivoPorCopropiedad(
      negociacion('siempre', vistas),
      negociacion('edge', vistas),
      conPuente(null),
    );
    const con = new VistaEnVivoPorCopropiedad(
      negociacion('siempre', vistas),
      negociacion('edge', vistas),
      conPuente('edge-1'),
    );
    expect((await sin.ejecutar(SOLICITUD)).detalle).toBe('siempre');
    expect((await con.ejecutar(SOLICITUD)).detalle).toBe('edge');
    expect(vistas).toEqual([`siempre:${EQUIPO}`, `edge:${EQUIPO}`]);
  });

  it('la fábrica: sin Edge en la app, el caso de uso de siempre tal cual; con él, el enrutador', () => {
    const proveedor = {} as ProveedorDeEquipos;
    const bitacora: Bitacora = { registrar: () => undefined };
    const reloj: Reloj = { ahora: () => new Date(0) };
    for (const edge of [undefined, null]) {
      const r = vistaEnVivoPorCopropiedad(proveedor, null, bitacora, reloj, edge);
      expect(r).toBeInstanceOf(NegociarVistaEnVivo);
    }
    const r = vistaEnVivoPorCopropiedad(proveedor, null, bitacora, reloj, conPuente(null));
    expect(r).toBeInstanceOf(VistaEnVivoPorCopropiedad);
  });
});
