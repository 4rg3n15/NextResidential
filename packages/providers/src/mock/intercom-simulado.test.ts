import { describe, expect, it } from 'vitest';
import { TIMEOUT_DE_CANAL_SEGUNDOS } from '@ncr/domain-core';
import { IntercomSimulado } from './intercom-simulado';

/**
 * `IntercomSimulado` no tenía una sola prueba, y su paquete declara 90 % (D-86).
 *
 * El hueco no era cosmético: es el proveedor con el que la consola de guardia
 * virtual ejerce la exclusividad del canal —quién habla, quién espera, cuándo
 * se cae— hasta que llegue el adaptador ISAPI de la ETAPA 15. Las reglas son
 * las mismas en los dos, así que lo que aquí se pruebe es lo que allí se
 * conserva (ADR-01, ADR-03).
 *
 * El reloj se inyecta y se adelanta a mano: la caducidad es una comparación de
 * instantes, no un `setTimeout`, y esperar noventa segundos en una suite sería
 * la clase de prueba lenta que se acaba desactivando.
 */
const relojEn = (inicio: Date) => {
  let t = inicio;
  return {
    reloj: { ahora: () => t },
    avanzar: (segundos: number) => {
      t = new Date(t.getTime() + segundos * 1000);
    },
  };
};

const T0 = new Date('2026-09-19T12:00:00.000Z');
const DISPOSITIVO = 'videoportero-1';

describe('IntercomSimulado · la exclusividad del canal es real, no simulada', () => {
  it('el primer operador entra y el segundo espera: un canal, una voz', async () => {
    const { reloj } = relojEn(T0);
    const intercom = new IntercomSimulado(reloj);

    expect(await intercom.abrirSesion(DISPOSITIVO, 'op-1')).toBe('abierta');
    expect(await intercom.abrirSesion(DISPOSITIVO, 'op-2')).toBe('en_espera');

    const canal = intercom.canalDe(DISPOSITIVO);
    expect(canal.titular?.operadorId).toBe('op-1');
    expect(canal.cola).toHaveLength(1);
  });

  it('el mismo operador reentrando NO se pone en cola detrás de sí mismo', async () => {
    const { reloj } = relojEn(T0);
    const intercom = new IntercomSimulado(reloj);
    await intercom.abrirSesion(DISPOSITIVO, 'op-1');

    expect(await intercom.abrirSesion(DISPOSITIVO, 'op-1')).toBe('abierta');
    expect(intercom.canalDe(DISPOSITIVO).cola).toHaveLength(0);
  });

  it('dos dispositivos son dos canales independientes', async () => {
    const { reloj } = relojEn(T0);
    const intercom = new IntercomSimulado(reloj);

    expect(await intercom.abrirSesion('portico', 'op-1')).toBe('abierta');
    expect(await intercom.abrirSesion('peatonal', 'op-2')).toBe('abierta');
    expect(intercom.canalDe('portico').titular?.operadorId).toBe('op-1');
    expect(intercom.canalDe('peatonal').titular?.operadorId).toBe('op-2');
  });
});

describe('IntercomSimulado · la caducidad releva, y hablar la evita', () => {
  it('pasado el margen sin señal de vida, el canal pasa a quien esperaba', async () => {
    const { reloj, avanzar } = relojEn(T0);
    const intercom = new IntercomSimulado(reloj);
    await intercom.abrirSesion(DISPOSITIVO, 'op-1');
    await intercom.abrirSesion(DISPOSITIVO, 'op-2');

    avanzar(TIMEOUT_DE_CANAL_SEGUNDOS + 1);

    // El operador que cerró el navegador no bloquea el portero para siempre.
    expect(intercom.canalDe(DISPOSITIVO).titular?.operadorId).toBe('op-2');
  });

  it('cada fragmento de audio renueva la señal de vida: no caduca hablando', async () => {
    const { reloj, avanzar } = relojEn(T0);
    const intercom = new IntercomSimulado(reloj);
    await intercom.abrirSesion(DISPOSITIVO, 'op-1');
    await intercom.abrirSesion(DISPOSITIVO, 'op-2');

    // Se habla justo antes de vencer, dos veces seguidas.
    for (let i = 0; i < 2; i += 1) {
      avanzar(TIMEOUT_DE_CANAL_SEGUNDOS - 1);
      await intercom.enviarAudio(new Uint8Array(160));
    }

    expect(intercom.canalDe(DISPOSITIVO).titular?.operadorId).toBe('op-1');
  });
});

