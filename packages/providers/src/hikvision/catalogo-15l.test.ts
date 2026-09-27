import { describe, expect, it } from 'vitest';
import { clasificarBloque } from './clasificacion-de-bloque';
import { eventoDeLlamada, eventoPorCodigo, esCodigoDeRostro } from './catalogo-de-eventos';
import { TECHO_DE_CARGA, cargaSaneada } from './carga-saneada';
import type { BloqueDeAlertStream } from './contratos-de-evento';
import { motivoLegible } from '../nucleo/motivo-legible';
import {
  BibliotecaLlena,
  CapacidadNoSoportada,
  CredencialRechazada,
  DesafioVencido,
  EquipoAveriado,
  EquipoOcupado,
  OrdenSinConfirmar,
  PeticionRechazada,
  ReinicioNecesario,
} from '../nucleo/errores';
import { EquipoInalcanzable } from '../equipo/cliente';
import { RutaSinCanal } from '../equipo/catalogo-de-rutas';
import { AperturaNoSoportada } from '../equipo/puerta-remota';
import { RutaNoSoportada } from '../terminal/terminal-facial';
import { EquipoDecidePorSuCuenta } from '../camara/modo-de-control';
import { EquipoNoRegistrado } from './registro-de-equipos';

/**
 * 15-L (Bloque B) · qué es cada bloque, por su código; y lo que se guarda y se
 * enseña de él.
 */
const acceso = (
  campos: NonNullable<BloqueDeAlertStream['AccessControllerEvent']>,
): BloqueDeAlertStream => ({ eventType: 'AccessControllerEvent', AccessControllerEvent: campos });

describe('la clase de un bloque la decide su código, no su nombre', () => {
  it.each([
    [{ majorEventType: 5, subEventType: 25 }, 'equipo', 'puerta_abierta'],
    [{ majorEventType: 5, subEventType: 27 }, 'equipo', 'puerta_forzada'],
    [{ majorEventType: 5, subEventType: 23 }, 'equipo', 'boton_de_salida'],
    [{ majorEventType: 5, subEventType: 37 }, 'timbre', 'timbre'],
    [{ majorEventType: 1, subEventType: 5 }, 'equipo', 'sabotaje'],
    [{ majorEventType: 2, subEventType: 1063 }, 'equipo', 'equipo_fuera_de_linea'],
    [{ majorEventType: 3, subEventType: 1024 }, 'equipo', 'apertura_remota'],
    [{ majorEventType: 5, subEventType: 76 }, 'equipo', 'rostro_no_reconocido'],
    [{ majorEventType: 5, subEventType: 999 }, 'equipo', 'desconocido'],
  ])('%o → %s / %s', (campos, clase, tipo) => {
    const c = clasificarBloque(acceso(campos));
    expect([c.clase, c.tipo]).toEqual([clase, tipo]);
  });

  it('una puerta que se abre NO es un rostro: el motor no la niega', () => {
    // Antes de la 15-L todo `AccessControllerEvent` era un rostro.
    expect(clasificarBloque(acceso({ majorEventType: 5, subEventType: 25 })).clase).toBe('equipo');
  });

  it('rostro reconocido con persona pide decisión; sin persona, no', () => {
    const con = acceso({ majorEventType: 5, subEventType: 75, employeeNoString: 'abc' });
    const sin = acceso({ majorEventType: 5, subEventType: 75 });
    expect(clasificarBloque(con).clase).toBe('rostro');
    expect(clasificarBloque(sin).clase).toBe('equipo');
  });

  it('la pregunta de la terminal siempre es un rostro, con o sin código', () => {
    expect(clasificarBloque(acceso({ remoteCheck: true })).clase).toBe('rostro');
    const capturado = clasificarBloque(
      acceso({ remoteCheck: true, majorEventType: 5, subEventType: 146 }),
    );
    expect(capturado.tipo).toBe('rostro_capturado_para_verificacion');
  });

  it('sin códigos manda la persona (firmwares que no los emiten, S-36)', () => {
    expect(clasificarBloque(acceso({ employeeNo: 12 })).clase).toBe('rostro');
    expect(clasificarBloque(acceso({})).clase).toBe('desconocido');
  });

  it('los códigos pueden llegar como texto', () => {
    const c = clasificarBloque(
      acceso({ majorEventType: '5' as unknown as number, subEventType: '27' as unknown as number }),
    );
    expect(c.tipo).toBe('puerta_forzada');
  });

  it('placa, llamada, timbre y lo que no se sabe leer', () => {
    expect(clasificarBloque({ ANPR: { licensePlate: 'ABC123' } }).clase).toBe('placa');
    expect(clasificarBloque({ VoiceTalkEvent: { cmdType: 'hangUp' } }).tipo).toBe(
      'llamada_colgada',
    );
    expect(clasificarBloque({ eventType: 'doorbell' }).clase).toBe('timbre');
    expect(clasificarBloque({ eventType: 'IO' }).titulo).toBe('Evento del equipo (IO)');
    expect(clasificarBloque({}).titulo).toBe('Evento del equipo sin tipo');
  });
});

