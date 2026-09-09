import { beforeEach, describe, expect, it } from 'vitest';
import { ConsentimientoBiometrico, esExito, esFallo } from '@ncr/domain-core';
import type { FaceTemplateProvider, GeneradorDeId, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { AlmacenEnMemoria, BovedaAesGcm } from '../infraestructura/boveda-cifrada';
import {
  RepositorioConsentimientosEnMemoria,
  RepositorioPlantillasEnMemoria,
} from '../infraestructura/repositorios-en-memoria';
import {
  BarrerPlantillasVencidas,
  CapturarRostro,
  ResponderConsentimiento,
  RevocarConsentimiento,
  SincronizarPlantilla,
} from './casos-de-uso';

const COP = 'cop-1';
const TITULAR = 'visitante-1';
const RESIDENTE = 'residente-1';
const HORA = 3_600_000;
const LLAVE = 'llave-de-prueba-de-treinta-y-dos-caracteres';

class RelojFijo implements Reloj {
  constructor(private instante: Date) {}
  ahora(): Date {
    return this.instante;
  }
  avanzar(ms: number): void {
    this.instante = new Date(this.instante.getTime() + ms);
  }
}

class IdsSecuenciales implements GeneradorDeId {
  private n = 0;
  nuevo(): string {
    this.n += 1;
    return `id-${this.n}`;
  }
}

/** Terminal simulada que puede fallar a voluntad: CA-10 con un lector caído. */
class TerminalEspia implements FaceTemplateProvider {
  readonly recibidas: { dispositivoId: string; plantillaId: string; bytes: number }[] = [];
  readonly retiradas: string[] = [];
  falla = false;
  async sincronizar(dispositivoId: string, plantillaId: string, plantilla: Uint8Array) {
    if (this.falla) throw new Error('terminal fuera de línea');
    this.recibidas.push({ dispositivoId, plantillaId, bytes: plantilla.length });
  }
  async suprimir(dispositivoId: string, plantillaId: string) {
    if (this.falla) throw new Error('terminal fuera de línea');
    this.retiradas.push(`${dispositivoId}/${plantillaId}`);
  }
}

const ctx: ContextoTenant = {
  usuarioId: 'admin-1',
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: true,
};

const medidasBuenas = {
  rostrosDetectados: 1,
  nitidez: 0.85,
  iluminacion: 0.6,
  proporcionRostro: 0.4,
};

let consentimientos: RepositorioConsentimientosEnMemoria;
let plantillas: RepositorioPlantillasEnMemoria;
let terminal: TerminalEspia;
let boveda: BovedaAesGcm;
let almacen: AlmacenEnMemoria;
let reloj: RelojFijo;
let capturar: CapturarRostro;
let responder: ResponderConsentimiento;
let revocar: RevocarConsentimiento;
let sincronizar: SincronizarPlantilla;
let barrer: BarrerPlantillasVencidas;

const AHORA = new Date('2026-09-08T10:00:00.000Z');
const VECTOR = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

beforeEach(() => {
  consentimientos = new RepositorioConsentimientosEnMemoria();
  plantillas = new RepositorioPlantillasEnMemoria();
  terminal = new TerminalEspia();
  almacen = new AlmacenEnMemoria();
  boveda = new BovedaAesGcm(LLAVE, 'env:BIOMETRIA_LLAVE', almacen, terminal);
  reloj = new RelojFijo(AHORA);
  const ids = new IdsSecuenciales();
  capturar = new CapturarRostro(consentimientos, plantillas, boveda, reloj, ids);
  responder = new ResponderConsentimiento(consentimientos, plantillas, reloj);
  revocar = new RevocarConsentimiento(consentimientos, plantillas, boveda, reloj);
  sincronizar = new SincronizarPlantilla(consentimientos, plantillas, boveda, reloj);
  barrer = new BarrerPlantillasVencidas(plantillas, boveda, reloj);
});

const capturaValida = async () => {
  const r = await capturar.ejecutar(ctx, {
    titularId: TITULAR,
    autorizacionId: 'aut-1',
    medidas: medidasBuenas,
    vector: VECTOR,
    versionPolitica: 'v1.0',
    canal: 'app',
    suprimirEn: new Date(AHORA.getTime() + 8 * HORA),
  });
  if (!esExito(r) || !r.valor.aceptada) throw new Error('la captura debía aceptarse');
  return r.valor;
};

describe('CapturarRostro · CU-02, el orden es la regla', () => {
  it('una captura mala NO llega a pedir consentimiento', async () => {
    const r = await capturar.ejecutar(ctx, {
      titularId: TITULAR,
      medidas: { ...medidasBuenas, rostrosDetectados: 0 },
      vector: VECTOR,
      versionPolitica: 'v1.0',
      canal: 'app',
      suprimirEn: new Date(AHORA.getTime() + 8 * HORA),
    });
    expect(esExito(r)).toBe(true);
    if (esExito(r)) expect(r.valor.aceptada).toBe(false);
    // Lo que importa: no se molestó al visitante con una solicitud inútil.
    expect(await consentimientos.vigenteDe(COP, TITULAR)).toBeNull();
  });

  it('una captura buena deja el consentimiento PENDIENTE, no otorgado', async () => {
    const r = await capturaValida();
    const c = await consentimientos.porId(COP, r.consentimientoId);
    expect(c?.estado).toBe('pendiente');
    expect(c?.titularId).toBe(TITULAR);
  });

  it('la plantilla nace sin poder sincronizarse', async () => {
    const r = await capturaValida();
    const p = await plantillas.porId(COP, r.plantillaId);
    expect(p?.estado).toBe('pendiente_consentimiento');
  });

  it('el vector se guarda CIFRADO: el claro no aparece en el almacén', async () => {
    const r = await capturaValida();
    const guardado = await almacen.tomar(`${COP}/${r.plantillaId}`);
    expect(guardado).not.toBeNull();
    expect(guardado?.includes(Buffer.from(VECTOR))).toBe(false);
  });

  it('un plazo de supresión sin cota se rechaza antes de tocar nada', async () => {
    const r = await capturar.ejecutar(ctx, {
      titularId: TITULAR,
      medidas: medidasBuenas,
      vector: VECTOR,
      versionPolitica: 'v1.0',
      canal: 'app',
      suprimirEn: new Date(AHORA.getTime() + 6 * 365 * 24 * HORA),
    });
    expect(esFallo(r)).toBe(true);
  });
});

describe('ResponderConsentimiento · RN-10, responde el titular', () => {
  it('el residente no puede aceptar por el visitante', async () => {
    const r = await capturaValida();
    const respuesta = await responder.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienResponde: RESIDENTE,
      acepta: true,
    });
    expect(esFallo(respuesta)).toBe(true);
    if (esFallo(respuesta)) expect(respuesta.error.regla).toBe('RN-10');
  });

  it('el titular acepta y la plantilla queda habilitada', async () => {
    const r = await capturaValida();
    await responder.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienResponde: TITULAR,
      acepta: true,
    });
    const p = await plantillas.porId(COP, r.plantillaId);
    expect(p?.estado).toBe('pendiente_sincronizacion');
  });

  it('el titular rechaza y la plantilla NO se habilita', async () => {
    const r = await capturaValida();
    await responder.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienResponde: TITULAR,
      acepta: false,
    });
    const p = await plantillas.porId(COP, r.plantillaId);
    expect(p?.estado).toBe('pendiente_consentimiento');
  });
});

