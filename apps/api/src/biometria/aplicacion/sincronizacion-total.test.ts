import { beforeEach, describe, expect, it } from 'vitest';
import type { Bitacora, FaceTemplateProvider, GeneradorDeId, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { AlmacenEnMemoria, BovedaAesGcm } from '../infraestructura/boveda-cifrada';
import {
  RepositorioConsentimientosEnMemoria,
  RepositorioPlantillasEnMemoria,
} from '../infraestructura/repositorios-en-memoria';
import {
  CapturarRostro,
  ResponderConsentimiento,
  RevocarConsentimiento,
  SincronizarPlantilla,
} from './casos-de-uso';
import type { CatalogoDeTerminales, TerminalConBiblioteca } from './puertos';
import {
  PropagarConsentimientoAceptado,
  SincronizarPlantillaEnTerminales,
} from './sincronizacion-total';

const COP = 'cop-1';
const TITULAR = 'visitante-1';
const LLAVE = 'llave-de-prueba-de-treinta-y-dos-caracteres';
const AHORA = new Date('2026-09-25T10:00:00.000Z');

class RelojFijo implements Reloj {
  ahora(): Date {
    return AHORA;
  }
}
class Ids implements GeneradorDeId {
  private n = 0;
  nuevo(): string {
    this.n += 1;
    return `id-${this.n}`;
  }
}
/** Terminales que reciben o fallan por su identificador. */
class Terminales implements FaceTemplateProvider {
  readonly recibidas: string[] = [];
  readonly retiradas: string[] = [];
  readonly caidas = new Set<string>();
  async sincronizar(dispositivoId: string, plantillaId: string): Promise<void> {
    if (this.caidas.has(dispositivoId)) throw new Error(`${dispositivoId} fuera de línea`);
    this.recibidas.push(`${dispositivoId}/${plantillaId}`);
  }
  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    if (this.caidas.has(dispositivoId)) throw new Error(`${dispositivoId} fuera de línea`);
    this.retiradas.push(`${dispositivoId}/${plantillaId}`);
  }
}
class Catalogo implements CatalogoDeTerminales {
  constructor(readonly terminales: TerminalConBiblioteca[]) {}
  async conBibliotecaDeRostros(): Promise<readonly TerminalConBiblioteca[]> {
    return this.terminales;
  }
}
const bitacora: Bitacora & { lineas: string[] } = {
  lineas: [],
  registrar(_nivel, mensaje) {
    this.lineas.push(mensaje);
  },
};
const ctx: ContextoTenant = {
  usuarioId: 'admin-1',
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: true,
};

let consentimientos: RepositorioConsentimientosEnMemoria;
let plantillas: RepositorioPlantillasEnMemoria;
let terminales: Terminales;
let catalogo: Catalogo;
let enTerminales: SincronizarPlantillaEnTerminales;
let propagar: PropagarConsentimientoAceptado;
let responder: ResponderConsentimiento;
let revocar: RevocarConsentimiento;
let capturar: CapturarRostro;

const captura = async () => {
  const r = await capturar.ejecutar(ctx, {
    titularId: TITULAR,
    medidas: { rostrosDetectados: 1, nitidez: 0.85, iluminacion: 0.6, proporcionRostro: 0.4 },
    vector: new Uint8Array([1, 2, 3]),
    versionPolitica: 'v1',
    canal: 'app',
    suprimirEn: new Date(AHORA.getTime() + 8 * 3_600_000),
  });
  if (!r.ok || !r.valor.aceptada) throw new Error('la captura debía aceptarse');
  return r.valor;
};

beforeEach(() => {
  bitacora.lineas.length = 0;
  consentimientos = new RepositorioConsentimientosEnMemoria();
  plantillas = new RepositorioPlantillasEnMemoria();
  terminales = new Terminales();
  catalogo = new Catalogo([
    { dispositivoId: 't-1', nombre: 'Terminal peatonal' },
    { dispositivoId: 'v-1', nombre: 'Videoportero' },
  ]);
  const boveda = new BovedaAesGcm(LLAVE, 'env:X', new AlmacenEnMemoria(), terminales);
  const reloj = new RelojFijo();
  capturar = new CapturarRostro(consentimientos, plantillas, boveda, reloj, new Ids());
  responder = new ResponderConsentimiento(consentimientos, plantillas, reloj);
  revocar = new RevocarConsentimiento(consentimientos, plantillas, boveda, reloj);
  const una = new SincronizarPlantilla(consentimientos, plantillas, boveda, reloj);
  enTerminales = new SincronizarPlantillaEnTerminales(plantillas, catalogo, una, bitacora);
  propagar = new PropagarConsentimientoAceptado(plantillas, enTerminales, bitacora);
});

