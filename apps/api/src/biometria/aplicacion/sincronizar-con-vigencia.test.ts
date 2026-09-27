import { describe, expect, it } from 'vitest';
import { Vigencia, esExito, esFallo } from '@ncr/domain-core';
import type { FaceTemplateProvider, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { AlmacenEnMemoria, BovedaAesGcm } from '../infraestructura/boveda-cifrada';
import {
  RepositorioConsentimientosEnMemoria,
  RepositorioPlantillasEnMemoria,
} from '../infraestructura/repositorios-en-memoria';
import { VigenciaDesdeAutorizaciones } from '../infraestructura/vigencia-desde-autorizaciones';
import { CapturarRostro, SincronizarPlantilla } from './casos-de-uso';
import type { VigenciaDeAutorizaciones } from './puertos';
import { RespuestaDelTitular } from '../../../test/dobles/respuesta-del-titular';

/**
 * A2 (ETAPA 15-L) · la vigencia de la autorización viaja al equipo con el
 * rostro, para que el equipo lo caduque aunque la supresión no llegue. Y una
 * autorización que no respalda el rostro —inexistente, revocada, vencida—
 * no deja sincronizarlo.
 */
const COP = 'cop-1';
const TITULAR = 'visitante-1';
const HORA = 3_600_000;
const AHORA = new Date('2026-09-27T15:00:00.000Z');

const vigencia = (desdeH: number, hastaH: number): Vigencia => {
  const r = Vigencia.crear(
    new Date(AHORA.getTime() + desdeH * HORA),
    new Date(AHORA.getTime() + hastaH * HORA),
  );
  if (!r.ok) throw new Error(r.error.detalle);
  return r.valor;
};

class TerminalEspia implements FaceTemplateProvider {
  readonly recibidas: { plantillaId: string; vigencia: Vigencia | undefined }[] = [];
  async sincronizar(_d: string, plantillaId: string, _p: Uint8Array, v?: Vigencia) {
    this.recibidas.push({ plantillaId, vigencia: v });
  }
  async suprimir() {
    return undefined;
  }
}

const ctx = {
  usuarioId: 'admin-1',
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: true,
} as ContextoTenant;

const montar = async (
  vigencias: VigenciaDeAutorizaciones | undefined,
  autorizacionId: string | null = 'aut-1',
) => {
  const reloj: Reloj = { ahora: () => AHORA };
  const consentimientos = new RepositorioConsentimientosEnMemoria();
  const plantillas = new RepositorioPlantillasEnMemoria();
  const terminal = new TerminalEspia();
  const boveda = new BovedaAesGcm(
    'llave-de-prueba-de-treinta-y-dos-caracteres',
    'env:BIOMETRIA_LLAVE',
    new AlmacenEnMemoria(),
    terminal,
  );
  let n = 0;
  const capturar = new CapturarRostro(consentimientos, plantillas, boveda, reloj, {
    nuevo: () => `id-${String((n += 1))}`,
  });
  const r = await capturar.ejecutar(ctx, {
    titularId: TITULAR,
    autorizacionId,
    medidas: { rostrosDetectados: 1, nitidez: 0.85, iluminacion: 0.6, proporcionRostro: 0.4 },
    vector: new Uint8Array([1, 2, 3, 4]),
    versionPolitica: 'v1.0',
    canal: 'app',
    suprimirEn: new Date(AHORA.getTime() + 8 * HORA),
  });
  if (!esExito(r) || !r.valor.aceptada) throw new Error('la captura debía aceptarse');
  await new RespuestaDelTitular(consentimientos, plantillas, reloj).ejecutar(ctx, {
    consentimientoId: r.valor.consentimientoId,
    quienResponde: TITULAR,
    acepta: true,
  });
  const sincronizar = new SincronizarPlantilla(
    consentimientos,
    plantillas,
    boveda,
    reloj,
    vigencias,
  );
  const ejecutar = () =>
    sincronizar.ejecutar(ctx, { plantillaId: r.valor.plantillaId, dispositivoId: 'disp-1' });
  return { ejecutar, terminal };
};

const desde = (v: Vigencia | null): VigenciaDeAutorizaciones => ({
  deLaAutorizacion: async () => v,
});

describe('SincronizarPlantilla con la vigencia de la autorización (A2)', () => {
  it('la vigencia de la autorización llega a la terminal con el rostro', async () => {
    const v = vigencia(-1, 3);
    const { ejecutar, terminal } = await montar(desde(v));
    expect(esExito(await ejecutar())).toBe(true);
    expect(terminal.recibidas[0]?.vigencia).toBe(v);
  });

  it('sin quien la consulte, como antes de la 15-L: sin vigencia', async () => {
    const { ejecutar, terminal } = await montar(undefined);
    expect(esExito(await ejecutar())).toBe(true);
    expect(terminal.recibidas[0]?.vigencia).toBeUndefined();
  });

  it('una plantilla sin autorización tampoco lleva vigencia', async () => {
    const { ejecutar, terminal } = await montar(desde(vigencia(-1, 3)), null);
    expect(esExito(await ejecutar())).toBe(true);
    expect(terminal.recibidas[0]?.vigencia).toBeUndefined();
  });

  it('autorización inexistente o revocada: NO se sincroniza', async () => {
    const { ejecutar, terminal } = await montar(desde(null));
    const r = await ejecutar();
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) expect(r.error.detalle).toMatch(/no existe o fue revocada/);
    expect(terminal.recibidas).toEqual([]);
  });

  it('autorización ya vencida: NO se sincroniza', async () => {
    const { ejecutar, terminal } = await montar(desde(vigencia(-5, -1)));
    const r = await ejecutar();
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) expect(r.error.detalle).toMatch(/ya venció/);
    expect(terminal.recibidas).toEqual([]);
  });
});

describe('VigenciaDesdeAutorizaciones', () => {
  const v = vigencia(0, 2);
  const conEstado = (estado: 'vigente' | 'revocada' | null) =>
    new VigenciaDesdeAutorizaciones({
      porId: async () =>
        estado === null
          ? null
          : ({ estado, vigencia: v } as unknown as Awaited<
              ReturnType<ConstructorParameters<typeof VigenciaDesdeAutorizaciones>[0]['porId']>
            >),
    });

  it('vigente → su vigencia; revocada o inexistente → null', async () => {
    expect(await conEstado('vigente').deLaAutorizacion(COP, 'a')).toBe(v);
    expect(await conEstado('revocada').deLaAutorizacion(COP, 'a')).toBeNull();
    expect(await conEstado(null).deLaAutorizacion(COP, 'a')).toBeNull();
  });
});