describe('el catálogo', () => {
  it('un código sin catalogar se nombra con sus números, en hexadecimal el menor', () => {
    expect(eventoPorCodigo(5, 77).tipo).toBe('rostro_reconocido');
    expect(eventoPorCodigo(5, 999)).toEqual({
      tipo: 'desconocido',
      titulo: 'Evento del equipo (código 5/0x3e7)',
    });
  });

  it('las órdenes de la llamada, y una que nadie documentó', () => {
    expect(eventoDeLlamada('request').tipo).toBe('llamada');
    expect(eventoDeLlamada('BellTimeout').tipo).toBe('llamada_sin_respuesta');
    expect(eventoDeLlamada(undefined).tipo).toBe('llamada');
    expect(eventoDeLlamada('   ').tipo).toBe('llamada');
    expect(eventoDeLlamada('transferir')).toEqual({
      tipo: 'desconocido',
      titulo: 'Llamada del equipo (orden «transferir»)',
    });
  });

  it('sólo el rostro reconocido o capturado pide decisión', () => {
    expect(esCodigoDeRostro(5, 75)).toBe(true);
    expect(esCodigoDeRostro(5, 146)).toBe(true);
    expect(esCodigoDeRostro(5, 76)).toBe(false);
    expect(esCodigoDeRostro(9, 9)).toBe(false);
  });
});

describe('la carga que se guarda, saneada', () => {
  it('sin credenciales ni imágenes, sin caracteres de control, acotada', () => {
    const c = cargaSaneada({
      eventType: 'AccessControllerEvent\u0000',
      password: 'p1',
      Picture: 'AAAA',
      largo: 'x'.repeat(500),
      n: Number.NaN,
      lista: [1, 2, 3],
      profundo: { a: { b: { c: { d: 1 } } } },
      funcion: () => 1,
    });
    expect(c['eventType']).toBe('AccessControllerEvent');
    expect(c['password']).toBe('[retirado]');
    expect(c['Picture']).toBe('[retirado]');
    expect(String(c['largo'])).toHaveLength(200);
    expect(c['n']).toBeNull();
    expect(c['lista']).toEqual([1, 2, 3]);
    expect(JSON.stringify(c['profundo'])).toContain('…');
    expect(c['funcion']).toBeNull();
  });

  it('lo que no es un objeto no se guarda como carga', () => {
    expect(cargaSaneada('texto')).toEqual({});
    expect(cargaSaneada([1, 2])).toEqual({});
    expect(cargaSaneada(null)).toEqual({});
  });

  it('si no cabe, queda lo de primer nivel y la marca de recorte', () => {
    const enorme = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`k${String(i)}`, { v: 'y'.repeat(150) }]),
    );
    const c = cargaSaneada({ eventType: 'X', ...enorme });
    expect(c).toEqual({ recortada: true, eventType: 'X' });
    const soloEscalares = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`k${String(i)}`, 'z'.repeat(150)]),
    );
    expect(cargaSaneada(soloEscalares)).toEqual({ recortada: true });
    expect(JSON.stringify(c).length).toBeLessThanOrEqual(TECHO_DE_CARGA);
  });
});

describe('lo que lee el operador cuando una orden no sale (sin jerga)', () => {
  it.each([
    [new CredencialRechazada('t'), /usuario o la clave/],
    [new DesafioVencido('t'), /identificarse otra vez/],
    [new EquipoOcupado('t', 'x'), /ocupado/],
    [new ReinicioNecesario('t', 'x'), /reiniciarse/],
    [new BibliotecaLlena('t', 10), /llena/],
    [new OrdenSinConfirmar('t', 'x'), /sin confirmar/],
    [new CapacidadNoSoportada('t', 'aperturaRemota', true), /Probar conexión/],
    [new CapacidadNoSoportada('t', 'aperturaRemota', false), /no admite esta orden/],
    [
      new EquipoDecidePorSuCuenta({
        admisible: false,
        modo: 'camara',
        valorLeido: '0',
        detalle: 'x',
      }),
      /decide por su cuenta/,
    ],
    [new RutaSinCanal('abrir', '/r/{canal}'), /número de puerta/],
    [new RutaNoSoportada('abrir', '/r'), /no admite la apertura/],
    [new AperturaNoSoportada('/r'), /no admite la apertura/],
    [new EquipoNoRegistrado('t'), /no está dado de alta/],
    [new EquipoInalcanzable('mudo', 5000), /no respondió/],
    [
      new EquipoAveriado('t', 'x', 'la tarjeta está llena'),
      /rechazó la orden: la tarjeta está llena/,
    ],
    [new PeticionRechazada('t', 'x'), /^el equipo rechazó la orden$/],
    [new Error('otra cosa'), /^el equipo rechazó la orden$/],
  ])('%s', (error, esperado) => {
    const texto = motivoLegible(error);
    expect(texto).toMatch(esperado);
    // Nada de rutas, identificadores ni códigos del fabricante.
    expect(texto).not.toMatch(/ISAPI|\/r\b|0x[0-9a-f]+|statusCode/i);
  });
});
