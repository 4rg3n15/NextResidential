import { describe, expect, it } from 'vitest';
import { EscuchaDeAlertStream } from './escucha-alertstream';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import type { SituacionesDeSitio } from '../simulacion/situaciones-de-sitio';

/**
 * C7 (corrección de la 15-L) · la escucha de la API RECUERDA por qué el equipo
 * la rechazó, para que la ficha lo diga con la misma frase que el ensayo. Y lo
 * olvida en cuanto una conexión vuelve a abrirse: un rechazo de ayer no es un
 * bloqueo de hoy.
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;

const escuchaCon = (situaciones: SituacionesDeSitio, trazas: string[] = []): EscuchaDeAlertStream =>
  new EscuchaDeAlertStream({
    host: '192.0.2.40',
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    dispositivoId: 'v-1',
    familia: 'videoportero',
    peticion: equipoSimulado({ familia: 'videoportero', ...CREDENCIAL, situaciones }),
    traza: { registrar: (_nivel, mensaje) => trazas.push(mensaje) },
    // Una espera real, aunque mínima: con una que resuelve al instante, el bucle de
    // reconexión contra el equipo simulado no suelta nunca el hilo y nada lo cancela.
    esperar: (ms) => new Promise((listo) => setTimeout(listo, Math.min(ms, 5))),
  });

/** Da una vuelta al bucle de la escucha y la cancela: basta para un intento. */
const unIntento = async (escucha: EscuchaDeAlertStream): Promise<void> => {
  const cancelar = new AbortController();
  const bucle = (async () => {
    // El primer evento, si llega, basta: lo que se mira es el intento, no el evento.
    await escucha.escuchar(cancelar.signal)[Symbol.asyncIterator]().next();
  })();
  await new Promise((listo) => setTimeout(listo, 50));
  cancelar.abort();
  await bucle;
};

describe('C7 · la escucha recuerda el rechazo por otra plataforma', () => {
  it('otra plataforma tiene la conexión: la frase, con HikCentral y el remedio', async () => {
    const escucha = escuchaCon({ escuchaRechazada: 'otra_plataforma' });
    await unIntento(escucha);
    expect(escucha.rechazoPorOtraPlataforma()).toMatch(/otra plataforma —p\. ej\. HikCentral—/);
    expect(escucha.rechazoPorOtraPlataforma()).toMatch(/deshabilite el equipo en HikCentral/);
  });

  it('el máximo de conexiones: también, con su motivo', async () => {
    const escucha = escuchaCon({ escuchaRechazada: 'limite_de_conexiones' });
    await unIntento(escucha);
    expect(escucha.rechazoPorOtraPlataforma()).toMatch(/máximo de conexiones abiertas/);
  });

  it('en cuanto una conexión se abre, el rechazo de antes se OLVIDA', async () => {
    // HikCentral suelta el equipo entre un intento y el siguiente.
    const situaciones: { escuchaRechazada?: 'otra_plataforma' } = {
      escuchaRechazada: 'otra_plataforma',
    };
    const trazas: string[] = [];
    const escucha = escuchaCon(situaciones, trazas);
    await unIntento(escucha);
    expect(escucha.rechazoPorOtraPlataforma()).not.toBeNull();
    delete situaciones.escuchaRechazada;
    await unIntento(escucha);
    expect(trazas).toContain('escucha: conexión abierta');
    expect(escucha.rechazoPorOtraPlataforma()).toBeNull();
  });
});