describe('SincronizarPlantilla · RN-09, se pregunta en el instante de empujar', () => {
  it('sin consentimiento vigente no se empuja nada a la terminal', async () => {
    const r = await capturaValida();
    const s = await sincronizar.ejecutar(ctx, {
      plantillaId: r.plantillaId,
      dispositivoId: 'disp-1',
    });
    expect(esFallo(s)).toBe(true);
    expect(terminal.recibidas).toEqual([]);
  });

  it('con consentimiento vigente sí, y la terminal recibe el vector EN CLARO', async () => {
    const r = await capturaValida();
    await responder.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienResponde: TITULAR,
      acepta: true,
    });
    const s = await sincronizar.ejecutar(ctx, {
      plantillaId: r.plantillaId,
      dispositivoId: 'disp-1',
    });
    expect(esExito(s)).toBe(true);
    // El descifrado ocurre dentro del adaptador y el claro llega solo aquí.
    expect(terminal.recibidas).toEqual([
      { dispositivoId: 'disp-1', plantillaId: r.plantillaId, bytes: VECTOR.length },
    ]);
  });

  it('revocado ENTRE habilitar y empujar, ya no se empuja', async () => {
    const r = await capturaValida();
    await responder.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienResponde: TITULAR,
      acepta: true,
    });
    reloj.avanzar(60_000);
    await revocar.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienRevoca: TITULAR,
    });
    const s = await sincronizar.ejecutar(ctx, {
      plantillaId: r.plantillaId,
      dispositivoId: 'disp-1',
    });
    expect(esFallo(s)).toBe(true);
    expect(terminal.recibidas).toEqual([]);
  });
});

