import { beforeEach, describe, expect, it } from 'vitest';
import { esExito, esFallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { RepositorioDeEquiposEnMemoria } from '../infraestructura/repositorio-equipos-en-memoria';
import { RepositorioDeAtestacionesEnMemoria } from '../infraestructura/atestaciones';
import { RegistrarAtestacionDelInstalador } from './atestacion-del-instalador';
import type { AltaDeEquipo, ResultadoDeSondeo } from './puertos';

/** D-11 · cada condición que separa una atestación de una casilla marcada. */
const COP = 'cop-1';
const superadmin: ContextoTenant = {
  usuarioId: 'super-1',
  rol: 'superadministrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: true,
};
const ALTA: AltaDeEquipo = {
  nombre: 'Cámara',
  tipo: 'camara_lpr',
  host: 'camara.invalid',
  puerto: 80,
  protocolo: 'http',
  usuario: 'servicio',
  secreto: 'clave-de-prueba',
};
const SONDEO: ResultadoDeSondeo = {
  clase: 'decide_solo',
  detalle: 'decide sola',
  modelo: 'M',
  firmware: 'V5.3.0',
  latenciaMs: 1,
  verificado: false,
};
const ENTRADA = {
  placaEnListaBlanca: 'ABC123',
  placaDesconocida: 'XYZ987',
  evidencia: 'Carril 1: dos pasadas y el brazo no subió en ninguna.',
};

let equipos: RepositorioDeEquiposEnMemoria;
let atestaciones: RepositorioDeAtestacionesEnMemoria;
let avisos: string[];
let caso: RegistrarAtestacionDelInstalador;

beforeEach(() => {
  equipos = new RepositorioDeEquiposEnMemoria();
  atestaciones = new RepositorioDeAtestacionesEnMemoria();
  avisos = [];
  caso = new RegistrarAtestacionDelInstalador(equipos, atestaciones, {
    registrar: (nivel, mensaje) => {
      if (nivel === 'aviso') avisos.push(mensaje);
    },
  });
});

const camara = async (alta: Partial<AltaDeEquipo> = {}, sondeo: Partial<ResultadoDeSondeo> = {}) =>
  (await equipos.crear(superadmin, COP, { ...ALTA, ...alta }, { ...SONDEO, ...sondeo })).id;

const motivo = async (r: ReturnType<RegistrarAtestacionDelInstalador['ejecutar']>) => {
  const resultado = await r;
  return esFallo(resultado) ? resultado.error.detalle : 'aceptada';
};

describe('D-11 · RegistrarAtestacionDelInstalador', () => {
  it('registra con el firmware del equipo, placas normalizadas y evidencia saneada', async () => {
    const id = await camara();
    const r = await caso.ejecutar(superadmin, COP, {
      equipoId: id,
      placaEnListaBlanca: 'abc-123',
      placaDesconocida: 'xyz 987',
      evidencia: `  ${ENTRADA.evidencia}\u0007  `,
    });
    expect(esExito(r)).toBe(true);
    if (esExito(r)) {
      expect(r.valor).toMatchObject({
        firmware: 'V5.3.0',
        placaEnListaBlanca: 'ABC123',
        placaDesconocida: 'XYZ987',
        registradaPor: 'super-1',
      });
      expect(r.valor.evidencia).not.toContain('\u0007');
    }
    expect(avisos.some((a) => /ATESTADA/.test(a))).toBe(true);
    expect((await atestaciones.ultimasPorEquipo(superadmin, COP)).size).toBe(1);
  });

  it('otro rol no atesta, aunque llegue al caso de uso', async () => {
    const id = await camara();
    expect(
      await motivo(
        caso.ejecutar({ ...superadmin, rol: 'administrador' }, COP, { ...ENTRADA, equipoId: id }),
      ),
    ).toMatch(/superadministrador/);
  });

  it('equipo inexistente, no cámara, dado de baja o sin firmware: no', async () => {
    expect(await motivo(caso.ejecutar(superadmin, COP, { ...ENTRADA, equipoId: 'x' }))).toMatch(
      /No se encontró/,
    );
    const terminal = await camara({ tipo: 'terminal_facial' });
    expect(
      await motivo(caso.ejecutar(superadmin, COP, { ...ENTRADA, equipoId: terminal })),
    ).toMatch(/Sólo se atesta una cámara/);
    const baja = await camara();
    await equipos.desactivar(superadmin, COP, baja, 'retirada');
    expect(await motivo(caso.ejecutar(superadmin, COP, { ...ENTRADA, equipoId: baja }))).toMatch(
      /baja/,
    );
    const sinFirmware = await camara({}, { firmware: null });
    expect(
      await motivo(caso.ejecutar(superadmin, COP, { ...ENTRADA, equipoId: sinFirmware })),
    ).toMatch(/firmware/);
  });

  it('placas inválidas o iguales, y evidencia corta: no', async () => {
    const id = await camara();
    const con = (extra: Partial<typeof ENTRADA>) =>
      motivo(caso.ejecutar(superadmin, COP, { ...ENTRADA, ...extra, equipoId: id }));
    expect(await con({ placaEnListaBlanca: '¿?' })).toMatch(/lista blanca/);
    expect(await con({ placaDesconocida: '¿?' })).toMatch(/desconocida/);
    expect(await con({ placaDesconocida: 'ABC-123' })).toMatch(/distintas/);
    expect(await con({ evidencia: 'no abrió' })).toMatch(/Describa/);
    expect((await atestaciones.ultimasPorEquipo(superadmin, COP)).size).toBe(0);
  });
});
