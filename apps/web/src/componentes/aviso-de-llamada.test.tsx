import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AvisoDeLlamada } from './aviso-de-llamada';
import type { abrirCanal } from '@/lib/sse/canal';
import type { LlamadaEntrante } from '@/lib/sse/llamadas';

const COP = '10000000-0000-4000-8000-000000000001';

const llamada = (extra: Partial<LlamadaEntrante> = {}): LlamadaEntrante => ({
  dispositivoId: 'e0000000-0000-4000-8000-000000000002',
  clase: 'llamada',
  viviendaId: 'v-12',
  vivienda: 'Casa 12',
  origen: 'edificio 1 · unidad 12',
  ocurridoEn: '2026-09-25T10:00:00.000Z',
  referenciaExterna: null,
  ...extra,
});

const montar = () => {
  let entregar: ((l: LlamadaEntrante) => void) | undefined;
  const baja = vi.fn();
  const suscribir = vi.fn(((opciones) => {
    entregar = opciones.mensajes.llamada;
    return baja;
  }) as typeof abrirCanal);
  const alAtender = vi.fn();
  const vista = render(
    <AvisoDeLlamada copropiedadId={COP} alAtender={alAtender} suscribir={suscribir} />,
  );
  return {
    entregar: (l: LlamadaEntrante) => {
      act(() => entregar?.(l));
    },
    alAtender,
    baja,
    vista,
  };
};

describe('AvisoDeLlamada (A4)', () => {
  it('sin llamada no pinta nada; con llamada, un diálogo emergente con la vivienda', () => {
    const { entregar } = montar();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    entregar(llamada());
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/Llamada desde Casa 12/)).toBeTruthy();
  });

  it('«Atender» entrega la llamada a la pantalla y cierra el aviso', () => {
    const { entregar, alAtender } = montar();
    entregar(llamada());
    fireEvent.click(screen.getByRole('button', { name: 'Atender' }));
    expect(alAtender).toHaveBeenCalledWith(expect.objectContaining({ vivienda: 'Casa 12' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('«Ignorar» lo cierra sin entregar nada', () => {
    const { entregar, alAtender } = montar();
    entregar(llamada());
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }));
    expect(alAtender).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('una unidad que el padrón no reconoce se dice, y el timbre se nombra como timbre', () => {
    const { entregar } = montar();
    entregar(llamada({ clase: 'timbre', viviendaId: null, vivienda: '999' }));
    expect(screen.getByText(/Timbre desde 999/)).toBeTruthy();
    expect(screen.getByText(/no reconoce esta unidad/)).toBeTruthy();
  });

  it('al desmontar se da de baja del canal', () => {
    const { baja, vista } = montar();
    vista.unmount();
    expect(baja).toHaveBeenCalledTimes(1);
  });
});