describe('RevocarConsentimiento · RN-11, CA-11', () => {
  const cicloCompleto = async () => {
    const r = await capturaValida();
    await responder.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienResponde: TITULAR,
      acepta: true,
    });
    await sincronizar.ejecutar(ctx, { plantillaId: r.plantillaId, dispositivoId: 'disp-1' });
    return r;
  };

  it('revocar borra el vector del almacén, no lo etiqueta', async () => {
    const r = await cicloCompleto();
    expect(await almacen.tomar(`${COP}/${r.plantillaId}`)).not.toBeNull();
    await revocar.ejecutar(ctx, { consentimientoId: r.consentimientoId, quienRevoca: TITULAR });
    expect(await almacen.tomar(`${COP}/${r.plantillaId}`)).toBeNull();
  });

  it('la plantilla queda suprimida y el consentimiento revocado', async () => {
    const r = await cicloCompleto();
    const res = await revocar.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienRevoca: TITULAR,
    });
    expect(esExito(res)).toBe(true);
    if (esExito(res)) expect(res.valor.plantillasSuprimidas).toBe(1);
    expect((await plantillas.porId(COP, r.plantillaId))?.estado).toBe('suprimida');
    expect((await consentimientos.porId(COP, r.consentimientoId))?.estado).toBe('revocado');
  });

  it('el residente no puede revocar por el visitante', async () => {
    const r = await cicloCompleto();
    const res = await revocar.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienRevoca: RESIDENTE,
    });
    expect(esFallo(res)).toBe(true);
    expect(await almacen.tomar(`${COP}/${r.plantillaId}`)).not.toBeNull();
  });

  it('tras revocar, la plantilla queda en la cola de retirada de la terminal', async () => {
    const r = await cicloCompleto();
    await revocar.ejecutar(ctx, { consentimientoId: r.consentimientoId, quienRevoca: TITULAR });
    expect(await plantillas.porRetirar(COP)).toEqual([
      { plantillaId: r.plantillaId, dispositivoId: 'disp-1' },
    ]);
  });
});

describe('BarrerPlantillasVencidas · RN-11, KPI-21', () => {
  it('suprime lo vencido y deja lo vivo', async () => {
    const r = await capturaValida();
    reloj.avanzar(9 * HORA);
    const res = await barrer.ejecutar(ctx);
    expect(esExito(res)).toBe(true);
    if (esExito(res)) expect(res.valor.suprimidas).toBe(1);
    expect(await almacen.tomar(`${COP}/${r.plantillaId}`)).toBeNull();
  });

  it('antes del plazo no suprime nada', async () => {
    await capturaValida();
    reloj.avanzar(1 * HORA);
    const res = await barrer.ejecutar(ctx);
    if (esExito(res)) expect(res.valor.suprimidas).toBe(0);
  });

  it('retira de la terminal lo que había llegado a ella', async () => {
    const r = await capturaValida();
    await responder.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienResponde: TITULAR,
      acepta: true,
    });
    await sincronizar.ejecutar(ctx, { plantillaId: r.plantillaId, dispositivoId: 'disp-1' });
    reloj.avanzar(9 * HORA);

    const res = await barrer.ejecutar(ctx);
    if (esExito(res)) expect(res.valor).toMatchObject({ suprimidas: 1, retiradas: 1 });
    expect(terminal.retiradas).toEqual([`disp-1/${r.plantillaId}`]);
  });

  it('una terminal caída NO se cuenta como retirada, y la cola sigue viva', async () => {
    const r = await capturaValida();
    await responder.ejecutar(ctx, {
      consentimientoId: r.consentimientoId,
      quienResponde: TITULAR,
      acepta: true,
    });
    await sincronizar.ejecutar(ctx, { plantillaId: r.plantillaId, dispositivoId: 'disp-1' });
    reloj.avanzar(9 * HORA);
    terminal.falla = true;

    const res = await barrer.ejecutar(ctx);
    // CA-10 se acredita con la cola vacía: marcar retirado lo que sigue en un
    // lector caído sería declarar un cumplimiento que no ocurrió.
    if (esExito(res)) expect(res.valor).toMatchObject({ retiradas: 0, retiradasFallidas: 1 });
    expect(await plantillas.porRetirar(COP)).toHaveLength(1);
  });

  it('es idempotente: barrer dos veces no cuenta dos veces', async () => {
    await capturaValida();
    reloj.avanzar(9 * HORA);
    await barrer.ejecutar(ctx);
    const segunda = await barrer.ejecutar(ctx);
    if (esExito(segunda)) expect(segunda.valor.suprimidas).toBe(0);
  });
});