describe('SincronizarPlantillaEnTerminales · a TODAS, por capacidad (A3)', () => {
  it('sin consentimiento vigente no llega a NINGUNA: la prohibición no es por terminal', async () => {
    const { plantillaId } = await captura();
    const r = await enTerminales.ejecutar(ctx, { plantillaId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
    expect(terminales.recibidas).toEqual([]);
  });

  it('con consentimiento vigente llega a las dos, y se registra en cada una', async () => {
    const { plantillaId, consentimientoId } = await captura();
    await responder.ejecutar(ctx, { consentimientoId, quienResponde: TITULAR, acepta: true });

    const r = await enTerminales.ejecutar(ctx, { plantillaId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toMatchObject({ terminales: 2, sincronizadas: 2, fallidas: 0 });
    expect(terminales.recibidas).toEqual([`t-1/${plantillaId}`, `v-1/${plantillaId}`]);
    expect([...(plantillas.sincronizaciones.get(plantillaId) ?? [])]).toEqual(['t-1', 'v-1']);
  });

  it('una terminal caída no impide las demás, y el resumen la nombra', async () => {
    const { plantillaId, consentimientoId } = await captura();
    await responder.ejecutar(ctx, { consentimientoId, quienResponde: TITULAR, acepta: true });
    terminales.caidas.add('t-1');

    const r = await enTerminales.ejecutar(ctx, { plantillaId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toMatchObject({ terminales: 2, sincronizadas: 1, fallidas: 1 });
    expect(r.valor.porTerminal.find((t) => t.dispositivoId === 't-1')).toMatchObject({
      sincronizada: false,
      detalle: expect.stringContaining('fuera de línea'),
    });
    expect(terminales.recibidas).toEqual([`v-1/${plantillaId}`]);
  });

  it('sin equipos con biblioteca de rostros: cero destinos, y lo dice en bitácora', async () => {
    catalogo.terminales.length = 0;
    const { plantillaId, consentimientoId } = await captura();
    await responder.ejecutar(ctx, { consentimientoId, quienResponde: TITULAR, acepta: true });
    const r = await enTerminales.ejecutar(ctx, { plantillaId });
    expect(r.ok && r.valor.terminales).toBe(0);
    expect(bitacora.lineas).toContain('sincronización total sin destino');
  });

  it('relanzarla no duplica: la terminal la vuelve a recibir y la fila es la misma', async () => {
    const { plantillaId, consentimientoId } = await captura();
    await responder.ejecutar(ctx, { consentimientoId, quienResponde: TITULAR, acepta: true });
    await enTerminales.ejecutar(ctx, { plantillaId });
    await enTerminales.ejecutar(ctx, { plantillaId });
    expect(plantillas.sincronizaciones.get(plantillaId)?.size).toBe(2);
  });

  it('una plantilla que no existe no toca ninguna terminal', async () => {
    const r = await enTerminales.ejecutar(ctx, { plantillaId: 'no-existe' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');
  });
});

describe('PropagarConsentimientoAceptado · lo que pasa justo tras aceptar', () => {
  it('empuja las plantillas pendientes de ese consentimiento a todas las terminales', async () => {
    const { plantillaId, consentimientoId } = await captura();
    await responder.ejecutar(ctx, { consentimientoId, quienResponde: TITULAR, acepta: true });

    const resultados = await propagar.ejecutar(ctx, { consentimientoId });
    expect(resultados).toHaveLength(1);
    expect(resultados[0]).toMatchObject({ plantillaId, sincronizadas: 2 });
  });

  it('con el consentimiento rechazado no propaga nada', async () => {
    const { consentimientoId } = await captura();
    await responder.ejecutar(ctx, { consentimientoId, quienResponde: TITULAR, acepta: false });
    expect(await propagar.ejecutar(ctx, { consentimientoId })).toEqual([]);
    expect(terminales.recibidas).toEqual([]);
  });

  it('nunca lanza: una terminal que revienta queda en bitácora', async () => {
    const { consentimientoId } = await captura();
    await responder.ejecutar(ctx, { consentimientoId, quienResponde: TITULAR, acepta: true });
    terminales.caidas.add('t-1');
    terminales.caidas.add('v-1');
    const resultados = await propagar.ejecutar(ctx, { consentimientoId });
    expect(resultados[0]).toMatchObject({ sincronizadas: 0, fallidas: 2 });
  });
});

describe('RevocarConsentimiento · retirada INMEDIATA de las terminales (CA-11, A3)', () => {
  it('tras revocar, las terminales que la tenían la sueltan en la misma llamada', async () => {
    const { plantillaId, consentimientoId } = await captura();
    await responder.ejecutar(ctx, { consentimientoId, quienResponde: TITULAR, acepta: true });
    await enTerminales.ejecutar(ctx, { plantillaId });

    const r = await revocar.ejecutar(ctx, { consentimientoId, quienRevoca: TITULAR });
    expect(r.ok && r.valor).toEqual({
      plantillasSuprimidas: 1,
      retiradas: 2,
      retiradasPendientes: 0,
    });
    expect(terminales.retiradas.sort()).toEqual([`t-1/${plantillaId}`, `v-1/${plantillaId}`]);
    expect(await plantillas.porRetirar(COP)).toEqual([]);
  });

  it('la terminal caída queda PENDIENTE en la cola de CA-10, no se da por retirada', async () => {
    const { plantillaId, consentimientoId } = await captura();
    await responder.ejecutar(ctx, { consentimientoId, quienResponde: TITULAR, acepta: true });
    await enTerminales.ejecutar(ctx, { plantillaId });
    terminales.caidas.add('v-1');

    const r = await revocar.ejecutar(ctx, { consentimientoId, quienRevoca: TITULAR });
    expect(r.ok && r.valor).toMatchObject({ retiradas: 1, retiradasPendientes: 1 });
    expect(await plantillas.porRetirar(COP)).toEqual([
      { copropiedadId: COP, plantillaId, dispositivoId: 'v-1' },
    ]);
  });
});
