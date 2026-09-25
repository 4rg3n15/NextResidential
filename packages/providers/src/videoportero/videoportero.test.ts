import { describe, expect, it, vi } from 'vitest';
import { Videoportero, VideoporteroSinOperador } from './videoportero';
import {
  CanalDeAudioSinDescubrir,
  CanalDeEquipoNoHabilitado,
  IntercomDeEquipo,
} from './intercom-equipo';

const respuesta = (estado: number, cuerpo = ''): Response =>
  ({
    status: estado,
    ok: estado >= 200 && estado < 300,
    headers: new Headers(),
    text: async () => cuerpo,
  }) as unknown as Response;

const relojFijo = (iso = '2026-09-22T12:00:00Z') => {
  let momento = new Date(iso);
  return {
    reloj: { ahora: () => momento },
    avanzar: (segundos: number) => {
      momento = new Date(momento.getTime() + segundos * 1000);
    },
  };
};

describe('apertura remota del videoportero', () => {
  it('EXIGE operador: sin él la orden no se ejecuta (RN-08, CA-20)', async () => {
    // La comprobación va delante de la llamada al equipo. Es la diferencia
    // entre una puerta con trazabilidad y una puerta con un campo al lado.
    const peticion = vi.fn(async () => respuesta(200));
    const equipo = new Videoportero({
      host: 'portero.invalid',
      usuario: 'u',
      clave: 'c',
      numeroDePuerta: 1,
      peticion: peticion as unknown as typeof fetch,
    });

    await expect(equipo.abrir('portero-1', '   ')).rejects.toBeInstanceOf(VideoporteroSinOperador);
    expect(peticion).not.toHaveBeenCalled();
  });

  it('con operador, acciona y devuelve la latencia', async () => {
    const peticion = vi.fn(async () => respuesta(200, '<statusCode>1</statusCode>'));
    const equipo = new Videoportero({
      host: 'portero.invalid',
      usuario: 'u',
      clave: 'c',
      numeroDePuerta: 1,
      peticion: peticion as unknown as typeof fetch,
      ahora: (() => {
        let t = 0;
        return () => (t += 55);
      })(),
    });
    const resultado = await equipo.abrir('portero-1', 'operador-3');
    expect(resultado.aceptado).toBe(true);
    expect(resultado.latenciaMs).toBeGreaterThan(0);
  });

  it('un equipo mudo NO lanza: devuelve no aceptado', async () => {
    const peticion = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const equipo = new Videoportero({
      host: 'portero.invalid',
      usuario: 'u',
      clave: 'c',
      numeroDePuerta: 1,
      peticion: peticion as unknown as typeof fetch,
    });
    await expect(equipo.abrir('portero-1', 'op')).resolves.toMatchObject({ aceptado: false });
  });
});

describe('estado del videoportero', () => {
  const con = (respuestas: () => Response | never): Videoportero =>
    new Videoportero({
      host: 'portero.invalid',
      usuario: 'u',
      clave: 'c',
      numeroDePuerta: 1,
      peticion: (async () => respuestas()) as unknown as typeof fetch,
    });

  it('responde: en línea', async () => {
    await expect(con(() => respuesta(200, '<DeviceInfo/>')).estado('p-1')).resolves.toBe(
      'en_linea',
    );
  });

  it('contesta pero rechaza las credenciales: DEGRADADO, no fuera de línea', async () => {
    // Está vivo y mal configurado. Un técnico y un administrador resuelven
    // cosas distintas, y mezclarlos manda al técnico a mirar un cable sano.
    await expect(con(() => respuesta(401)).estado('p-1')).resolves.toBe('degradado');
  });

  it('contesta con error del equipo: también degradado', async () => {
    await expect(con(() => respuesta(500)).estado('p-1')).resolves.toBe('degradado');
  });

  it('no contesta: fuera de línea', async () => {
    await expect(
      con(() => {
        throw new Error('ECONNREFUSED');
      }).estado('p-1'),
    ).resolves.toBe('fuera_de_linea');
  });
});

