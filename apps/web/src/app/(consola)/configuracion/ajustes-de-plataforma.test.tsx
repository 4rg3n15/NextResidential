import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AjustesDePlataforma,
  ajustesDePlataformaDe,
  cuerpoDePlataforma,
  listaDeIps,
} from './ajustes-de-plataforma';

const borrador = ajustesDePlataformaDe({
  codigoCorto: 'MIRA',
  telefonoPorteria: null,
  topeVehiculosPropios: 2,
  ipsPorteria: ['192.0.2.10'],
  ipsGuardiaRemota: [],
});

describe('ajustes de plataforma (D1, D5 a, D7)', () => {
  it('sólo viaja lo que el rol puede cambiar: un administrador no los envía (evita el 422)', () => {
    expect(cuerpoDePlataforma(borrador, () => false)).toEqual({});
    expect(cuerpoDePlataforma(borrador, () => true)).toEqual({
      codigoCorto: 'MIRA',
      telefonoPorteria: '',
      topeVehiculosPropios: 2,
      ipsPorteria: ['192.0.2.10'],
      ipsGuardiaRemota: [],
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
    expect(screen.getAllByText('Lo cambia sólo el superadministrador.')).toHaveLength(5);
    expect(
      (
        screen.getByLabelText(
          'IPs permitidas para conexión remota de porteros',
        ) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText('Automática')).toBeTruthy();
  });

  it('H4 · las IP se escriben una por línea (o con comas) y viajan como lista; vacía, lista vacía', () => {
    expect(listaDeIps('198.51.100.0/28\n 2001:db8::1 , 192.0.2.7;\n\n')).toEqual([
      '198.51.100.0/28',
      '2001:db8::1',
      '192.0.2.7',
    ]);
    expect(listaDeIps('   ')).toEqual([]);
    const editable = (c: string): boolean => c === 'ipsGuardiaRemota';
    expect(
      cuerpoDePlataforma({ ...borrador, ipsGuardiaRemota: '203.0.113.0/24' }, editable),
    ).toEqual({ ipsGuardiaRemota: ['203.0.113.0/24'] });
  });
});
