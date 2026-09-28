import { describe, expect, it } from 'vitest';
import { pasoDeEventos } from './paso-de-eventos';
import type { OpcionesDeEnsayo } from './tipos';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import type { SituacionesDeSitio } from '../simulacion/situaciones-de-sitio';
import { LIMITES_DE_FOTO_POR_OMISION } from '../terminal/foto-del-rostro';

/**
 * C7 (corrección de la 15-L) · paso 4 sin la plataforma: el ensayo se suscribe
 * él mismo, y si el equipo lo rechaza porque HikCentral tiene la conexión (o
 * agotó las que admite), lo dice con esas palabras y CORTA: reintentar durante
 * el plazo entero no lo arregla.
 */
const opciones = (situaciones: SituacionesDeSitio, trazas: string[]): OpcionesDeEnsayo => ({
  equipo: {
    familia: 'videoportero',
    host: '192.0.2.77',
    usuario: 'servicio',
    clave: 'p1',
    puerta: 1,
    canalDeVideo: '102',
    puertoRtsp: 554,
    peticion: equipoSimulado({
      familia: 'videoportero',
      usuario: 'servicio',
      clave: 'p1',
      situaciones,
    }),
    // La traza del equipo sigue recibiendo lo suyo aunque el ensayo escuche.
    traza: { registrar: (_n, mensaje) => trazas.push(mensaje) },
  },
  interlocutor: { indicar: async () => undefined, confirmar: async () => true },
  soloLectura: false,
  // Un plazo largo: si el rechazo no cortara, la prueba lo notaría.
  esperaDeEventoMs: 20_000,
  limitesDeFoto: LIMITES_DE_FOTO_POR_OMISION,
  zona: 'America/Bogota',
  ahora: () => new Date(),
});

describe('la suscripción que otra plataforma no deja abrir', () => {
  it('otra plataforma: FALLO en el acto, con HikCentral y la acción', async () => {
    const trazas: string[] = [];
    const inicio = Date.now();
    const r = await pasoDeEventos(opciones({ escuchaRechazada: 'otra_plataforma' }, trazas));
    expect(Date.now() - inicio).toBeLessThan(5000);
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(
      /^El equipo rechazó la conexión de eventos \(HTTP 403 \(alreadyArmed\)\)/,
    );
    expect(r.causa).toMatch(/otra plataforma —p\. ej\. HikCentral— ya la tiene/);
    expect(r.accion).toMatch(/^Deshabilite el equipo en HikCentral durante la prueba/);
    expect(trazas).toContain('escucha: el equipo rechazó la conexión');
  });

  it('el máximo de conexiones, igual', async () => {
    const r = await pasoDeEventos(opciones({ escuchaRechazada: 'limite_de_conexiones' }, []));
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(/HTTP 503 \(deviceBusy\)\): ya tiene el máximo de conexiones/);
  });
});
