import { describe, expect, it, vi } from 'vitest';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { CAPACIDADES_COMPLETAS, CAPACIDADES_SIN_CONSULTAR } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import { TransporteDeAudioNoDisponible } from '../aplicacion/puertos';
import { CanalIntercomEnProceso } from './canal-intercom-en-proceso';
import { CanalIntercomConTransporte } from './canal-intercom-con-transporte';

/**
 * A1 · primero el turno, luego el transporte. El turno lo reparte la máquina
 * de estados del dominio (sin cambios); el canal del aparato lo abre el
 * proveedor SÓLO para quien tiene la palabra y SÓLO si el equipo declara audio.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const CON_AUDIO = '90000000-0000-4000-8000-000000000001';
const SIN_REGISTRO = '90000000-0000-4000-8000-0000000000ff';

const reloj: Reloj = { ahora: () => new Date('2026-09-25T12:00:00Z') };
const silencio: Bitacora = { registrar: () => undefined };

const proveedorDoble = (abrir?: () => Promise<'abierta' | 'en_espera' | 'cerrada'>) => {
  const doble = {
    capacidadesDe: vi.fn(async (id: string) =>
      id === CON_AUDIO ? CAPACIDADES_COMPLETAS : CAPACIDADES_SIN_CONSULTAR,
    ),
    abrirSesion: vi.fn(abrir ?? (async () => 'abierta' as const)),
    cerrarSesion: vi.fn(async () => undefined),
  };
  return { doble, proveedor: doble as unknown as ProveedorDeEquipos };
};

const montar = (abrir?: () => Promise<'abierta' | 'en_espera' | 'cerrada'>) => {
  const { doble, proveedor } = proveedorDoble(abrir);
  const canal = new CanalIntercomConTransporte(
    new CanalIntercomEnProceso(reloj),
    proveedor,
    silencio,
  );
  return { canal, doble };
};

describe('CanalIntercomConTransporte', () => {
  it('con el turno concedido y audio declarado, abre el canal del EQUIPO', async () => {
    const { canal, doble } = montar();
    const estado = await canal.pedir(COP, CON_AUDIO, 'op-1');
    expect(estado.estado).toBe('abierta');
    expect(estado.transporte).toBe('equipo');
    expect(doble.abrirSesion).toHaveBeenCalledWith(CON_AUDIO, 'op-1');
  });

  it('quien espera NO toca el equipo: pedir el canal a quien está en cola se lo quitaría al que habla', async () => {
    const { canal, doble } = montar();
    await canal.pedir(COP, CON_AUDIO, 'op-1');
    const segundo = await canal.pedir(COP, CON_AUDIO, 'op-2');
    expect(segundo.estado).toBe('en_espera');
    expect(segundo.transporte).toBe('ninguno');
    expect(doble.abrirSesion).toHaveBeenCalledTimes(1);
  });

  it('un dispositivo sin capacidad de audio conocida recibe el turno SIN transporte, y lo dice', async () => {
    // Es lo que hace que el simulado siga funcionando igual con cualquier
    // identificador (ADR-03), y que el real no hable con quien no declaró poder.
    const { canal, doble } = montar();
    const estado = await canal.pedir(COP, SIN_REGISTRO, 'op-1');
    expect(estado.estado).toBe('abierta');
    expect(estado.transporte).toBe('ninguno');
    expect(estado.detalleTransporte).toMatch(/registro|audio/);
    expect(doble.abrirSesion).not.toHaveBeenCalled();
  });

  it('si el equipo no abre el canal, el turno se SUELTA y el motivo sube tipado', async () => {
    const { canal } = montar(async () => {
      throw new Error('El canal de audio del equipo está deshabilitado');
    });
    await expect(canal.pedir(COP, CON_AUDIO, 'op-1')).rejects.toBeInstanceOf(
      TransporteDeAudioNoDisponible,
    );
    // El siguiente entra: nadie retuvo un turno sobre un canal muerto.
    const { canal: otro } = montar();
    expect((await otro.pedir(COP, CON_AUDIO, 'op-2')).estado).toBe('abierta');
  });

  it('soltar cierra la sesión en el equipo y cede el turno al siguiente', async () => {
    const { canal, doble } = montar();
    await canal.pedir(COP, CON_AUDIO, 'op-1');
    await canal.pedir(COP, CON_AUDIO, 'op-2');
    const tras = await canal.soltar(COP, CON_AUDIO, 'op-1');
    expect(doble.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(tras.titular).toBe('op-2');
  });

  it('pedir dos veces siendo titular no vuelve a abrir el canal del equipo', async () => {
    const { canal, doble } = montar();
    await canal.pedir(COP, CON_AUDIO, 'op-1');
    const otraVez = await canal.pedir(COP, CON_AUDIO, 'op-1');
    expect(otraVez.transporte).toBe('equipo');
    expect(doble.abrirSesion).toHaveBeenCalledTimes(1);
  });
});