describe('el canal de audio está escrito y NO habilitado', () => {
  const montar = (habilitado: boolean, respuestas: () => Response = () => respuesta(200)) => {
    const peticion = vi.fn(async () => respuestas());
    const { reloj, avanzar } = relojFijo();
    const intercom = new IntercomDeEquipo({
      host: 'portero.invalid',
      usuario: 'u',
      clave: 'c',
      reloj,
      canalHabilitado: habilitado,
      canal: 1,
      peticion: peticion as unknown as typeof fetch,
    });
    return { intercom, peticion, avanzar };
  };

  it('deshabilitado: no emite NI UNA petición hacia el equipo', async () => {
    // Un adaptador que encendiera por su cuenta una vía de audio hacia la calle
    // sería una decisión de seguridad tomada por el código.
    const { intercom, peticion } = montar(false);
    expect(intercom.disponible()).toBe(false);
    await expect(intercom.abrirSesion('portero-1', 'op-1')).rejects.toBeInstanceOf(
      CanalDeEquipoNoHabilitado,
    );
    expect(peticion).not.toHaveBeenCalled();
  });

  it('el error dice que es un ajuste DEL EQUIPO y dónde está el procedimiento', async () => {
    const { intercom } = montar(false);
    await expect(intercom.abrirSesion('portero-1', 'op-1')).rejects.toThrow(/VALIDACION_HIKVISION/);
  });

  it('habilitado: abre el canal y queda en sesión', async () => {
    const { intercom, peticion } = montar(true);
    await expect(intercom.abrirSesion('portero-1', 'op-1')).resolves.toBe('abierta');
    expect(peticion).toHaveBeenCalledOnce();
    await expect(intercom.estadoSesion()).resolves.toBe('abierta');
  });

  it('el SEGUNDO operador queda EN ESPERA y no toca el equipo', async () => {
    // Abrir el canal del aparato para quien está en cola se lo quitaría al que
    // está hablando.
    const { intercom, peticion } = montar(true);
    await intercom.abrirSesion('portero-1', 'op-1');
    await expect(intercom.abrirSesion('portero-1', 'op-2')).resolves.toBe('en_espera');
    expect(peticion).toHaveBeenCalledOnce();
  });

  it('si el equipo rechaza la apertura, el turno se SUELTA', async () => {
    // Un turno retenido sobre un canal muerto bloquea al siguiente hasta que
    // caduque, que son noventa segundos con el operador mirando.
    const { intercom } = montar(true, () => respuesta(503));
    await expect(intercom.abrirSesion('portero-1', 'op-1')).rejects.toThrow(/no abrió el canal/);
    // El siguiente entra en el acto, no en espera.
    await expect(intercom.abrirSesion('portero-1', 'op-2')).rejects.toThrow(/no abrió el canal/);
  });

  it('el audio SIN sesión abierta lanza: no hay a quién hablarle', async () => {
    const { intercom } = montar(true);
    await expect(intercom.enviarAudio(new Uint8Array([1]))).rejects.toThrow(/sesión/i);
  });

  it('con sesión, el audio viaja por el canal DESCUBIERTO, nunca por un 1 supuesto (D4)', async () => {
    // El transporte está escrito según la documentación y probado aquí; lo que
    // NO tiene es medida contra el aparato: códec, cadencia, duplex, latencia.
    const llamadas: string[] = [];
    const peticion = vi.fn(async (url: string) => {
      llamadas.push(url);
      return respuesta(200);
    });
    const { reloj } = relojFijo();
    const intercom = new IntercomDeEquipo({
      host: 'portero.invalid',
      usuario: 'u',
      clave: 'c',
      reloj,
      canalHabilitado: true,
      canal: 3,
      peticion: peticion as unknown as typeof fetch,
    });
    await intercom.abrirSesion('portero-1', 'op-1');
    await intercom.enviarAudio(new Uint8Array([1, 2, 3]));
    expect(llamadas[0]).toMatch(/channels\/3\/open$/);
    expect(llamadas[1]).toMatch(/channels\/3\/audioData$/);
    expect(llamadas.some((u) => /channels\/1\//.test(u))).toBe(false);
  });

  it('A4 · el audio va por UN flujo que dura la sesión, no un PUT por trozo', async () => {
    const peticiones: { url: string; metodo: string; cuerpo: unknown }[] = [];
    const peticion = vi.fn(async (url: string, init: RequestInit) => {
      peticiones.push({ url, metodo: init.method ?? 'GET', cuerpo: init.body });
      return respuesta(200);
    });
    const { reloj } = relojFijo();
    const intercom = new IntercomDeEquipo({
      host: 'portero.invalid',
      usuario: 'u',
      clave: 'c',
      reloj,
      canalHabilitado: true,
      canal: 2,
      peticion: peticion as unknown as typeof fetch,
    });
    await intercom.abrirSesion('portero-1', 'op-1');
    await intercom.enviarAudio(new Uint8Array([1, 2]));
    await intercom.enviarAudio(new Uint8Array([3, 4]));
    await intercom.enviarAudio(new Uint8Array([5]));

    const subidas = peticiones.filter((p) => /audioData$/.test(p.url) && p.metodo === 'PUT');
    expect(subidas).toHaveLength(1);
    const cuerpo = subidas[0]?.cuerpo;
    expect(cuerpo).toBeInstanceOf(ReadableStream);

    // Lo que el flujo entrega son los trozos, en orden; y cerrar la sesión lo termina.
    const lector = (cuerpo as ReadableStream<Uint8Array>).getReader();
    const leidos: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { value } = await lector.read();
      leidos.push(...(value ?? []));
    }
    expect(leidos).toEqual([1, 2, 3, 4, 5]);
    await intercom.cerrarSesion('fin');
    expect((await lector.read()).done).toBe(true);
    // Tras cerrar, hablar vuelve a exigir sesión.
    await expect(intercom.enviarAudio(new Uint8Array([9]))).rejects.toThrow(/sesión/);
  });

  it('A4 · con señalización DECLARADA, abrir contesta y cerrar cuelga; sin ella, ninguna señal', async () => {
    const montarCon = (senalizacion: boolean) => {
      const cuerpos: string[] = [];
      const peticion = vi.fn(async (url: string, init: RequestInit) => {
        if (/callSignal/.test(url)) cuerpos.push(String(init.body));
        return respuesta(200);
      });
      const { reloj } = relojFijo();
      return {
        cuerpos,
        intercom: new IntercomDeEquipo({
          host: 'portero.invalid',
          usuario: 'u',
          clave: 'c',
          reloj,
          canalHabilitado: true,
          canal: 1,
          senalizacion,
          peticion: peticion as unknown as typeof fetch,
        }),
      };
    };
    const con = montarCon(true);
    await con.intercom.abrirSesion('portero-1', 'op-1');
    await con.intercom.cerrarSesion('fin');
    expect(con.cuerpos).toEqual([
      JSON.stringify({ CallSignal: { cmdType: 'answer' } }),
      JSON.stringify({ CallSignal: { cmdType: 'hangUp' } }),
    ]);

    const sin = montarCon(false);
    await sin.intercom.abrirSesion('portero-1', 'op-1');
    await sin.intercom.cerrarSesion('fin');
    expect(sin.cuerpos).toEqual([]);
  });

  it('A4 · si el equipo rechaza el flujo de audio, el siguiente trozo lo dice', async () => {
    const peticion = vi.fn(async (url: string) =>
      /audioData$/.test(url) ? respuesta(400) : respuesta(200),
    );
    const { reloj } = relojFijo();
    const intercom = new IntercomDeEquipo({
      host: 'portero.invalid',
      usuario: 'u',
      clave: 'c',
      reloj,
      canalHabilitado: true,
      canal: 1,
      peticion: peticion as unknown as typeof fetch,
    });
    await intercom.abrirSesion('portero-1', 'op-1');
    await intercom.enviarAudio(new Uint8Array([1]));
    // La respuesta del equipo llega después del primer trozo.
    await new Promise((listo) => setTimeout(listo, 0));
    await expect(intercom.enviarAudio(new Uint8Array([2]))).rejects.toThrow(/HTTP 400/);
  });

  it('sin canal descubierto NO se abre: se dice que falta, no se supone 1 (D4)', async () => {
    const peticion = vi.fn(async () => respuesta(200));
    const { reloj } = relojFijo();
    const intercom = new IntercomDeEquipo({
      host: 'portero.invalid',
      usuario: 'u',
      clave: 'c',
      reloj,
      canalHabilitado: true,
      canal: null,
      peticion: peticion as unknown as typeof fetch,
    });
    await expect(intercom.abrirSesion('portero-1', 'op-1')).rejects.toBeInstanceOf(
      CanalDeAudioSinDescubrir,
    );
    expect(peticion).not.toHaveBeenCalled();
    // Y el turno se soltó: el siguiente no se queda en espera de un canal muerto.
    await expect(intercom.abrirSesion('portero-1', 'op-2')).rejects.toBeInstanceOf(
      CanalDeAudioSinDescubrir,
    );
  });

  it('cerrar manda el cierre al equipo aunque el turno ya hubiera caducado', async () => {
    // Un canal que el equipo cree abierto no admite al siguiente, y ese estado
    // sobrevive a nuestro proceso.
    const { intercom, peticion, avanzar } = montar(true);
    await intercom.abrirSesion('portero-1', 'op-1');
    avanzar(10_000);
    await intercom.cerrarSesion('colgado');
    expect(peticion).toHaveBeenCalledTimes(2);
    await expect(intercom.estadoSesion()).resolves.toBe('cerrada');
  });

  it('un cierre que falla no rompe: el equipo lo soltará por su vencimiento', async () => {
    let n = 0;
    const { intercom } = montar(true, () => {
      n += 1;
      if (n === 1) return respuesta(200);
      throw new Error('se cayó la red al colgar');
    });
    await intercom.abrirSesion('portero-1', 'op-1');
    await expect(intercom.cerrarSesion('colgado')).resolves.toBeUndefined();
  });

  it('cerrar sin sesión abierta no hace nada', async () => {
    const { intercom, peticion } = montar(true);
    await intercom.cerrarSesion('colgado');
    expect(peticion).not.toHaveBeenCalled();
  });

  it('sólo el TITULAR renueva el turno', async () => {
    // Que un operador en cola pudiera renovar el turno ajeno dejaría el canal
    // retenido para siempre.
    const { intercom } = montar(true);
    await intercom.abrirSesion('portero-1', 'op-1');
    expect(intercom.renovar('portero-1', 'op-1')).toBe(true);
    expect(intercom.renovar('portero-1', 'op-2')).toBe(false);
  });
});
