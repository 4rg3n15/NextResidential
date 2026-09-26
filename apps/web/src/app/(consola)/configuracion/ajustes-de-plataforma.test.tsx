import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AjustesDePlataforma,
  ajustesDePlataformaDe,
  cuerpoDePlataforma,
} from './ajustes-de-plataforma';

const borrador = ajustesDePlataformaDe({
  codigoCorto: 'MIRA',
  telefonoPorteria: null,
  topeVehiculosPropios: 2,
});

describe('ajustes de plataforma (D1, D5 a, D7)', () => {
  it('sólo viaja lo que el rol puede cambiar: un administrador no los envía (evita el 422)', () => {
    expect(cuerpoDePlataforma(borrador, () => false)).toEqual({});
    expect(cuerpoDePlataforma(borrador, () => true)).toEqual({
      codigoCorto: 'MIRA',
      telefonoPorteria: '',
      topeVehiculosPropios: 2,
    });
    expect(
      cuerpoDePlataforma({ ...borrador, topeVehiculosPropios: 'dos' }, () => true),
    ).not.toHaveProperty('topeVehiculosPropios');
  });

  it('el administrador los ve deshabilitados, con el motivo; la aprobación dice «Automática»', () => {
    render(
      <AjustesDePlataforma
        borrador={borrador}
        cambiar={() => undefined}
        editable={() => false}
        rechazos={{}}
      />,
    );
    const codigo = screen.getByLabelText(/Código de acceso/) as HTMLInputElement;
    expect(codigo.disabled).toBe(true);
    expect(codigo.value).toBe('MIRA');
    expect(screen.getAllByText('Lo cambia sólo el superadministrador.')).toHaveLength(3);
    expect(screen.getByText('Automática')).toBeTruthy();
  });
});
