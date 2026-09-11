import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Copropiedad from './copropiedad';

type Modulo = typeof Copropiedad;

/**
 * EL DEFECTO QUE DEJÓ INUTILIZADO AL SUPERADMINISTRADOR, fijado en una prueba.
 *
 * Durante una semana el cliente entró a la consola, verificó su segundo factor,
 * leyó «Superadministrador · Segundo factor verificado» en la cabecera y recibió
 * «Sin permiso» en las ocho pantallas. La causa no era de permisos: la
 * resolución del alcance devolvía `null` para el único rol cuyo alcance es
 * GLOBAL, porque global se representa con `copropiedad_id` nulo.
 *
 * La prueba cubre las dos mitades: que el nulo ya no sea «sin alcance», y que
 * seguir sin alcance cuando de verdad no lo hay.
 */
const sesionActual = vi.fn();
const alcanceDeCopropiedades = vi.fn();
const copropiedadElegida = vi.fn();

vi.mock('@/lib/sesion/servidor', () => ({
  sesionActual: () => sesionActual(),
  alcanceDeCopropiedades: () => alcanceDeCopropiedades(),
}));
vi.mock('@/lib/sesion/cookies', () => ({
  copropiedadElegida: () => copropiedadElegida(),
}));

const COP_A = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';

const sesionDe = (rol: string, copropiedadId: string | null, atendidas: string[] = []) => ({
  usuarioId: 'u-1',
  rol,
  copropiedadId,
  copropiedadesAtendidas: atendidas,
  mfaVerificado: true,
});

const catalogo = (ids: string[], alcanceGlobal: boolean) => ({
  copropiedades: ids.map((id) => ({
    id,
    nombre: `Copropiedad ${id.slice(-1)}`,
    zonaHoraria: 'America/Bogota',
  })),
  alcanceGlobal,
});

let alcanceActivo: Modulo['alcanceActivo'];
let motivoSinCopropiedad: Modulo['motivoSinCopropiedad'];

beforeEach(async () => {
  vi.resetModules();
  copropiedadElegida.mockResolvedValue(null);
  ({ alcanceActivo, motivoSinCopropiedad } = await import('./copropiedad'));
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('alcanceActivo · el superadministrador no tiene copropiedad, tiene TODAS', () => {
  it('con copropiedad_id nulo y catálogo de dos, resuelve una activa y ofrece conmutar', async () => {
    sesionActual.mockResolvedValue(sesionDe('superadministrador', null));
    alcanceDeCopropiedades.mockResolvedValue(catalogo([COP_A, COP_B], true));

    const alcance = await alcanceActivo();
    // Esto es lo que devolvía `null` y rompía las ocho pantallas.
    expect(alcance.copropiedadId).toBe(COP_A);
    expect(alcance.puedeConmutar).toBe(true);
    expect(alcance.alcanceGlobal).toBe(true);
    expect(alcance.disponibles).toHaveLength(2);
  });

  it('respeta la copropiedad elegida cuando está en su alcance', async () => {
    sesionActual.mockResolvedValue(sesionDe('superadministrador', null));
    alcanceDeCopropiedades.mockResolvedValue(catalogo([COP_A, COP_B], true));
    copropiedadElegida.mockResolvedValue(COP_B);

    expect((await alcanceActivo()).copropiedadId).toBe(COP_B);
  });

  it('DESCARTA una cookie con una copropiedad fuera del catálogo', async () => {
    // La cookie es una preferencia, no una credencial. Si concediera alcance,
    // bastaría con editarla para ver otra copropiedad.
    sesionActual.mockResolvedValue(sesionDe('superadministrador', null));
    alcanceDeCopropiedades.mockResolvedValue(catalogo([COP_A], true));
    copropiedadElegida.mockResolvedValue(COP_B);

    const alcance = await alcanceActivo();
    expect(alcance.copropiedadId).toBe(COP_A);
    expect(alcance.disponibles.map((c) => c.id)).toEqual([COP_A]);
  });
});

describe('alcanceActivo · los demás roles', () => {
  it('el administrador usa la del TOKEN y no consulta preferencia alguna', async () => {
    sesionActual.mockResolvedValue(sesionDe('administrador', COP_A));
    alcanceDeCopropiedades.mockResolvedValue(catalogo([COP_A], false));
    copropiedadElegida.mockResolvedValue(COP_B);

    const alcance = await alcanceActivo();
    // Con una sola copropiedad no hay nada que elegir, y la cookie no manda.
    expect(alcance.copropiedadId).toBe(COP_A);
    expect(alcance.puedeConmutar).toBe(false);
  });

  it('el operador de central elige entre las de su turno', async () => {
    sesionActual.mockResolvedValue(sesionDe('operador_central', null, [COP_A, COP_B]));
    alcanceDeCopropiedades.mockResolvedValue(catalogo([COP_A, COP_B], false));

    const alcance = await alcanceActivo();
    expect(alcance.copropiedadId).toBe(COP_A);
    expect(alcance.puedeConmutar).toBe(true);
    expect(alcance.alcanceGlobal).toBe(false);
  });

  it('sin sesión, sin alcance', async () => {
    sesionActual.mockResolvedValue(null);
    expect((await alcanceActivo()).copropiedadId).toBeNull();
  });

  it('con la API caída, sin alcance y sin inventarse ninguno', async () => {
    sesionActual.mockResolvedValue(sesionDe('superadministrador', null));
    alcanceDeCopropiedades.mockResolvedValue(null);
    expect((await alcanceActivo()).copropiedadId).toBeNull();
  });
});

describe('motivoSinCopropiedad · el mensaje describe la causa real', () => {
  it('al superadministrador NO le dice que no tiene copropiedad asignada', async () => {
    // El mensaje anterior mandaba al cliente a revisar `roles_usuario`, que
    // estaba bien. Una semana buscando lo que no estaba roto.
    const texto = motivoSinCopropiedad({
      copropiedadId: null,
      disponibles: [],
      puedeConmutar: false,
      alcanceGlobal: true,
    });
    expect(texto).not.toContain('no tiene ninguna copropiedad asignada');
    expect(texto).toContain('alcance es global');
  });

  it('a quien de verdad no tiene ninguna, sí', async () => {
    const texto = motivoSinCopropiedad({
      copropiedadId: null,
      disponibles: [],
      puedeConmutar: false,
      alcanceGlobal: false,
    });
    expect(texto).toContain('no tiene ninguna copropiedad asignada');
  });
});
