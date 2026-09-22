import { describe, expect, it } from 'vitest';
import {
  DeclaracionDeEquiposInvalida,
  LONGITUD_MINIMA_DE_SECRETO,
  buscarEquipoPorSecreto,
  coincideEnTiempoConstante,
  leerEquiposDeclarados,
  normalizarOrigen,
  origenAdmisible,
} from './equipos-de-alarm-server';

/**
 * Los orígenes de estas pruebas son ETIQUETAS, no direcciones, y es deliberado.
 *
 * KPI-11 rompe la construcción si una dirección de equipo aparece fuera de
 * `packages/providers`, y tiene razón en no hacer excepciones: una lista de
 * exentos es donde acaba escondiéndose la dirección de verdad. Lo que estas
 * pruebas ejercitan es la COMPARACIÓN de orígenes, que es de cadenas; usar
 * direcciones verosímiles no añadiría nada y debilitaría el control. La forma
 * real —IPv6 con IPv4 dentro— sí se prueba, con la de bucle local.
 */
const ORIGEN_A = 'origen-declarado-a';
const ORIGEN_B = 'origen-declarado-b';
const ORIGEN_AJENO = 'origen-no-declarado';

const SECRETO = 'a'.repeat(LONGITUD_MINIMA_DE_SECRETO);
const OTRO = 'b'.repeat(LONGITUD_MINIMA_DE_SECRETO);

describe('leerEquiposDeclarados', () => {
  it('sin declaración, NADIE queda acreditado', () => {
    // La dirección segura: un despliegue sin cámaras declaradas rechaza todo.
    expect(leerEquiposDeclarados(undefined)).toEqual([]);
    expect(leerEquiposDeclarados('')).toEqual([]);
    expect(leerEquiposDeclarados('   ')).toEqual([]);
  });

  it('lee varios equipos con varios orígenes cada uno', () => {
    const equipos = leerEquiposDeclarados(
      `cop-1|camara-entrada|${SECRETO}|${ORIGEN_A}, ${ORIGEN_B} ; cop-1|camara-salida|${OTRO}|${ORIGEN_A}`,
    );
    expect(equipos).toHaveLength(2);
    expect(equipos[0]?.dispositivoId).toBe('camara-entrada');
    expect(equipos[0]?.origenesPermitidos).toEqual([ORIGEN_A, ORIGEN_B]);
    expect(equipos[1]?.copropiedadId).toBe('cop-1');
  });

  it('un secreto corto NO arranca, y el motivo dice cuántos caracteres tiene', () => {
    // Un mensaje que solo dijera «inválida» obligaría a adivinar cuál de las
    // cuatro entradas y cuál de los cuatro campos.
    expect(() => leerEquiposDeclarados(`cop-1|cam|corto|${ORIGEN_A}`)).toThrow(
      /entrada 1.*5 caracteres.*32/s,
    );
  });

  it('un equipo SIN origen no se admite: un secreto sin origen es media puerta', () => {
    expect(() => leerEquiposDeclarados(`cop-1|cam|${SECRETO}|`)).toThrow(/sin origen/i);
  });

  it('rechaza una entrada con un número de campos distinto de cuatro', () => {
    expect(() => leerEquiposDeclarados(`cop-1|cam|${SECRETO}`)).toThrow(/4 campos/);
    expect(() => leerEquiposDeclarados(`cop-1|cam|${SECRETO}|${ORIGEN_A}|sobra`)).toThrow(
      /4 campos/,
    );
  });

  it('rechaza dos equipos con el MISMO identificador', () => {
    // Si se admitieran, el segundo sería inalcanzable y sus eventos se
    // atribuirían al primero sin que nadie lo notara.
    expect(() =>
      leerEquiposDeclarados(`cop-1|cam|${SECRETO}|${ORIGEN_A};cop-2|cam|${OTRO}|${ORIGEN_B}`),
    ).toThrow(/repetidos/i);
  });

  it('el error lleva TODOS los motivos, no sólo el primero', () => {
    try {
      leerEquiposDeclarados(`cop-1|cam|corto|;|otra|${OTRO}|${ORIGEN_B}`);
      expect.unreachable('tenía que lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(DeclaracionDeEquiposInvalida);
      expect((error as DeclaracionDeEquiposInvalida).motivos.length).toBeGreaterThan(1);
    }
  });
});

describe('coincideEnTiempoConstante', () => {
  it('acierta lo igual y rechaza lo distinto', () => {
    expect(coincideEnTiempoConstante(SECRETO, SECRETO)).toBe(true);
    expect(coincideEnTiempoConstante(SECRETO, OTRO)).toBe(false);
    expect(coincideEnTiempoConstante(SECRETO, '')).toBe(false);
    expect(coincideEnTiempoConstante('', '')).toBe(true);
  });

  it('un prefijo correcto NO pasa', () => {
    // La forma del ataque que esto cierra: alargar el acierto carácter a
    // carácter midiendo el tiempo de respuesta.
    expect(coincideEnTiempoConstante(SECRETO, SECRETO.slice(0, -1))).toBe(false);
    expect(coincideEnTiempoConstante(SECRETO, `${SECRETO}x`)).toBe(false);
  });
});

describe('origen', () => {
  const equipo = {
    copropiedadId: 'cop-1',
    dispositivoId: 'cam',
    secreto: SECRETO,
    origenesPermitidos: [ORIGEN_A],
  };

  it('normaliza la forma IPv6 con IPv4 dentro que entregan los sockets', () => {
    // Con la de bucle local: es la que un socket entrega de verdad, y la
    // única dirección que no identifica ningún equipo de nadie.
    expect(normalizarOrigen('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizarOrigen('  127.0.0.1 ')).toBe('127.0.0.1');
    expect(normalizarOrigen(undefined)).toBe('');
  });

  it('acepta el origen declarado, y lo compara sin distinguir mayúsculas', () => {
    expect(origenAdmisible(equipo, ORIGEN_A)).toBe(true);
    expect(origenAdmisible(equipo, ORIGEN_A.toUpperCase())).toBe(true);
  });

  it('rechaza cualquier otro, y el origen ausente', () => {
    expect(origenAdmisible(equipo, ORIGEN_AJENO)).toBe(false);
    expect(origenAdmisible(equipo, undefined)).toBe(false);
  });
});

describe('buscarEquipoPorSecreto', () => {
  const equipos = leerEquiposDeclarados(
    `cop-1|cam-a|${SECRETO}|${ORIGEN_A};cop-2|cam-b|${OTRO}|${ORIGEN_B}`,
  );

  it('encuentra el equipo por su secreto', () => {
    expect(buscarEquipoPorSecreto(equipos, OTRO)?.dispositivoId).toBe('cam-b');
  });

  it('devuelve null con un secreto desconocido', () => {
    expect(buscarEquipoPorSecreto(equipos, 'z'.repeat(32))).toBeNull();
  });

  it('sin equipos declarados no acredita a nadie', () => {
    expect(buscarEquipoPorSecreto([], SECRETO)).toBeNull();
  });
});
