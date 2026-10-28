import { describe, expect, it } from 'vitest';
import { diasAnteriores } from './dias';
import {
  ACTOR,
  COP1,
  HORA_DEL_TRABAJO,
  SUPER1,
  SUPER2,
  correoDePrueba,
  montar,
} from './dobles-del-respaldo';
import { ENVIOS_POR_EJECUCION } from './enviar-respaldos';

/**
 * D-147 · lo que señaló la revisión del PR, cada caso con su prueba:
 *  · un destinatario que el servidor RECHAZA no consta como enviado;
 *  · un respaldo que falla siempre no deja sin turno a los días siguientes;
 *  · dos ejecuciones a la vez no envían dos veces el mismo correo.
 */
describe('EnviarRespaldos · lo que vio la revisión', () => {
  it('si el servidor rechaza una dirección, ESE destinatario consta como fallido y se reintenta', async () => {
    const correo = correoDePrueba([
      { estado: 'enviado', rechazados: [SUPER2.correo.toUpperCase()] },
    ]);
    const m = montar({ correo, destinatarios: [SUPER1, SUPER2] });
    const [ayer] = diasAnteriores(HORA_DEL_TRABAJO, 1);
    if (ayer === undefined) throw new Error('sin día');
    const { respaldo } = await m.generar.ejecutar(COP1, ayer, ACTOR);

    expect(await m.enviar.ejecutar(COP1, [respaldo], ACTOR)).toEqual({
      enviados: 1,
      fallidos: 1,
      sinConfigurar: 0,
    });
    const intentos = await m.envios.intentos(COP1, [respaldo.id]);
    const de = (id: string) => intentos.find((i) => i.destinatarioId === id);
    expect(de(SUPER1.id)?.resultado).toBe('enviado');
    expect(de(SUPER2.id)?.resultado).toBe('error');
    expect(de(SUPER2.id)?.error).not.toContain('@');

    m.reloj.avanzar(60_000);
    await m.enviar.ejecutar(COP1, [respaldo], ACTOR);
    expect(correo.enviados.at(-1)?.destinatarios).toEqual([SUPER2.correo]);
  });

  it('un respaldo que falla siempre no ocupa los turnos de los días siguientes', async () => {
    const correo = correoDePrueba();
    const m = montar({ correo });
    const dias = diasAnteriores(HORA_DEL_TRABAJO, ENVIOS_POR_EJECUCION + 1);
    const respaldos = [];
    for (const d of dias) respaldos.push((await m.generar.ejecutar(COP1, d, ACTOR)).respaldo);
    // Los siete más antiguos pierden su fichero: fallarán en cada ejecución.
    for (const r of respaldos.slice(0, ENVIOS_POR_EJECUCION)) m.almacen.objetos.delete(r.ruta);

    expect((await m.enviar.ejecutar(COP1, respaldos, ACTOR)).fallidos).toBe(ENVIOS_POR_EJECUCION);
    m.reloj.avanzar(86_400_000);
    // La segunda ejecución atiende primero al que nunca falló.
    expect((await m.enviar.ejecutar(COP1, respaldos, ACTOR)).enviados).toBe(1);
    expect(correo.enviados.map((c) => c.asunto)).toEqual([
      expect.stringContaining(dias.at(-1)?.fecha ?? 'x'),
    ]);
  });
});

describe('RespaldarEventos · dos ejecuciones a la vez', () => {
  it('la segunda espera a la primera: ningún correo sale dos veces', async () => {
    const correo = correoDePrueba();
    const m = montar({ correo });
    const [a, b] = await Promise.all([
      m.respaldar.ejecutar(COP1, ACTOR),
      m.respaldar.ejecutar(COP1, ACTOR),
    ]);
    expect(a.enviados + b.enviados).toBe(ENVIOS_POR_EJECUCION * 2);
    const asuntos = correo.enviados.map((c) => c.asunto);
    expect(new Set(asuntos).size).toBe(asuntos.length);
    expect(b.generados).toBe(0);
  });

  it('un fallo de la primera no impide la segunda', async () => {
    const m = montar({ correo: correoDePrueba() });
    const guardar = m.almacen.guardar.bind(m.almacen);
    let primera = true;
    m.almacen.guardar = async (ruta, contenido) => {
      if (primera) {
        primera = false;
        throw new Error('Storage caído');
      }
      return guardar(ruta, contenido);
    };
    const [a, b] = await Promise.all([
      m.respaldar.ejecutar(COP1, ACTOR),
      m.respaldar.ejecutar(COP1, ACTOR),
    ]);
    expect(a.fallidosAlGenerar).toBe(1);
    expect(b.generados).toBe(1);
  });
});