describe('BovedaAesGcm · el vector no sale de la bóveda', () => {
  it('el puerto no ofrece ninguna forma de leer el vector', () => {
    const metodos = Object.getOwnPropertyNames(BovedaAesGcm.prototype);
    expect(metodos.filter((m) => /leer|obtener|descifrarPublico|exportar/i.test(m))).toEqual([]);
  });

  it('una plantilla manipulada en la base no llega a la terminal', async () => {
    const r = await capturaValida();
    const clave = `${COP}/${r.plantillaId}`;
    const sobre = await almacen.tomar(clave);
    if (sobre === null) throw new Error('debía existir');
    // Se altera un byte del cuerpo cifrado: sin GCM, la terminal habría
    // aceptado una plantilla que ya no es la del titular.
    const manipulado = Buffer.from(sobre);
    manipulado[manipulado.length - 1] ^= 0xff;
    await almacen.poner(clave, manipulado);

    await expect(boveda.empujarATerminal(COP, r.plantillaId, 'disp-1')).rejects.toThrow();
    expect(terminal.recibidas).toEqual([]);
  });

  it('no cifra una plantilla vacía', async () => {
    await expect(boveda.guardar(COP, 'p-x', new Uint8Array())).rejects.toThrow();
  });

  it('una llave corta no construye la bóveda', () => {
    expect(() => new BovedaAesGcm('corta', 'env:X', almacen, terminal)).toThrow();
  });
});

describe('ConsentimientoBiometrico · el plazo de respuesta (P-03)', () => {
  it('pasado el plazo, el consentimiento pendiente se puede expirar', async () => {
    const r = await capturaValida();
    const c = await consentimientos.porId(COP, r.consentimientoId);
    if (c === null) throw new Error('debía existir');
    expect(c.venciendo(new Date(AHORA.getTime() + 25 * HORA), 24)).toBe(true);
    const expirado = c.expirar(new Date(AHORA.getTime() + 25 * HORA));
    expect(esExito(expirado)).toBe(true);
    if (esExito(expirado)) expect(expirado.valor.estado).toBe('expirado');
  });

  it('el repositorio encuentra los pendientes vencidos', async () => {
    await capturaValida();
    const vencidos = await consentimientos.pendientesVencidos(
      COP,
      new Date(AHORA.getTime() + 25 * HORA),
      24,
    );
    expect(vencidos).toHaveLength(1);
  });
});

describe('ConsentimientoBiometrico · aislamiento por copropiedad', () => {
  it('un contexto sin copropiedad no captura nada', async () => {
    const sinCop: ContextoTenant = { ...ctx, copropiedadId: null };
    const r = await capturar.ejecutar(sinCop, {
      titularId: TITULAR,
      medidas: medidasBuenas,
      vector: VECTOR,
      versionPolitica: 'v1.0',
      canal: 'app',
      suprimirEn: new Date(AHORA.getTime() + 8 * HORA),
    });
    expect(esFallo(r)).toBe(true);
  });

  it('la plantilla de otra copropiedad no se ve ni se sincroniza', async () => {
    const r = await capturaValida();
    const otra: ContextoTenant = {
      ...ctx,
      copropiedadId: 'cop-2',
      copropiedadesAtendidas: ['cop-2'],
    };
    const s = await sincronizar.ejecutar(otra, {
      plantillaId: r.plantillaId,
      dispositivoId: 'disp-1',
    });
    expect(esFallo(s)).toBe(true);
    if (esFallo(s)) expect(s.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');
  });

  it('ConsentimientoBiometrico se exporta desde el dominio, no se redefine aquí', () => {
    expect(typeof ConsentimientoBiometrico.solicitar).toBe('function');
  });
});
