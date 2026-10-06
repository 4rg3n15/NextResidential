import { describe, expect, it } from 'vitest';
import {
  INTENTOS_DE_VINCULACION,
  decidirVinculacion,
  explicacionDeVinculacion,
} from './vinculacion';
import type { HechosDeVinculacion, MotivoDeNoVincular } from './vinculacion';

/**
 * RONDA 15-W · D-W9 · la vinculación ya no tiene «primer residente»: una
 * vivienda vacía no la toma quien llega primero (problema 1, CRÍTICO). Una
 * prueba por cada PAREJA de reglas en conflicto: el orden de los `if` es la
 * regla, y cada pareja demuestra cuál de las dos gana.
 */
const hechos = (h: Partial<HechosDeVinculacion> = {}): HechosDeVinculacion => ({
  esTitular: false,
  intentosFallidosRecientes: 0,
  viviendaExiste: true,
  viviendaActiva: true,
  viviendaTieneCuenta: true,
  traeCodigo: true,
  ...h,
});
const no = (motivo: MotivoDeNoVincular) => ({ vincular: false, motivo });

describe('vinculación con la vivienda (D-W9, 3.5)', () => {
  it('vivienda vacía → VIVIENDA_SIN_TITULAR: nadie se hace titular desde la app', () => {
    expect(decidirVinculacion(hechos({ viviendaTieneCuenta: false, traeCodigo: false }))).toEqual(
      no('VIVIENDA_SIN_TITULAR'),
    );
  });
  it('vivienda con cuentas y sin código → CODIGO_REQUERIDO', () => {
    expect(decidirVinculacion(hechos({ traeCodigo: false }))).toEqual(no('CODIGO_REQUERIDO'));
  });
  it('vivienda con cuentas y con código → se valida contra sus plazas libres', () => {
    expect(decidirVinculacion(hechos())).toEqual({ vincular: 'con_codigo' });
  });
  it('los fallos suman: el quinto bloquea, el cuarto todavía no', () => {
    expect(
      decidirVinculacion(hechos({ intentosFallidosRecientes: INTENTOS_DE_VINCULACION })),
    ).toEqual(no('DEMASIADOS_INTENTOS'));
    expect(
      decidirVinculacion(hechos({ intentosFallidosRecientes: INTENTOS_DE_VINCULACION - 1 })),
    ).toEqual({ vincular: 'con_codigo' });
  });

  // ── Parejas en conflicto: gana la de arriba ──────────────────────────────
  it('bloqueo frente a vivienda inexistente: el bloqueo (no se esquiva probando otra)', () => {
    expect(
      decidirVinculacion(
        hechos({ intentosFallidosRecientes: INTENTOS_DE_VINCULACION, viviendaExiste: false }),
      ),
    ).toEqual(no('DEMASIADOS_INTENTOS'));
  });
  it('bloqueo frente a vivienda sin titular: el bloqueo', () => {
    expect(
      decidirVinculacion(
        hechos({ intentosFallidosRecientes: INTENTOS_DE_VINCULACION, viviendaTieneCuenta: false }),
      ),
    ).toEqual(no('DEMASIADOS_INTENTOS'));
  });
  it('inexistente frente a inactiva: inexistente', () => {
    expect(decidirVinculacion(hechos({ viviendaExiste: false, viviendaActiva: false }))).toEqual(
      no('VIVIENDA_INEXISTENTE'),
    );
  });
  it('inactiva frente a sin titular: inactiva', () => {
    expect(
      decidirVinculacion(hechos({ viviendaActiva: false, viviendaTieneCuenta: false })),
    ).toEqual(no('VIVIENDA_INACTIVA'));
  });
  it('sin titular frente a código: sin titular, AUNQUE traiga código', () => {
    expect(decidirVinculacion(hechos({ viviendaTieneCuenta: false }))).toEqual(
      no('VIVIENDA_SIN_TITULAR'),
    );
  });
  it('sin titular frente a sin código: sin titular (lo que falta es la administración)', () => {
    expect(decidirVinculacion(hechos({ viviendaTieneCuenta: false, traeCodigo: false }))).toEqual(
      no('VIVIENDA_SIN_TITULAR'),
    );
  });
  it('el titular no se muda, gane a la regla que gane (P-38: denegar por defecto)', () => {
    expect(decidirVinculacion(hechos({ esTitular: true }))).toEqual(no('TITULAR_NO_SE_MUDA'));
    // Frente a cada una de las demás, una por una: va primero.
    for (const otra of [
      { intentosFallidosRecientes: INTENTOS_DE_VINCULACION },
      { viviendaExiste: false },
      { viviendaActiva: false },
      { viviendaTieneCuenta: false },
      { traeCodigo: false },
    ]) {
      expect(
        decidirVinculacion(hechos({ esTitular: true, ...otra })),
        JSON.stringify(otra),
      ).toEqual(no('TITULAR_NO_SE_MUDA'));
    }
  });
  it('inactiva frente a sin código: inactiva', () => {
    expect(decidirVinculacion(hechos({ viviendaActiva: false, traeCodigo: false }))).toEqual(
      no('VIVIENDA_INACTIVA'),
    );
  });

  it('cada motivo tiene su explicación, sin nombrar a nadie', () => {
    const motivos: MotivoDeNoVincular[] = [
      'DEMASIADOS_INTENTOS',
      'VIVIENDA_INEXISTENTE',
      'AGRUPACION_REQUERIDA',
      'VIVIENDA_INACTIVA',
      'CODIGO_REQUERIDO',
      'CODIGO_INCORRECTO',
      'DOCUMENTO_EN_USO',
      'YA_VINCULADA',
      'VIVIENDA_SIN_TITULAR',
      'TITULAR_NO_SE_MUDA',
    ];
    for (const m of motivos) expect(explicacionDeVinculacion(m).length).toBeGreaterThan(20);
    expect(explicacionDeVinculacion('VIVIENDA_SIN_TITULAR')).toBe(
      'Esta vivienda aún no tiene titular: la administración entrega la primera cuenta.',
    );
  });
});
