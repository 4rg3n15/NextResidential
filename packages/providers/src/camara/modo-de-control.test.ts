import { describe, expect, it, vi } from 'vitest';
import {
  EquipoDecidePorSuCuenta,
  MODO_EXIGIDO,
  comprobarModoDeControl,
  exigirModoDePlataforma,
  juzgarModo,
  leerCtrlMod,
} from './modo-de-control';
import { equipoSimulado } from '../simulacion/equipo-simulado';

const CREDENCIALES = { usuario: 'servicio', clave: 'secreta-de-prueba' };

const contra = (ctrlMod?: '0' | '1' | '2') => ({
  host: 'camara.invalid',
  ...CREDENCIALES,
  peticion: equipoSimulado({
    familia: 'camara',
    ...CREDENCIALES,
    ...(ctrlMod === undefined ? {} : { ctrlMod }),
  }),
});

describe('leerCtrlMod', () => {
  it('lo lee del XML y del JSON: el firmware no es consistente', () => {
    expect(leerCtrlMod('<EntranceParam><ctrlMod>1</ctrlMod></EntranceParam>')).toBe('1');
    expect(leerCtrlMod('{"EntranceParam":{"ctrlMod":2}}')).toBe('2');
    expect(leerCtrlMod('{"ctrlMod":"0"}')).toBe('0');
  });

  it('si no está, es null y no cero', () => {
    // Cero significaría «la cámara decide», que es una afirmación. No saberlo
    // no es lo mismo que saber lo peor.
    expect(leerCtrlMod('<EntranceParam/>')).toBeNull();
  });
});

describe('juzgarModo · quién manda', () => {
  it('SÓLO `1` es admisible', () => {
    expect(MODO_EXIGIDO).toBe('plataforma');
    expect(juzgarModo('1')).toMatchObject({ admisible: true, modo: 'plataforma' });
  });

  it('`0` NO lo es: el equipo abre por su cuenta', () => {
    const v = juzgarModo('0');
    expect(v.admisible).toBe(false);
    expect(v.modo).toBe('camara');
    expect(v.detalle).toMatch(/ABRE POR SU CUENTA/);
  });

  it('`2` TAMPOCO: no es un término medio', () => {
    // Es la respuesta que parece razonable y no lo es: la cámara sigue
    // decidiendo, y lo que registremos será una segunda opinión.
    const v = juzgarModo('2');
    expect(v.admisible).toBe(false);
    expect(v.modo).toBe('ambos');
    expect(v.detalle).toMatch(/no es un\s+término medio/i);
  });

  it('un valor sin documentar no se da por bueno', () => {
    expect(juzgarModo('7').admisible).toBe(false);
  });

  it('NO saberlo es NO admisible: no se opera sobre una suposición', () => {
    const v = juzgarModo(null);
    expect(v.admisible).toBe(false);
    expect(v.detalle).toMatch(/suposición/);
  });
});

describe('contra un equipo simulado', () => {
  it('con la plataforma al mando, pasa', async () => {
    await expect(comprobarModoDeControl(contra('1'))).resolves.toMatchObject({ admisible: true });
    await expect(exigirModoDePlataforma(contra('1'))).resolves.toMatchObject({
      modo: 'plataforma',
    });
  });

  it('con la cámara al mando, el sistema SE NIEGA A OPERAR', async () => {
    await expect(exigirModoDePlataforma(contra('0'))).rejects.toBeInstanceOf(
      EquipoDecidePorSuCuenta,
    );
  });

  it('con «ambos», también se niega', async () => {
    await expect(exigirModoDePlataforma(contra('2'))).rejects.toBeInstanceOf(
      EquipoDecidePorSuCuenta,
    );
  });

  it('el error dice QUÉ cambiar y dónde, no sólo que algo va mal', async () => {
    await expect(exigirModoDePlataforma(contra('0'))).rejects.toThrow(/configuración del aparato/);
    await expect(exigirModoDePlataforma(contra('0'))).rejects.toThrow(/guía §8\.2/);
  });

  it('un equipo que no soporta la ruta NO se da por bueno', async () => {
    const sinRuta = {
      host: 'camara.invalid',
      ...CREDENCIALES,
      peticion: equipoSimulado({
        familia: 'camara',
        ...CREDENCIALES,
        sinSoporte: ['leer quién controla la barrera: la cámara o la plataforma'],
      }),
    };
    // Contesta 200 con `notSupport`, así que `ctrlMod` no aparece: no se puede
    // afirmar que la plataforma decide.
    await expect(comprobarModoDeControl(sinRuta)).resolves.toMatchObject({ admisible: false });
  });

  it('un equipo APAGADO no es admisible por omisión, y sí cuando se declara', async () => {
    // Las dos políticas sobre el mismo hecho: el arranque del proveedor no
    // opera a ciegas; el alta desde la consola sí guarda un equipo apagado,
    // marcado como no verificado.
    const caido = {
      host: 'camara.invalid',
      ...CREDENCIALES,
      peticion: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    };
    await expect(comprobarModoDeControl(caido)).resolves.toMatchObject({ admisible: false });
    await expect(
      comprobarModoDeControl({ ...caido, inalcanzableEsAdmisible: true }),
    ).resolves.toMatchObject({ admisible: true });
  });
});
