import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilaDeMenor } from './fila-de-menor';
import { MENOR_ID } from '../pruebas';

const menor = (edad: number | null, tieneRostro = false) => ({
  residenteId: MENOR_ID,
  nombres: 'Sofía',
  apellidos: 'Pérez',
  nombreCompleto: 'Sofía Pérez',
  fechaNacimiento: '2010-08-21',
  edad,
  tipoDocumento: 'tarjeta_identidad',
  documento: '••••5678',
  parentesco: 'Hija',
  plazaId: null,
  plazaNumero: 3,
  tieneRostro,
});

const montar = (edad: number | null, esTitular: boolean, tieneRostro = false) =>
  render(
    <ul>
      <FilaDeMenor
        menor={menor(edad, tieneRostro)}
        esTitular={esTitular}
        alEditar={() => undefined}
        alDarDeBaja={() => undefined}
        alPedirCodigo={() => undefined}
      />
    </ul>,
  );

describe('el rostro de un menor en «Mi familia» (15-Y3, ADR-039)', () => {
  it('de 15 a 17, el titular ve «Registrar rostro» hacia la pantalla del rostro del menor', () => {
    montar(16, true);
    expect(screen.getByRole('link', { name: 'Registrar rostro' }).getAttribute('href')).toBe(
      `/mi/rostro?menor=${MENOR_ID}`,
    );
  });

  it('con rostro ya registrado, el enlace dice «Ver su rostro»', () => {
    montar(16, true, true);
    expect(screen.getByRole('link', { name: 'Ver su rostro' })).toBeTruthy();
  });

  it('otro adulto lee «Lo registra el titular del hogar.» y no tiene enlace', () => {
    montar(16, false);
    expect(screen.getByText('Lo registra el titular del hogar.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /rostro/ })).toBeNull();
  });

  it('a un menor de 15 no se le ofrece; a los 18 ya no es asunto del hogar', () => {
    const { unmount } = montar(14, true);
    expect(screen.getByText('No se registra el rostro de menores de 15 años.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /rostro/ })).toBeNull();
    unmount();
    montar(18, true);
    expect(screen.queryByText(/rostro/)).toBeNull();
  });
});
