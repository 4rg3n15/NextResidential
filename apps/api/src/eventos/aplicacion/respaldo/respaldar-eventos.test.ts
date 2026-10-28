import { describe, expect, it } from 'vitest';
import { ConsultarRespaldos, VIDA_DE_LA_DESCARGA_S, resumirEnvio } from './consultar-respaldos';
import {
  ACTOR,
  COP1,
  COP2,
  HORA_DEL_TRABAJO,
  SUPER1,
  SUPER2,
  acceso,
  correoDePrueba,
  montar,
} from './dobles-del-respaldo';
import { ENVIOS_POR_EJECUCION } from './enviar-respaldos';
import type { IntentoDeEnvio } from './puertos';

/**
 * D-147 · la ejecución diaria entera: recupera los días que falten (hasta
 * 31), envía como mucho 7 correos del más antiguo al más reciente, y la lista
 * de Informes resume el estado del envío de cada día.
 */
describe('RespaldarEventos', () => {
  it('primera ejecución tras 31 días apagado: genera los 31 y envía los 7 más antiguos', async () => {
    const correo = correoDePrueba();
    const m = montar({ correo });
    const parte = await m.respaldar.ejecutar(COP1, ACTOR);

    expect(parte).toEqual({
      generados: 31,
      fallidosAlGenerar: 0,
      enviados: ENVIOS_POR_EJECUCION,
      fallidosAlEnviar: 0,
      sinConfigurar: 0,
    });
    expect(correo.enviados.map((c) => c.asunto.slice(12, 22))).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('las ejecuciones siguientes no regeneran y siguen enviando por orden, siete por vez', async () => {
    const correo = correoDePrueba();
    const m = montar({ correo });
    await m.respaldar.ejecutar(COP1, ACTOR);
    const segunda = await m.respaldar.ejecutar(COP1, ACTOR);
    expect(segunda.generados).toBe(0);
    expect(m.formato.veces).toBe(31);
    expect(correo.enviados[7]?.asunto).toContain('2026-10-04');
    for (let i = 0; i < 5; i += 1) await m.respaldar.ejecutar(COP1, ACTOR);
    expect(correo.enviados).toHaveLength(31);
    expect((await m.respaldar.ejecutar(COP1, ACTOR)).enviados).toBe(0);
  });

  it('un día normal: sólo genera y envía ayer', async () => {
    const correo = correoDePrueba();
    const m = montar({ correo });
    for (let i = 0; i < 5; i += 1) await m.respaldar.ejecutar(COP1, ACTOR);
    m.reloj.avanzar(86_400_000);
    const parte = await m.respaldar.ejecutar(COP1, ACTOR);
    expect([parte.generados, parte.enviados]).toEqual([1, 1]);
    expect(correo.enviados.at(-1)?.asunto).toContain('2026-10-28');
  });

  it('un día que no se puede generar no detiene a los demás y queda en la bitácora sin datos del correo', async () => {
    const m = montar({ correo: correoDePrueba() });
    let llamadas = 0;
    const original = m.almacen.guardar.bind(m.almacen);
    m.almacen.guardar = async (ruta, contenido) => {
      llamadas += 1;
      if (llamadas === 3) throw new Error('Storage respondió 503');
      return original(ruta, contenido);
    };
    const parte = await m.respaldar.ejecutar(COP1, ACTOR);
    expect([parte.generados, parte.fallidosAlGenerar]).toEqual([30, 1]);
    expect(m.bitacora.lineas.filter((l) => l.nivel === 'error')).toHaveLength(1);
    // La siguiente lo recupera.
    expect((await m.respaldar.ejecutar(COP1, ACTOR)).generados).toBe(1);
  });

  it('aislamiento: cada copropiedad tiene sus días, sus ficheros y sus envíos', async () => {
    const correo = correoDePrueba();
    const m = montar({
      correo,
      eventos: [acceso(new Date(Date.UTC(2026, 9, 27, 15)), { copropiedadId: COP2 })],
    });
    await m.respaldar.ejecutar(COP2, ACTOR);
    expect(await m.respaldos.desde(COP1, '2026-01-01')).toHaveLength(0);
    const deDos = await m.respaldos.porFecha(COP2, '2026-10-27');
    expect(deDos?.numeroDeEventos).toBe(1);
    expect([...m.almacen.objetos.keys()].every((r) => r.startsWith(`${COP2}/`))).toBe(true);
    const consultar = new ConsultarRespaldos(m.respaldos, m.envios, m.almacen);
    expect(await consultar.listar(COP1)).toEqual([]);
    expect(await consultar.descarga(COP1, '2026-10-27')).toBeNull();
  });
});

describe('ConsultarRespaldos', () => {
  it('lista del más reciente al más antiguo con el estado del envío, y firma la descarga en el momento', async () => {
    const correo = correoDePrueba([{ estado: 'error', detalle: 'rechazado' }]);
    const m = montar({ correo, destinatarios: [SUPER1, SUPER2] });
    await m.respaldar.ejecutar(COP1, ACTOR);
    const consultar = new ConsultarRespaldos(m.respaldos, m.envios, m.almacen);
    const lista = await consultar.listar(COP1);
    expect(lista).toHaveLength(31);
    expect(lista[0]?.fecha).toBe('2026-10-27');
    expect(lista[0]?.estadoDelEnvio).toBe('pendiente');
    expect(lista.at(-1)?.fecha).toBe('2026-09-27');
    expect(lista.at(-1)?.estadoDelEnvio).toBe('error');
    expect(lista.at(-1)?.ultimoError).toBe('rechazado');
    expect(lista.at(-2)?.estadoDelEnvio).toBe('enviado');
    expect(lista.at(-2)?.enviadosA).toBe(2);

    const descarga = await consultar.descarga(COP1, '2026-10-27');
    expect(descarga).toEqual({
      url: `memoria://respaldo-de-eventos/${COP1}/2026/10/eventos-2026-10-27.xls?vida=${String(VIDA_DE_LA_DESCARGA_S)}`,
      segundosDeVida: 300,
    });
    expect(await consultar.descarga(COP1, '2026-10-28')).toBeNull();
  });

  it('resumirEnvio: manda el ÚLTIMO intento de cada destinatario', () => {
    const t = (m: number): Date => new Date(HORA_DEL_TRABAJO.getTime() + m * 60_000);
    const i = (
      destinatarioId: string,
      resultado: IntentoDeEnvio['resultado'],
      m: number,
    ): IntentoDeEnvio => ({
      respaldoId: 'r',
      destinatarioId,
      resultado,
      error: resultado === 'error' ? 'fallo' : null,
      enviadoEn: resultado === 'enviado' ? t(m) : null,
      conEnlace: false,
      intentadoEn: t(m),
    });
    expect(resumirEnvio([])).toEqual({
      estadoDelEnvio: 'pendiente',
      enviadosA: 0,
      ultimoError: null,
    });
    expect(resumirEnvio([i('a', 'error', 1), i('a', 'enviado', 2)]).estadoDelEnvio).toBe('enviado');
    expect(resumirEnvio([i('a', 'enviado', 1), i('b', 'error', 2)])).toEqual({
      estadoDelEnvio: 'error',
      enviadosA: 1,
      ultimoError: 'fallo',
    });
    expect(resumirEnvio([i('a', 'sin_configurar', 1)]).estadoDelEnvio).toBe('sin_configurar');
  });
});
