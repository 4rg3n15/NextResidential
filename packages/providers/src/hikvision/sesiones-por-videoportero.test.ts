import { describe, expect, it } from 'vitest';
import type { Reloj } from '@ncr/domain-core';
import { HikvisionProvider } from './hikvision-provider';
import { RegistroEnMemoria } from './registro-de-equipos';
import type { EquipoRegistrado } from './registro-de-equipos';
import { equiposSimulados } from '../simulacion/equipo-simulado';

/**
 * C6 (ETAPA 15-M) · DOS VIDEOPORTEROS CON SESIÓN DE AUDIO A LA VEZ
 *
 * Antes el adaptador recordaba UNA sesión (`enSesion`): abrir la del segundo
 * videoportero hacía que el audio del primero fuera al segundo y que colgar
 * uno colgara al otro. Ahora hay una sesión por equipo (ADR-01: exclusividad
 * POR EQUIPO), y el puerto sin dispositivo sigue valiendo con una sola.
 */
const RELOJ: Reloj = { ahora: () => new Date('2026-09-29T12:00:00.000Z') };
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
const PORTERO_1 = 'disp-portero-1';
const PORTERO_2 = 'disp-portero-2';

const portero = (dispositivoId: string, host: string): EquipoRegistrado => ({
  dispositivoId,
  tipo: 'intercom',
  host,
  puerto: 80,
  protocolo: 'http',
  ...CREDENCIAL,
  canalDeAudioHabilitado: true,
  numeroDePuerta: 1,
});

const montar = () =>
  new HikvisionProvider({
    registro: new RegistroEnMemoria([
      portero(PORTERO_1, '203.0.113.21'),
      portero(PORTERO_2, '203.0.113.22'),
    ]),
    reloj: RELOJ,
    peticion: equiposSimulados({
      '203.0.113.21': {
        familia: 'videoportero',
        ...CREDENCIAL,
        canalesDeAudio: [{ id: 1, habilitado: true, codec: 'G.711ulaw' }],
      },
      '203.0.113.22': {
        familia: 'videoportero',
        ...CREDENCIAL,
        canalesDeAudio: [{ id: 1, habilitado: true, codec: 'G.711ulaw' }],
      },
    }),
  });

describe('C6 · una sesión de audio por videoportero', () => {
  it('los dos videoporteros abren sesión a la vez y cada uno conserva la suya', async () => {
    const proveedor = montar();
    expect(await proveedor.abrirSesion(PORTERO_1, 'operador-a')).toBe('abierta');
    expect(await proveedor.abrirSesion(PORTERO_2, 'operador-b')).toBe('abierta');
    expect(await proveedor.estadoSesionDe(PORTERO_1)).toBe('abierta');
    expect(await proveedor.estadoSesionDe(PORTERO_2)).toBe('abierta');
    // El audio va al equipo que se nombra, no «al último que abrió».
    await proveedor.enviarAudioA(PORTERO_1, new Uint8Array([1, 2, 3]));
    await proveedor.enviarAudioA(PORTERO_2, new Uint8Array([4, 5, 6]));
    // Colgar uno NO cuelga al otro.
    await proveedor.cerrarSesionDe(PORTERO_1, 'el visitante 1 entró');
    expect(await proveedor.estadoSesionDe(PORTERO_1)).toBe('cerrada');
    expect(await proveedor.estadoSesionDe(PORTERO_2)).toBe('abierta');
    await proveedor.cerrarSesionDe(PORTERO_2, 'el visitante 2 entró');
    expect(await proveedor.estadoSesion()).toBe('cerrada');
  });

  it('el puerto SIN dispositivo vale con una sesión y se niega con dos: no se adivina', async () => {
    const proveedor = montar();
    await expect(proveedor.enviarAudio(new Uint8Array([1]))).rejects.toThrow(/ninguna sesión/);
    expect(await proveedor.abrirSesion(PORTERO_1, 'operador-a')).toBe('abierta');
    await expect(proveedor.enviarAudio(new Uint8Array([1]))).resolves.toBeUndefined();
    expect(await proveedor.estadoSesion()).toBe('abierta');
    expect(await proveedor.abrirSesion(PORTERO_2, 'operador-b')).toBe('abierta');
    await expect(proveedor.enviarAudio(new Uint8Array([1]))).rejects.toThrow(
      /2 sesiones de audio abiertas: indique el dispositivo/,
    );
    // Sin dispositivo, colgar cuelga TODAS: colgar de más no filtra audio a nadie.
    await proveedor.cerrarSesion('fin');
    expect(await proveedor.estadoSesionDe(PORTERO_1)).toBe('cerrada');
    expect(await proveedor.estadoSesionDe(PORTERO_2)).toBe('cerrada');
  });

  it('olvidar un equipo (ficha editada) suelta también su sesión, y no la del otro', async () => {
    const proveedor = montar();
    await proveedor.abrirSesion(PORTERO_1, 'operador-a');
    await proveedor.abrirSesion(PORTERO_2, 'operador-b');
    proveedor.olvidar(PORTERO_1);
    expect(await proveedor.estadoSesionDe(PORTERO_1)).toBe('cerrada');
    expect(await proveedor.estadoSesionDe(PORTERO_2)).toBe('abierta');
  });
});
