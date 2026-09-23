import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FichaDelEquipo } from '@ncr/contracts';
import { FichaDeEquipo } from './ficha-del-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE ESTA FICHA TIENE QUE CONSEGUIR
 *
 * Que quien la lee sepa **qué cambiar**, y que no confunda «no se pudo
 * comprobar» con «está bien». Lo segundo es el falso verde que este proyecto
 * persigue, aplicado a una pantalla.
 */

const ficha = (hallazgos: FichaDelEquipo['hallazgos']): FichaDelEquipo => ({
  modelo: 'DS-TCG405-E',
  firmware: 'V5.7.3',
  serie: 'SIM0000001',
  horaDelEquipo: '2026-09-23T12:00:00-05:00',
  desvioDeRelojSegundos: 2,
  hallazgos,
  sinComprobar: [],
});

const hallazgo = (
  extra: Partial<FichaDelEquipo['hallazgos'][number]>,
): FichaDelEquipo['hallazgos'][number] => ({
  campo: 'quién decide la apertura',
  estado: 'conforme',
  valorLeido: '1',
  valorCorrecto: '1',
  detalle: 'La plataforma decide',
  correccion: null,
  ...extra,
});

describe('el color no va solo: cada estado lleva su palabra', () => {
  it('lo conforme se dice «Correcto»', () => {
    render(<FichaDeEquipo ficha={ficha([hallazgo({})])} />);
    expect(screen.getByText(/Correcto ·/)).toBeTruthy();
  });

  it('lo que impide operar lo dice con esas palabras, no con un rojo', () => {
    render(<FichaDeEquipo ficha={ficha([hallazgo({ estado: 'bloqueo' })])} />);
    expect(screen.getByText(/Impide operar ·/)).toBeTruthy();
  });

  it('un aviso se distingue de un bloqueo', () => {
    render(<FichaDeEquipo ficha={ficha([hallazgo({ estado: 'aviso' })])} />);
    expect(screen.getByText(/Aviso ·/)).toBeTruthy();
  });

  it('Y LO QUE MÁS IMPORTA · «sin comprobar» NO se pinta como conforme', () => {
    // Pintarlo en verde diría que está comprobado algo que nadie miró.
    render(<FichaDeEquipo ficha={ficha([hallazgo({ estado: 'no_comprobado' })])} />);
    expect(screen.getByText(/Sin comprobar ·/)).toBeTruthy();
    expect(screen.queryByText(/Correcto ·/)).toBeNull();
  });
});

describe('qué se leyó y qué debería decir', () => {
  it('se enseñan los dos, porque uno solo no dice qué cambiar', () => {
    render(
      <FichaDeEquipo
        ficha={ficha([hallazgo({ estado: 'bloqueo', valorLeido: '0', valorCorrecto: '1' })])}
      />,
    );
    expect(screen.getByText(/Leído:/)).toBeTruthy();
    expect(screen.getByText(/Debería ser:/)).toBeTruthy();
  });

  it('y el detalle explica la consecuencia, no sólo el síntoma', () => {
    const texto = 'El motor de reglas quedaría decorativo y el histórico incompleto';
    render(<FichaDeEquipo ficha={ficha([hallazgo({ estado: 'bloqueo', detalle: texto })])} />);
    expect(screen.getByText(texto)).toBeTruthy();
  });
});

describe('el botón de corrección', () => {
  it('sale sólo donde hay una corrección aplicable', () => {
    render(
      <FichaDeEquipo
        ficha={ficha([hallazgo({ estado: 'bloqueo', correccion: 'modo_de_control' })])}
        alCorregir={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /Corregirlo en el equipo/ })).toBeTruthy();
  });

  it('y NO sale donde no la hay', () => {
    render(
      <FichaDeEquipo ficha={ficha([hallazgo({ estado: 'aviso' })])} alCorregir={() => undefined} />,
    );
    expect(screen.queryByRole('button', { name: /Corregirlo/ })).toBeNull();
  });

  it('tampoco sale si nadie puede atender la corrección todavía', () => {
    // En el alta, el equipo aún no está guardado: no hay contra qué
    // identificarlo ni dónde dejar constancia de quién lo corrigió.
    render(
      <FichaDeEquipo
        ficha={ficha([hallazgo({ estado: 'bloqueo', correccion: 'modo_de_control' })])}
      />,
    );
    expect(screen.queryByRole('button', { name: /Corregirlo/ })).toBeNull();
  });

  it('pulsarlo pide ESA corrección, no una genérica', () => {
    const alCorregir = vi.fn();
    render(
      <FichaDeEquipo
        ficha={ficha([hallazgo({ estado: 'aviso', correccion: 'pais_del_algoritmo' })])}
        alCorregir={alCorregir}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Corregirlo en el equipo/ }));
    expect(alCorregir).toHaveBeenCalledWith('pais_del_algoritmo');
  });
});

describe('las consultas que el equipo no contestó', () => {
  it('se ENSEÑAN, con su motivo, en vez de desaparecer', () => {
    render(
      <FichaDeEquipo
        ficha={{
          ...ficha([hallazgo({})]),
          sinComprobar: ['leer la hora del equipo: el equipo no admite esta operación'],
        }}
      />,
    );
    expect(screen.getByText(/1 consulta\(s\) que el equipo no contestó/)).toBeTruthy();
  });
});
