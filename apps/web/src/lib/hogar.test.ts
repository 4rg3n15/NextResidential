import { describe, expect, it } from 'vitest';
import {
  alTope,
  cupoDePlazas,
  detalleDeMenor,
  placaSinSeparadores,
  puedeAnadirPlaza,
  sePuedeRetirar,
  sePuedeRevocar,
  textoDeEliminacion,
  textoDeRevocacion,
  yaEsMayor,
} from './hogar';
import { MENSAJE_MAYOR_SIN_CUENTA, motivoDeFechaDeMenor } from './registro/edad';

const plaza = (numero: number, libre: boolean) => ({
  id: `p${String(numero)}`,
  numero,
  libre,
  codigo: libre ? 'MIRA-AAAA-BBBB' : null,
  ocupante: libre ? null : 'Alguien',
  sinCuenta: false,
});

describe('las plazas del hogar, como en la app', () => {
  const dos = { plazas: [plaza(1, false), plaza(2, true)], tope: 3, esTitular: true };

  it('cuenta el cupo y sabe cuándo está al tope', () => {
    expect(cupoDePlazas(dos)).toBe('2 de 3');
    expect(alTope(dos)).toBe(false);
    expect(alTope({ ...dos, tope: 2 })).toBe(true);
    expect(puedeAnadirPlaza(dos)).toBe(true);
    expect(puedeAnadirPlaza({ ...dos, tope: 2 })).toBe(false);
    expect(puedeAnadirPlaza({ ...dos, esTitular: false })).toBe(false);
  });

  it('sólo el titular retira, sólo las libres y nunca la plaza 1', () => {
    expect(sePuedeRetirar(dos, plaza(2, true))).toBe(true);
    expect(sePuedeRetirar(dos, plaza(2, false))).toBe(false);
    expect(sePuedeRetirar(dos, plaza(1, true))).toBe(false);
    expect(sePuedeRetirar({ esTitular: false }, plaza(2, true))).toBe(false);
  });
});

describe('los menores del hogar', () => {
  const menor = {
    residenteId: 'r1',
    nombres: 'Sofía',
    apellidos: 'Pérez',
    nombreCompleto: 'Sofía Pérez',
    fechaNacimiento: '2015-08-21',
    edad: 11,
    tipoDocumento: 'tarjeta_identidad',
    documento: '••••5678',
    parentesco: 'Hija',
    plazaId: 'p2',
    plazaNumero: 2,
    tieneRostro: false,
  };

  it('arma la línea de detalle y reconoce a quien ya cumplió 18', () => {
    expect(detalleDeMenor(menor)).toBe('Hija · 11 años · Tarjeta de identidad ••••5678 · plaza 2');
    expect(detalleDeMenor({ ...menor, parentesco: null, edad: null, plazaNumero: null })).toBe(
      'Tarjeta de identidad ••••5678',
    );
    expect(yaEsMayor(menor)).toBe(false);
    expect(yaEsMayor({ edad: 18 })).toBe(true);
    expect(yaEsMayor({ edad: null })).toBe(false);
  });

  it('la fecha del menor: existe, no es futura y no es de un adulto', () => {
    const ahora = new Date('2026-10-14T12:00:00Z');
    expect(motivoDeFechaDeMenor('', ahora)).toBe('Escriba la fecha de nacimiento');
    expect(motivoDeFechaDeMenor('2015-02-30', ahora)).toBe('Escriba la fecha como AAAA-MM-DD');
    expect(motivoDeFechaDeMenor('2026-10-20', ahora)).toBe('Esa fecha todavía no llegó');
    expect(motivoDeFechaDeMenor('2008-10-13', ahora)).toBe(MENSAJE_MAYOR_SIN_CUENTA);
    // Cumple 18 mañana: con el margen a favor del menor, todavía se registra.
    expect(motivoDeFechaDeMenor('2008-10-15', ahora)).toBeNull();
    expect(motivoDeFechaDeMenor('2015-08-21', ahora)).toBeNull();
    // Nacido hoy: es un menor, aunque el reloj vaya un día adelantado.
    expect(motivoDeFechaDeMenor('2026-10-14', ahora)).toBeNull();
  });
});

describe('visitas y vehículos propios', () => {
  it('se revoca lo vigente y lo programado, no lo vencido ni lo rechazado', () => {
    expect(sePuedeRevocar({ situacion: 'vigente' })).toBe(true);
    expect(sePuedeRevocar({ situacion: 'programada' })).toBe(true);
    expect(sePuedeRevocar({ situacion: 'vencida' })).toBe(false);
    expect(sePuedeRevocar({ situacion: 'rechazada' })).toBe(false);
  });

  it('el texto de la revocación cuenta los equipos como la app', () => {
    expect(textoDeRevocacion({ equiposRetirados: 0, equiposPendientes: 0 })).toBe(
      'Visita revocada.',
    );
    expect(textoDeRevocacion({ equiposRetirados: 2, equiposPendientes: 1 })).toBe(
      'Visita revocada. Su foto salió de 2 equipo(s); 1 más la retirará en cuanto responda.',
    );
  });

  it('el texto de la eliminación distingue borrado de baja, y la placa se compara sin separadores', () => {
    expect(textoDeEliminacion('borrado', 'ABC123')).toBe('Vehículo ABC123 eliminado.');
    expect(textoDeEliminacion('dado_de_baja', 'ABC123')).toMatch(/historial se conserva/);
    expect(placaSinSeparadores(' abc-123 ')).toBe('ABC123');
  });
});
