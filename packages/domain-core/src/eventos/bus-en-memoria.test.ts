import { describe, expect, it, vi } from 'vitest';
import { BusDeEventosEnMemoria } from './bus-en-memoria';
import type { EventoDeDominio } from './evento-de-dominio';

const evento: EventoDeDominio = {
  nombre: 'acceso.denegado',
  ocurridoEn: new Date(0),
  copropiedadId: 'cop-1',
  carga: { motivo: 'LISTA_NEGRA' },
};

describe('BusDeEventosEnMemoria', () => {
  it('entrega a todos los suscriptores del nombre', async () => {
    const bus = new BusDeEventosEnMemoria();
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    bus.suscribir('acceso.denegado', a);
    bus.suscribir('acceso.denegado', b);
    bus.suscribir('otro', vi.fn());
    await bus.publicar(evento);
    expect(a).toHaveBeenCalledWith(evento);
    expect(b).toHaveBeenCalledWith(evento);
  });

  it('un manejador que falla no impide que los demás corran, y se informa', async () => {
    const alFallar = vi.fn();
    const bus = new BusDeEventosEnMemoria(alFallar);
    const sano = vi.fn().mockResolvedValue(undefined);
    bus.suscribir('acceso.denegado', vi.fn().mockRejectedValue(new Error('push caído')));
    bus.suscribir('acceso.denegado', sano);
    await expect(bus.publicar(evento)).resolves.toBeUndefined();
    expect(sano).toHaveBeenCalled();
    expect(alFallar).toHaveBeenCalledTimes(1);
  });

  it('publicar sin suscriptores no falla', async () => {
    await expect(new BusDeEventosEnMemoria().publicar(evento)).resolves.toBeUndefined();
  });
});
