import { describe, expect, it } from 'vitest';
import type { EquipoDeclarado } from '../../comun/equipos-de-alarm-server';
import { CopropiedadDelEquipoPorRegistro, sinRegistroDeEquipos } from './copropiedad-del-equipo';

/**
 * R1 (15-L) · la terminal dada de alta en la consola NO está en
 * `ALARM_SERVER_EQUIPOS`, y su evento tiene que entrar igual.
 */
const COP_A = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';
const TERMINAL = '90000000-0000-4000-8000-000000000002';
const CAMARA = '90000000-0000-4000-8000-000000000001';

const declarada = (dispositivoId: string, copropiedadId: string): EquipoDeclarado => ({
  dispositivoId,
  copropiedadId,
  secreto: 'x'.repeat(32),
  origenesPermitidos: ['127.0.0.1'],
});

const registro = (tabla: Record<string, string>) => ({
  copropiedadDe: async (id: string) => tabla[id] ?? null,
});

describe('R1 · la copropiedad de un equipo sale del registro de la consola', () => {
  it('una terminal SÓLO en el registro (el caso de sitio) tiene copropiedad', async () => {
    const r = new CopropiedadDelEquipoPorRegistro(registro({ [TERMINAL]: COP_A }), []);
    expect(await r.resolver(TERMINAL)).toEqual({ copropiedadId: COP_A, fuente: 'registro' });
  });

  it('una cámara sólo declarada en el Alarm Server la conserva (respaldo)', async () => {
    const r = new CopropiedadDelEquipoPorRegistro(sinRegistroDeEquipos, [declarada(CAMARA, COP_A)]);
    expect(await r.resolver(CAMARA)).toEqual({ copropiedadId: COP_A, fuente: 'declaracion' });
  });

  it('si el registro y la declaración discrepan, no se adivina: sin copropiedad', async () => {
    const r = new CopropiedadDelEquipoPorRegistro(registro({ [CAMARA]: COP_B }), [
      declarada(CAMARA, COP_A),
    ]);
    const resuelta = await r.resolver(CAMARA);
    expect(resuelta.copropiedadId).toBeNull();
    expect(resuelta).toMatchObject({ motivo: expect.stringMatching(/distintas/) });
  });

  it('un equipo que no está en ninguno de los dos se descarta con su motivo', async () => {
    const r = new CopropiedadDelEquipoPorRegistro(sinRegistroDeEquipos, []);
    expect(await r.resolver(TERMINAL)).toMatchObject({
      copropiedadId: null,
      motivo: expect.stringMatching(/no está activo en la consola/),
    });
  });

  it('si el registro no se puede leer, manda la declaración; sin ella, se dice por qué', async () => {
    const roto = {
      copropiedadDe: async (): Promise<string | null> => {
        throw new Error('base caída');
      },
    };
    const conDeclaracion = new CopropiedadDelEquipoPorRegistro(roto, [declarada(CAMARA, COP_A)]);
    expect((await conDeclaracion.resolver(CAMARA)).copropiedadId).toBe(COP_A);
    const sin = new CopropiedadDelEquipoPorRegistro(roto, []);
    expect(await sin.resolver(TERMINAL)).toMatchObject({
      copropiedadId: null,
      motivo: expect.stringMatching(/base caída/),
    });
  });
});
