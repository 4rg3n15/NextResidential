import { describe, expect, it } from 'vitest';
import { UMBRAL_DE_LATIDO_POR_DEFECTO } from '@ncr/domain-core';
import { VigilarLatidos } from './vigilancia-latidos';
import { EscalarAlerta } from './escalamiento';
import {
  RepositorioAlertasEnMemoria,
  RepositorioDispositivosEnMemoria,
} from '../infraestructura/repositorios-en-memoria';
import { bitacoraDePrueba, canalCon, idsSecuenciales, relojFijo } from './dobles';

const COP = 'cop-1';
const T0 = new Date('2026-09-08T14:00:00Z');
const ACTOR = 'actor-1';
const haceSegundos = (s: number): Date => new Date(T0.getTime() - s * 1000);

const montar = (): {
  caso: VigilarLatidos;
  dispositivos: RepositorioDispositivosEnMemoria;
  alertas: RepositorioAlertasEnMemoria;
} => {
  const dispositivos = new RepositorioDispositivosEnMemoria();
  const alertas = new RepositorioAlertasEnMemoria();
  const reloj = relojFijo(T0);
  const bitacora = bitacoraDePrueba();
  const escalador = new EscalarAlerta(canalCon(1), alertas, reloj, bitacora);
  return {
    caso: new VigilarLatidos(
      dispositivos,
      alertas,
      escalador,
      reloj,
      idsSecuenciales('al'),
      bitacora,
    ),
    dispositivos,
    alertas,
  };
};

describe('VigilarLatidos · CA-26, RN-12, P-06', () => {
  it('un dispositivo con latido reciente no genera nada', async () => {
    const m = montar();
    m.dispositivos.declarar(COP, 'disp-1', haceSegundos(10));

    const parte = await m.caso.ejecutar(COP, ACTOR);
    expect(parte).toEqual({ revisados: 1, caidos: [], degradados: [], alertasAbiertas: 0 });
  });

  it('un dispositivo degradado se reporta pero NO levanta alerta', async () => {
    // El escalón intermedio existe justo para esto: un latido perdido no puede
    // sonar como una puerta sin control.
    const m = montar();
    m.dispositivos.declarar(COP, 'disp-1', haceSegundos(150));

    const parte = await m.caso.ejecutar(COP, ACTOR);
    expect(parte.degradados).toEqual(['disp-1']);
    expect(parte.alertasAbiertas).toBe(0);
    expect(await m.alertas.abiertasDe(COP)).toEqual([]);
  });

  it('un dispositivo caído levanta alerta alta y la escala', async () => {
    const m = montar();
    m.dispositivos.declarar(COP, 'disp-1', haceSegundos(400));

    const parte = await m.caso.ejecutar(COP, ACTOR);
    expect(parte.caidos).toEqual(['disp-1']);
    expect(parte.alertasAbiertas).toBe(1);

    const abiertas = await m.alertas.abiertasDe(COP);
    expect(abiertas[0]?.tipo).toBe('dispositivo_caido');
    expect(abiertas[0]?.severidad).toBe('alta');
    expect(abiertas[0]?.escaladaEn).not.toBeNull();
  });

  it('un dispositivo que NUNCA latió se trata como caído', async () => {
    const m = montar();
    m.dispositivos.declarar(COP, 'disp-nuevo', null);
    expect((await m.caso.ejecutar(COP, ACTOR)).caidos).toEqual(['disp-nuevo']);
  });

  it('la segunda pasada NO abre una alerta más para el mismo dispositivo', async () => {
    // Sin esto, un equipo caído un fin de semana produciría una alerta por
    // pasada y el operador dejaría de mirar la consola.
    const m = montar();
    m.dispositivos.declarar(COP, 'disp-1', haceSegundos(400));

    await m.caso.ejecutar(COP, ACTOR);
    const segunda = await m.caso.ejecutar(COP, ACTOR);

    expect(segunda.caidos).toEqual(['disp-1']);
    expect(segunda.alertasAbiertas).toBe(0);
    expect((await m.alertas.abiertasDe(COP)).length).toBe(1);
  });

  it('resuelta la alerta, una caída posterior vuelve a alertar', async () => {
    const m = montar();
    m.dispositivos.declarar(COP, 'disp-1', haceSegundos(400));
    await m.caso.ejecutar(COP, ACTOR);

    const abierta = (await m.alertas.abiertasDe(COP))[0];
    if (abierta === undefined) throw new Error('debería existir una alerta');
    const resuelta = abierta.resolver(T0, 'equipo reiniciado');
    if (!resuelta.ok) throw new Error('no se pudo resolver');
    await m.alertas.guardar(resuelta.valor, ACTOR);

    expect((await m.caso.ejecutar(COP, ACTOR)).alertasAbiertas).toBe(1);
  });

  it('admite el umbral propio de la copropiedad (P-06 configurable)', async () => {
    const m = montar();
    m.dispositivos.declarar(COP, 'disp-1', haceSegundos(40));

    expect((await m.caso.ejecutar(COP, ACTOR)).caidos).toEqual([]);
    const estricto = await m.caso.ejecutar(COP, ACTOR, {
      periodoSegundos: 5,
      latidosTolerados: 0,
      silencioParaCaidoSegundos: 30,
    });
    expect(estricto.caidos).toEqual(['disp-1']);
  });

  it('no mira los dispositivos de otra copropiedad', async () => {
    const m = montar();
    m.dispositivos.declarar('cop-2', 'ajeno', null);
    expect((await m.caso.ejecutar(COP, ACTOR)).revisados).toBe(0);
  });

  it('el registro de latido devuelve el dispositivo a saludable', async () => {
    const m = montar();
    m.dispositivos.declarar(COP, 'disp-1', haceSegundos(400));
    await m.dispositivos.registrarLatido(COP, 'disp-1', T0);
    expect((await m.caso.ejecutar(COP, ACTOR)).caidos).toEqual([]);
  });

  it('el umbral por defecto es el conservador aprobado', () => {
    expect(UMBRAL_DE_LATIDO_POR_DEFECTO.silencioParaCaidoSegundos).toBe(300);
  });
});
