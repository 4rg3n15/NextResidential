import { describe, expect, it } from 'vitest';
import { HikvisionProvider } from './hikvision-provider';
import { RegistroEnMemoria } from './registro-de-equipos';
import type { EquipoRegistrado } from './registro-de-equipos';
import { equiposSimulados } from '../simulacion/equipo-simulado';
import { aperturasFisicasPor } from '../simulacion/comportamientos-de-sitio';

/**
 * C1 (ETAPA 15-L) · editar un equipo en la consola llega al equipo sin
 * reiniciar la API. El proveedor guarda un cliente por equipo con la dirección
 * y la credencial con que se creó; `olvidar` es lo que hace que la siguiente
 * orden salga con lo guardado ahora.
 */
const VIDEOPORTERO = '90000000-0000-4000-8000-0000000000c1';
const ANTES = '203.0.113.61';
const DESPUES = '203.0.113.62';
const CLAVE = 'clave-de-prueba';

const registrado = (host: string): EquipoRegistrado => ({
  dispositivoId: VIDEOPORTERO,
  tipo: 'intercom',
  host,
  puerto: 80,
  protocolo: 'http',
  usuario: 'servicio',
  clave: CLAVE,
  numeroDePuerta: 1,
});

const montar = () => {
  const registro = new RegistroEnMemoria([registrado(ANTES)]);
  const guion = { familia: 'videoportero' as const, usuario: 'servicio', clave: CLAVE };
  const proveedor = new HikvisionProvider({
    registro,
    reloj: { ahora: () => new Date('2026-09-27T15:00:00Z') },
    peticion: equiposSimulados({ [ANTES]: guion, [DESPUES]: guion }),
  });
  return { registro, proveedor };
};

describe('C1 · lo recordado de un equipo se olvida tras editarlo', () => {
  it('sin olvidar, la orden sigue yendo a la dirección VIEJA (el defecto)', async () => {
    const { registro, proveedor } = montar();
    await proveedor.abrir(VIDEOPORTERO, 'op');
    registro.registrar(registrado(DESPUES));
    const antes = aperturasFisicasPor.get(ANTES) ?? 0;
    await proveedor.abrir(VIDEOPORTERO, 'op');
    expect(aperturasFisicasPor.get(ANTES)).toBe(antes + 1);
  });

  it('tras olvidar, la siguiente orden sale hacia la dirección NUEVA', async () => {
    const { registro, proveedor } = montar();
    await proveedor.abrir(VIDEOPORTERO, 'op');
    registro.registrar(registrado(DESPUES));
    proveedor.olvidar(VIDEOPORTERO);
    const antes = aperturasFisicasPor.get(DESPUES) ?? 0;
    await proveedor.abrir(VIDEOPORTERO, 'op');
    expect(aperturasFisicasPor.get(DESPUES)).toBe(antes + 1);
  });

  it('olvidar un equipo que no se conoce no falla', () => {
    expect(() => montar().proveedor.olvidar('otro')).not.toThrow();
  });
});
