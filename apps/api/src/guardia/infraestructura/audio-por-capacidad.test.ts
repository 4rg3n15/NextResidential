import { describe, expect, it } from 'vitest';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { RegistroEnMemoria, crearProveedorDeEquipos, equipoSimulado } from '@ncr/providers';
import { CanalIntercomEnProceso } from './canal-intercom-en-proceso';
import { CanalIntercomConTransporte } from './canal-intercom-con-transporte';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CORRECCIÓN 15-S1 · A Y B · LA GUARDIA HABLA POR CAPACIDAD, CON LA ATESTACIÓN
 *
 * Contra el proveedor REAL y el equipo simulado, como en sitio:
 *  · H-15S1-C07 · el canal se declara con `enabled=false` (el DS-KD9633-WBE6
 *    real) y aun así es la capacidad: la compuerta es la casilla de la ficha;
 *  · B · la terminal facial con canal 1, G.711 µ-law y `enabled=false` habla
 *    igual que el videoportero, por las rutas de SU familia.
 * Con la casilla, el turno abre el transporte del equipo; sin ella, el turno
 * vale SIN transporte y con el motivo, y no sale ni una petición hacia el canal.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const COP = '10000000-0000-4000-8000-000000000001';
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
const reloj: Reloj = { ahora: () => new Date('2026-10-07T12:00:00Z') };
const silencio: Bitacora = { registrar: () => undefined };
const CANAL_REAL = [{ id: 1, habilitado: false, codec: 'G.711ulaw' }] as const;
const ABRIR = 'abrir el canal de audio bidireccional';
const CONTESTAR = 'contestar o rechazar una llamada del videoportero';

const montar = (
  tipo: 'terminal_facial' | 'intercom',
  atestado: boolean,
  canales: readonly { id: number; habilitado: boolean; codec?: string }[] = CANAL_REAL,
  senalizaLlamadas = false,
) => {
  // Lo que el equipo atiende, por PROPÓSITO del catálogo: sin el protocolo (KPI-11).
  const atendidas: (string | null)[] = [];
  const peticion = equipoSimulado({
    familia: tipo === 'terminal_facial' ? 'terminal' : 'videoportero',
    ...CREDENCIAL,
    canalesDeAudio: canales,
    senalizaLlamadas,
    alAtender: (proposito) => atendidas.push(proposito),
  });
  const proveedor = crearProveedorDeEquipos({
    clase: 'hikvision', // kpi-11-exento · es el nombre del adaptador, no protocolo
    reloj,
    peticion,
    registro: new RegistroEnMemoria([
      {
        dispositivoId: 'equipo-1',
        tipo,
        host: '127.0.0.1',
        puerto: 80,
        protocolo: 'http',
        ...CREDENCIAL,
        canalDeAudioHabilitado: atestado,
      },
    ]),
  });
  const canal = new CanalIntercomConTransporte(
    new CanalIntercomEnProceso(reloj),
    proveedor,
    silencio,
  );
  const aperturas = () => atendidas.filter((p) => p === ABRIR);
  const senales = () => atendidas.filter((p) => p === CONTESTAR);
  /** Peticiones que el catálogo de SU familia no tiene: el equipo contesta 404. */
  const ajenas = () => atendidas.filter((p) => p === null);
  return { canal, aperturas, senales, ajenas };
};

describe('15-S1 · B · la terminal facial habla, por capacidad', () => {
  it('canal 1, G.711 µ-law, enabled=false y la casilla marcada: la guardia abre el transporte', async () => {
    const { canal, aperturas } = montar('terminal_facial', true);
    const estado = await canal.pedir(COP, 'equipo-1', 'op-1');
    expect(estado).toMatchObject({
      estado: 'abierta',
      transporte: 'equipo',
      formatoDeAudio: 'g711u',
    });
    expect(aperturas()).toEqual([ABRIR]);
  });

  it('la misma terminal SIN la casilla: turno sin transporte, con el motivo, y nada hacia el canal', async () => {
    const { canal, aperturas } = montar('terminal_facial', false);
    const estado = await canal.pedir(COP, 'equipo-1', 'op-1');
    expect(estado).toMatchObject({ estado: 'abierta', transporte: 'ninguno' });
    expect(estado.detalleTransporte).toMatch(/deshabilitado para la guardia/);
    expect(estado.detalleTransporte).toMatch(
      /comprobé en sitio que el equipo abre el canal de audio/,
    );
    expect(aperturas()).toEqual([]);
  });

  /**
   * B.4 · la señalización sólo si el equipo la DECLARA y su familia la tiene
   * catalogada. La de la llamada es del videoportero: a una terminal que la
   * declarase no se le manda la ruta del videoportero —nunca por analogía—.
   * Es también lo que distingue en la red que las rutas salen de la familia
   * DEL EQUIPO (B.3): las del audio bidireccional son idénticas en las dos.
   */
  it('la terminal que declara señalización NO recibe la del videoportero: nunca por analogía', async () => {
    const { canal, senales, ajenas } = montar('terminal_facial', true, CANAL_REAL, true);
    expect((await canal.pedir(COP, 'equipo-1', 'op-1')).transporte).toBe('equipo');
    expect(senales()).toEqual([]);
    expect(ajenas()).toEqual([]);
  });

  it('el videoportero que la declara SÍ contesta la llamada al abrir el audio', async () => {
    const { canal, senales } = montar('intercom', true, CANAL_REAL, true);
    expect((await canal.pedir(COP, 'equipo-1', 'op-1')).transporte).toBe('equipo');
    expect(senales()).toEqual([CONTESTAR]);
  });

  it('una terminal que no declara ningún canal: turno sin transporte, «no tiene audio»', async () => {
    const { canal, aperturas } = montar('terminal_facial', true, []);
    const estado = await canal.pedir(COP, 'equipo-1', 'op-1');
    expect(estado).toMatchObject({ estado: 'abierta', transporte: 'ninguno' });
    expect(estado.detalleTransporte).toMatch(/no tiene audio bidireccional/);
    expect(aperturas()).toEqual([]);
  });
});

describe('15-S1 · A · H-15S1-C07 · el videoportero real: enabled=false no es un «no»', () => {
  it('con la casilla marcada, el turno abre el canal 1 del videoportero', async () => {
    const { canal, aperturas } = montar('intercom', true);
    const estado = await canal.pedir(COP, 'equipo-1', 'op-1');
    expect(estado).toMatchObject({
      estado: 'abierta',
      transporte: 'equipo',
      formatoDeAudio: 'g711u',
    });
    expect(aperturas()).toEqual([ABRIR]);
  });

  it('sin la casilla, turno sin transporte y el motivo dice qué marcar', async () => {
    const { canal, aperturas } = montar('intercom', false);
    const estado = await canal.pedir(COP, 'equipo-1', 'op-1');
    expect(estado).toMatchObject({ estado: 'abierta', transporte: 'ninguno' });
    expect(estado.detalleTransporte).toMatch(
      /comprobé en sitio que el equipo abre el canal de audio/,
    );
    expect(aperturas()).toEqual([]);
  });
});
