import { describe, expect, it } from 'vitest';
import type { Reloj } from '@ncr/domain-core';
import {
  CLASES_DE_PROVEEDOR,
  ConfiguracionDeProveedorIncompleta,
  claseDeProveedorDe,
  crearProveedorDeEquipos,
} from './fabrica';
import type { ClaseDeProveedor } from './fabrica';
import { MockProvider } from './mock/mock-provider';
import { HikvisionProvider } from './hikvision/hikvision-provider';
import { RegistroEnMemoria } from './hikvision/registro-de-equipos';
import type { EquipoRegistrado } from './hikvision/registro-de-equipos';
import { PERFIL_IDEAL } from './mock/simulacion';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PUNTO DE COMPOSICIÓN (ADR-018) · aquí ADR-003 se demuestra o no
 *
 * Lo que se fija aquí no es que la fábrica devuelva un objeto: es **qué hace
 * cuando la configuración no es la esperada**, porque las dos salidas cómodas
 * son las peligrosas. Caer al simulado deja un despliegue que cree hablar con
 * las cámaras y no habla con ninguna; caer al hardware pone en modo equipo una
 * instalación que nadie configuró.
 */

const RELOJ: Reloj = { ahora: () => new Date('2026-09-23T12:00:00.000Z') };

const EQUIPO: EquipoRegistrado = {
  dispositivoId: 'disp-1',
  tipo: 'camara_lpr',
  // RFC 5737 · rango de DOCUMENTACIÓN: no es la dirección de nadie.
  host: '203.0.113.50',
  puerto: 80,
  protocolo: 'http',
  usuario: 'servicio',
  clave: 'clave-de-prueba',
};

describe('qué construye cada clase', () => {
  it('`simulado` construye el adaptador simulado', () => {
    const proveedor = crearProveedorDeEquipos({ clase: 'simulado', reloj: RELOJ });
    expect(proveedor).toBeInstanceOf(MockProvider);
  });

  it('y admite perfil, semilla y dispositivos, porque la adversidad se reproduce', () => {
    const proveedor = crearProveedorDeEquipos({
      clase: 'simulado',
      reloj: RELOJ,
      perfil: PERFIL_IDEAL,
      semilla: 1234,
      dispositivosSimulados: ['disp-1'],
    });
    expect(proveedor).toBeInstanceOf(MockProvider);
  });

  it('`hikvision` con registro construye el adaptador real', () => {
    const proveedor = crearProveedorDeEquipos({
      clase: 'hikvision',
      reloj: RELOJ,
      registro: new RegistroEnMemoria([EQUIPO]),
    });
    expect(proveedor).toBeInstanceOf(HikvisionProvider);
  });

  it('y acepta la lista de equipos como atajo, sin pedir un registro montado', () => {
    const proveedor = crearProveedorDeEquipos({
      clase: 'hikvision',
      reloj: RELOJ,
      equipos: [EQUIPO],
      peticion: (() => Promise.reject(new Error('no se usa'))) as typeof fetch,
      exigirVeredictoDeControl: false,
    });
    expect(proveedor).toBeInstanceOf(HikvisionProvider);
  });
});

describe('las dos salidas cómodas, y por qué ninguna se toma', () => {
  it('pedir el adaptador real SIN registro lanza, y NO cae al simulado', () => {
    // Caer al simulado dejaría un despliegue que cree hablar con las cámaras y
    // no habla con ninguna, informando de aperturas que nunca ocurrieron.
    expect(() => crearProveedorDeEquipos({ clase: 'hikvision', reloj: RELOJ })).toThrow(
      ConfiguracionDeProveedorIncompleta,
    );
  });

  it('una clase que no es ninguna de las dos LANZA, y no cae al hardware', () => {
    // La primera versión preguntaba `=== 'simulado'` y cualquier otra cosa era
    // hardware, `undefined` incluido: la suite entera acabó pidiendo equipos
    // que nadie había pedido.
    expect(() =>
      crearProveedorDeEquipos({ clase: 'otra-cosa' as ClaseDeProveedor, reloj: RELOJ }),
    ).toThrow(ConfiguracionDeProveedorIncompleta);
  });

  it('y `undefined` tampoco: es el caso que lo destapó', () => {
    expect(() =>
      crearProveedorDeEquipos({ clase: undefined as unknown as ClaseDeProveedor, reloj: RELOJ }),
    ).toThrow(ConfiguracionDeProveedorIncompleta);
  });
});

describe('leer la clase de un valor de entorno', () => {
  it('sin valor, el conservador: el simulado', () => {
    // ADR-003 exige que todo el sistema funcione completo contra él, y un
    // despliegue en modo hardware por descuido es peor que uno en simulado.
    expect(claseDeProveedorDe(undefined)).toBe('simulado');
    expect(claseDeProveedorDe('   ')).toBe('simulado');
  });

  it('reconoce las dos clases, sin distinguir mayúsculas', () => {
    for (const clase of CLASES_DE_PROVEEDOR) {
      expect(claseDeProveedorDe(clase.toUpperCase())).toBe(clase);
    }
  });

  it('y una desconocida lanza nombrando las válidas', () => {
    expect(() => claseDeProveedorDe('axis')).toThrow(/simulado, hikvision/);
  });
});