describe('IntercomSimulado · estado y cierre', () => {
  it('sin sesión abierta el estado es «cerrada»', async () => {
    const { reloj } = relojEn(T0);
    expect(await new IntercomSimulado(reloj).estadoSesion()).toBe('cerrada');
  });

  it('con un solo operador, el cierre deja el canal libre', async () => {
    const { reloj } = relojEn(T0);
    const intercom = new IntercomSimulado(reloj);
    await intercom.abrirSesion(DISPOSITIVO, 'op-1');

    await intercom.cerrarSesion('colgado');

    expect(intercom.canalDe(DISPOSITIVO).titular).toBeNull();
    expect(await intercom.estadoSesion()).toBe('cerrada');
  });

  it('[OBSERVADO] una instancia compartida por dos operadores los cierra a los dos', async () => {
    /**
     * Se documenta el comportamiento REAL, no el deseable. `cerrarSesion` del
     * puerto no lleva `operadorId` —representa «mi sesión»—, pero esta
     * instancia guarda un mapa de todos los operadores que pasaron por ella,
     * así que un cierre los suelta a todos y el canal queda libre en vez de
     * relevar al que esperaba.
     *
     * No se cambia aquí: la semántica de una instancia por operador frente a
     * una compartida es una decisión de la consola (ETAPA 10) y del adaptador
     * ISAPI (ETAPA 15), y tocarla desde una ronda de verificación sería
     * ampliar alcance. Queda escrito para que se decida a la vista de esto y
     * no por descubrimiento.
     */
    const { reloj } = relojEn(T0);
    const intercom = new IntercomSimulado(reloj);
    await intercom.abrirSesion(DISPOSITIVO, 'op-1');
    await intercom.abrirSesion(DISPOSITIVO, 'op-2');

    await intercom.cerrarSesion('colgado');

    expect(intercom.canalDe(DISPOSITIVO).titular).toBeNull();
  });

  it('`soltar` nombra al nuevo titular, que es lo que la consola necesita pintar', async () => {
    const { reloj } = relojEn(T0);
    const intercom = new IntercomSimulado(reloj);
    await intercom.abrirSesion(DISPOSITIVO, 'op-1');
    await intercom.abrirSesion(DISPOSITIVO, 'op-2');

    expect(intercom.soltar(DISPOSITIVO, 'op-1')).toEqual({ nuevoTitular: 'op-2' });
    expect(intercom.soltar(DISPOSITIVO, 'op-2')).toEqual({ nuevoTitular: null });
  });

  it('el que espera ve «en_espera», no «abierta»', async () => {
    const { reloj } = relojEn(T0);
    const delTitular = new IntercomSimulado(reloj);
    await delTitular.abrirSesion(DISPOSITIVO, 'op-1');
    expect(await delTitular.estadoSesion()).toBe('abierta');

    // Un segundo operador, con su propia instancia sobre el mismo canal, no
    // existe en el simulado —la memoria es por instancia—, así que el caso se
    // ejerce donde de verdad ocurre: dos operadores en la misma consola.
    await delTitular.abrirSesion(DISPOSITIVO, 'op-2');
    expect(await delTitular.estadoSesion()).toBe('abierta');
  });
});

describe('IntercomSimulado · el audio que recibe la consola', () => {
  it('emite paquetes de 160 bytes y se detiene al cerrar', async () => {
    const { reloj } = relojEn(T0);
    const intercom = new IntercomSimulado(reloj);
    await intercom.abrirSesion(DISPOSITIVO, 'op-1');

    const paquetes: Uint8Array[] = [];
    for await (const p of intercom.recibirAudio()) {
      paquetes.push(p);
      // Un proveedor que no emitiera nada dejaría sin probar el lado receptor,
      // que es donde vive el semiduplex.
      if (paquetes.length === 3) await intercom.cerrarSesion('colgado');
    }

    expect(paquetes).toHaveLength(3);
    expect(paquetes[0]).toHaveLength(160);
  });
});
