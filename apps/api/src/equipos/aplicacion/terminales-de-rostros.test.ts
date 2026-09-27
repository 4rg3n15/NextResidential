import { describe, expect, it } from 'vitest';
import type { ContextoTenant } from '../../autenticacion';
import { TerminalesDeRostrosDesdeRegistro } from './terminales-de-rostros';
import type { RepositorioDeEquipos } from './puertos';

/**
 * A3 (15-L) · a quién llega una plantilla y a quién se omite, con su porqué.
 * La pregunta es por CAPACIDAD (ADR-019); el tipo sólo dice quién PODRÍA
 * tener rostros y, por tanto, a quién hay que nombrar si se queda fuera.
 */
const equipo = (
  id: string,
  tipo: string,
  biblioteca: 'si' | 'no' | 'desconocida' | null,
  estado: 'activo' | 'inactivo' = 'activo',
) => ({
  id,
  nombre: `Equipo ${id}`,
  tipo,
  estado,
  capacidades: biblioteca === null ? null : { bibliotecaDeRostros: { estado: biblioteca } },
});

const catalogo = new TerminalesDeRostrosDesdeRegistro({
  listar: async () => [
    equipo('t-si', 'terminal_facial', 'si'),
    equipo('v-si', 'intercom', 'si'),
    equipo('v-no', 'intercom', 'no'),
    equipo('t-duda', 'terminal_facial', 'desconocida'),
    equipo('t-sin-sondear', 'terminal_facial', null),
    equipo('t-baja', 'terminal_facial', 'no', 'inactivo'),
    equipo('camara', 'camara_lpr', 'no'),
  ],
} as unknown as RepositorioDeEquipos);
const ctx = {} as ContextoTenant;

describe('TerminalesDeRostrosDesdeRegistro', () => {
  it('reciben la plantilla los activos que DECLARAN biblioteca, sean terminal o videoportero', async () => {
    expect((await catalogo.conBibliotecaDeRostros(ctx, 'cop')).map((e) => e.dispositivoId)).toEqual(
      ['t-si', 'v-si'],
    );
  });

  it('se nombran, con su porqué, las terminales y videoporteros activos que se quedan fuera', async () => {
    expect(await catalogo.sinBibliotecaDeRostros(ctx, 'cop')).toEqual([
      { dispositivoId: 'v-no', nombre: 'Equipo v-no', motivo: 'no_admite' },
      { dispositivoId: 't-duda', nombre: 'Equipo t-duda', motivo: 'sin_comprobar' },
      { dispositivoId: 't-sin-sondear', nombre: 'Equipo t-sin-sondear', motivo: 'sin_comprobar' },
    ]);
  });
});
