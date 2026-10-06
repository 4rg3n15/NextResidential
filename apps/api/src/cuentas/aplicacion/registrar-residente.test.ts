import { describe, expect, it } from 'vitest';
import { exito, fallo } from '@ncr/domain-core';
import type { CrearCuentaPorUsuario } from './crear-cuenta';
import type { IgualadorDeTiempo, RepositorioDeCuentas } from './puertos';
import type {
  DatosDelRegistro,
  EscrituraDelVinculo,
  InvitacionesDeResidente,
  RegistroDeInvitaciones,
} from './puertos-del-registro';
import { VERSION_DE_LA_POLITICA_DE_DATOS } from './politica-de-datos';
import { RegistrarResidente, TIEMPO_MINIMO_DE_REGISTRO_FALLIDO_MS } from './registrar-residente';
import type { SolicitudDeRegistro } from './registrar-residente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-W · D2 · EL CASO DE USO DE «CREAR CUENTA», RAMA POR RAMA
 *
 * Sin base y con el reloj fijo: el orden de los pasos ES la regla. La forma y
 * la edad no tocan nada —ni el proveedor ni el código—; todo fallo de código
 * espera el mismo tiempo mínimo; sólo un código evaluado en una copropiedad
 * real cuenta para su suspensión, con la IP para su HMAC; y el vínculo que la
 * base niega no deja cuenta. La cadena real, contra PostgreSQL, la recorren
 * `autorregistro.e2e.test.ts` y, la suspensión, `autorregistro-limites.e2e.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const AHORA = new Date('2026-10-06T15:00:00Z');
const COP = '10000000-0000-4000-8000-0000000000aa';
const ESCRITURA: EscrituraDelVinculo = { escribir: async () => true };

interface Rastro {
  esperas: number[];
  resueltos: [string | null, string, DatosDelRegistro][];
  fallos: [string, string | null][];
  altas: number;
  prefijos: string[];
}

const montar = (
  o: {
    copropiedad?: string | null;
    suspendido?: boolean;
    escritura?: EscrituraDelVinculo | null;
    alta?: Awaited<ReturnType<CrearCuentaPorUsuario['ejecutarConVinculo']>>;
    sinInvitaciones?: boolean;
  } = {},
) => {
  const rastro: Rastro = { esperas: [], resueltos: [], fallos: [], altas: 0, prefijos: [] };
  const invitaciones: InvitacionesDeResidente = {
    suspendido: async () => o.suspendido ?? false,
    resolver: async (cop, codigo, datos) => {
      rastro.resueltos.push([cop, codigo, datos]);
      return cop === null ? null : o.escritura === undefined ? ESCRITURA : o.escritura;
    },
    anotarFallo: async (cop, ip) => {
      rastro.fallos.push([cop, ip]);
    },
  };
  const registro: RegistroDeInvitaciones = {
    inscribir: () => undefined,
    actual: () => (o.sinInvitaciones === true ? null : invitaciones),
  };
  const cuentas = {
    copropiedadPorCodigo: async (prefijo: string) => {
      rastro.prefijos.push(prefijo);
      return o.copropiedad === undefined ? COP : o.copropiedad;
    },
  } as unknown as RepositorioDeCuentas;
  const crear = {
    ejecutarConVinculo: async () => {
      rastro.altas += 1;
      return o.alta ?? exito({ usuarioId: 'nuevo', numeroDePortero: null });
    },
  } as unknown as CrearCuentaPorUsuario;
  const tiempo: IgualadorDeTiempo = {
    ahoraMs: () => 1000,
    esperarHasta: async (inicio, minimo) => {
      rastro.esperas.push(minimo);
      expect(inicio).toBe(1000);
    },
  };
  const caso = new RegistrarResidente(crear, cuentas, registro, tiempo, { ahora: () => AHORA });
  return { caso, rastro };
};

/** Una contraseña de prueba que cumple la política (no es un secreto). */
const CLAVE_DE_PRUEBA = 'Hogar#2026xy';

const solicitud = (s: Partial<SolicitudDeRegistro> = {}): SolicitudDeRegistro => ({
  usuario: 'ana.perez',
  correo: '  Ana.Perez@Correo.Invalid ',
  contrasena: CLAVE_DE_PRUEBA,
  confirmacion: CLAVE_DE_PRUEBA,
  codigoDeInvitacion: 'mira-k7pq-2xwz',
  fechaNacimiento: '1990-05-17',
  versionPolitica: VERSION_DE_LA_POLITICA_DE_DATOS,
  ...s,
});

describe('RegistrarResidente (15-W, D2)', () => {
  it('forma: cada campo con su motivo, sin mirar el código ni la edad', async () => {
    const { caso, rastro } = montar();
    const r = await caso.ejecutar(
      solicitud({
        usuario: 'A',
        contrasena: 'corta',
        confirmacion: 'otra',
        versionPolitica: 'vieja',
        fechaNacimiento: '1990-02-30',
      }),
      '203.0.113.1',
    );
    expect(r.ok).toBe(false);
    if (r.ok || r.error.motivo !== 'CAMPOS') throw new Error(JSON.stringify(r));
    expect(r.error.campos.map((c) => c.campo).sort()).toEqual([
      'confirmacion',
      'contrasena',
      'fechaNacimiento',
      'usuario',
      'versionPolitica',
    ]);
    expect(rastro).toEqual({ esperas: [], resueltos: [], fallos: [], altas: 0, prefijos: [] });
  });

  it('un menor: MENOR_DE_EDAD sin buscar el conjunto —la edad no enumera códigos— ni crear nada', async () => {
    const { caso, rastro } = montar();
    // Cumple 18 MAÑANA en Bogotá: aún es menor.
    const r = await caso.ejecutar(solicitud({ fechaNacimiento: '2008-10-07' }), null);
    expect(r).toEqual({ ok: false, error: { motivo: 'MENOR_DE_EDAD' } });
    expect(rastro.prefijos).toEqual([]);
    expect(rastro.altas).toBe(0);
  });

  it('sin prefijo o con un conjunto que no existe: comparación ficticia, el tiempo mínimo y sin contar', async () => {
    for (const [codigo, copropiedad] of [
      ['K7PQ-2XWZ', COP],
      ['NOHAY-K7PQ-2XWZ', null],
      ['esto no es un código', COP],
    ] as const) {
      const { caso, rastro } = montar({ copropiedad });
      const r = await caso.ejecutar(solicitud({ codigoDeInvitacion: codigo }), '203.0.113.2');
      expect(r, codigo).toEqual({ ok: false, error: { motivo: 'CODIGO' } });
      expect(
        rastro.resueltos.map(([cop]) => cop),
        codigo,
      ).toEqual([null]);
      expect(rastro.esperas, codigo).toEqual([TIEMPO_MINIMO_DE_REGISTRO_FALLIDO_MS]);
      expect(rastro.fallos, codigo).toEqual([]);
    }
  });

  it('suspendido: contesta como un código malo, espera lo mismo y no cuenta (no se evaluó)', async () => {
    const { caso, rastro } = montar({ suspendido: true });
    const r = await caso.ejecutar(solicitud(), '203.0.113.3');
    expect(r).toEqual({ ok: false, error: { motivo: 'CODIGO' } });
    expect(rastro.resueltos).toEqual([]);
    expect(rastro.fallos).toEqual([]);
    expect(rastro.esperas).toEqual([TIEMPO_MINIMO_DE_REGISTRO_FALLIDO_MS]);
  });

  it('un código malo en un conjunto real: cuenta para SU suspensión, con la IP para el HMAC', async () => {
    const { caso, rastro } = montar({ escritura: null });
    const r = await caso.ejecutar(solicitud(), '203.0.113.4');
    expect(r).toEqual({ ok: false, error: { motivo: 'CODIGO' } });
    expect(rastro.prefijos).toEqual(['MIRA']);
    expect(rastro.resueltos.map(([cop, codigo]) => [cop, codigo])).toEqual([[COP, 'K7PQ2XWZ']]);
    expect(rastro.fallos).toEqual([[COP, '203.0.113.4']]);
    expect(rastro.esperas).toEqual([TIEMPO_MINIMO_DE_REGISTRO_FALLIDO_MS]);
  });

  it('un código bueno: la cuenta, con el correo normalizado y sin esperar', async () => {
    const { caso, rastro } = montar();
    const r = await caso.ejecutar(solicitud(), '203.0.113.5');
    expect(r).toEqual({ ok: true, valor: { creada: true } });
    expect(rastro.altas).toBe(1);
    expect(rastro.esperas).toEqual([]);
    expect(rastro.resueltos[0]?.[2]).toEqual({
      fechaNacimiento: '1990-05-17',
      correo: 'ana.perez@correo.invalid',
      versionPolitica: VERSION_DE_LA_POLITICA_DE_DATOS,
    });
  });

  it('lo que dice el alta se traduce: ocupado, plaza tomada, formato y proveedor', async () => {
    const casos = [
      [fallo({ motivo: 'DUPLICADO' as const }), { motivo: 'USUARIO_OCUPADO' }],
      [fallo({ motivo: 'VINCULO' as const }), { motivo: 'CODIGO_EN_USO' }],
      [
        fallo({ motivo: 'FORMATO' as const, detalle: 'usuario raro' }),
        { motivo: 'CAMPOS', campos: [{ campo: 'usuario', motivo: 'usuario raro' }] },
      ],
      [fallo({ motivo: 'PROVEEDOR' as const }), { motivo: 'NO_DISPONIBLE' }],
    ] as const;
    for (const [alta, esperado] of casos) {
      const { caso } = montar({ alta });
      expect(await caso.ejecutar(solicitud(), null)).toEqual({ ok: false, error: esperado });
    }
  });

  it('sin el módulo del residente inscrito, el registro no está disponible: falla cerrado', async () => {
    const { caso, rastro } = montar({ sinInvitaciones: true });
    expect(await caso.ejecutar(solicitud(), null)).toEqual({
      ok: false,
      error: { motivo: 'NO_DISPONIBLE' },
    });
    expect(rastro.altas).toBe(0);
  });
});
