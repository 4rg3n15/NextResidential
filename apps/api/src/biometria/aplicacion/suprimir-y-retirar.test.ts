import { describe, expect, it } from 'vitest';
import { CalidadDeCaptura, PlantillaBiometrica, esExito } from '@ncr/domain-core';
import type { Bitacora, FaceTemplateProvider } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { AlmacenEnMemoria, BovedaAesGcm } from '../infraestructura/boveda-cifrada';
import { RepositorioPlantillasEnMemoria } from '../infraestructura/repositorios-en-memoria';
import { SuprimirYRetirarYa } from './suprimir-y-retirar';

/**
 * 15-X · el rostro que se reemplaza, el que se retira y el del menor dado de
 * baja salen de las terminales EN EL ACTO. Hasta aquí la baja del menor (15-W
 * D4) suprimía en la base y dejaba la retirada al barrido de 6 h: seis horas en
 * que la terminal seguía reconociendo a quien ya no vive allí.
 */
const COP = 'cop-1';
const AHORA = new Date('2026-10-08T12:00:00Z');
const LLAVE = 'llave-de-prueba-de-treinta-y-dos-caracteres';
const ctx: ContextoTenant = {
  usuarioId: 'cuenta-1',
  rol: 'residente',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: false,
};

class TerminalEspia implements FaceTemplateProvider {
  readonly retiradas: string[] = [];
  caidas = new Set<string>();
  async sincronizar() {}
  async suprimir(dispositivoId: string, plantillaId: string) {
    if (this.caidas.has(dispositivoId)) throw new Error('terminal fuera de línea');
    this.retiradas.push(`${dispositivoId}/${plantillaId}`);
  }
}

const montar = () => {
  const plantillas = new RepositorioPlantillasEnMemoria();
  const almacen = new AlmacenEnMemoria();
  const terminal = new TerminalEspia();
  const boveda = new BovedaAesGcm(LLAVE, 'env:prueba', almacen, terminal);
  const avisos: string[] = [];
  const bitacora: Bitacora = { registrar: (_n, m) => void avisos.push(m) };
  const caso = new SuprimirYRetirarYa(plantillas, boveda, { ahora: () => AHORA }, bitacora);
  return { plantillas, almacen, terminal, caso, avisos };
};

const sincronizada = (
  m: ReturnType<typeof montar>,
  id: string,
  titularId: string,
  equipos: readonly string[],
) => {
  const calidad = CalidadDeCaptura.crear(0.9);
  if (!esExito(calidad)) throw new Error('calidad');
  const creada = PlantillaBiometrica.crear({
    id,
    copropiedadId: COP,
    titularId,
    consentimientoId: 'c-1',
    autorizacionId: null,
    calidad: calidad.valor,
    creadoEn: new Date('2026-10-01T12:00:00Z'),
    suprimirEn: new Date('2027-10-01T12:00:00Z'),
    sincronizadaEn: new Date('2026-10-01T12:05:00Z'),
    suprimidaEn: null,
    estado: 'activa',
  });
  if (!esExito(creada)) throw new Error('plantilla');
  m.plantillas.declarar(creada.valor);
  m.plantillas.sincronizaciones.set(id, new Set(equipos));
};

describe('15-X · SuprimirYRetirarYa', () => {
  it('las plantillas que se le dan: suprimidas y fuera de cada equipo, ahora', async () => {
    const m = montar();
    sincronizada(m, 'pl-1', 'p-1', ['t-1', 't-2']);
    sincronizada(m, 'pl-2', 'p-1', ['t-1']);
    const r = await m.caso.plantillas(ctx, COP, ['pl-1']);
    expect(r).toEqual({ suprimidas: 1, retiradas: 2, retiradasPendientes: 0 });
    expect(m.terminal.retiradas.sort()).toEqual(['t-1/pl-1', 't-2/pl-1']);
    expect((await m.plantillas.porId(COP, 'pl-1'))?.estado).toBe('suprimida');
    // La otra no se toca: sólo las que se nombran.
    expect((await m.plantillas.porId(COP, 'pl-2'))?.estado).toBe('activa');
  });

  it('las de un titular (la baja de un menor): todas, y fuera de los equipos', async () => {
    const m = montar();
    sincronizada(m, 'pl-1', 'menor-1', ['t-1']);
    sincronizada(m, 'pl-2', 'otro', ['t-1']);
    const r = await m.caso.deTitular(ctx, COP, 'menor-1');
    expect(r).toEqual({ suprimidas: 1, retiradas: 1, retiradasPendientes: 0 });
    expect(m.terminal.retiradas).toEqual(['t-1/pl-1']);
    expect(await m.plantillas.porRetirar(COP)).toEqual([]);
  });

  it('un equipo caído no se da por retirado: queda en la cola de CA-10 y se avisa', async () => {
    const m = montar();
    sincronizada(m, 'pl-1', 'p-1', ['t-1', 't-2']);
    m.terminal.caidas.add('t-2');
    const r = await m.caso.plantillas(ctx, COP, ['pl-1']);
    expect(r).toEqual({ suprimidas: 1, retiradas: 1, retiradasPendientes: 1 });
    expect(await m.plantillas.porRetirar(COP)).toEqual([
      { copropiedadId: COP, plantillaId: 'pl-1', dispositivoId: 't-2' },
    ]);
    expect(m.avisos.join(' ')).toMatch(/no se pudo retirar/);
  });

  it('lo ya suprimido no se vuelve a suprimir, pero su retirada pendiente se intenta', async () => {
    const m = montar();
    sincronizada(m, 'pl-1', 'p-1', ['t-1']);
    const ya = (await m.plantillas.porId(COP, 'pl-1'))?.suprimirPorRevocacion(AHORA);
    if (ya !== undefined) m.plantillas.declarar(ya);
    const r = await m.caso.plantillas(ctx, COP, ['pl-1']);
    expect(r).toEqual({ suprimidas: 0, retiradas: 1, retiradasPendientes: 0 });
  });

  it('sin nada que suprimir, no toca ningún equipo', async () => {
    const m = montar();
    expect(await m.caso.plantillas(ctx, COP, [])).toEqual({
      suprimidas: 0,
      retiradas: 0,
      retiradasPendientes: 0,
    });
    expect(m.terminal.retiradas).toEqual([]);
  });
});
