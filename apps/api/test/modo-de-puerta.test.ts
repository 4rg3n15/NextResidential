import { describe, expect, it } from 'vitest';
import { MockProvider, PERFIL_IDEAL, tunelEnMemoria } from '@ncr/providers';
import type { ContextoTenant } from '../src/autenticacion';
import { relojFijo } from '../src/eventos/aplicacion/dobles';
import { FijarModoDePuerta } from '../src/guardia/aplicacion/fijar-modo-de-puerta';
import { BarrerReversionesDePuertas } from '../src/guardia/aplicacion/reversion-de-puertas';
import { duracionDeLaOrden, tocaRevertir } from '../src/guardia/aplicacion/modo-de-puerta';
import type { ModoVigente } from '../src/guardia/aplicacion/modo-de-puerta';
import { AccionadorDeModoPorProveedor } from '../src/guardia/infraestructura/accionador-de-modo';
import {
  AjustesDePuertasEnMemoria,
  RegistroDeModosDePuertaEnMemoria,
} from '../src/guardia/infraestructura/modos-de-puerta-en-memoria';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · C6 · PUERTA LIBRE Y BLOQUEADA, SIN NEST: las reglas y el barrido
 *
 * Con reloj inyectado y el MISMO camino vía Edge que en producción (el túnel
 * en memoria del paquete de proveedores): la orden cruza el túnel, la cumple
 * el proveedor del Edge, y al vencer el plazo la reversión vuelve a cruzarlo.
 * Con el túnel cortado al vencer, la reversión no llega: alerta y reintento
 * con espera creciente. El 403 y el 400 por HTTP están en `modo-de-puerta.e2e`;
 * la reversión tras reiniciar la API, en `modo-de-puerta-pg`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = 'disp-porteria';
const ADMIN: ContextoTenant = {
  usuarioId: '00000000-0000-4000-8000-000000000010',
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: true,
};
const PORTERO: ContextoTenant = { ...ADMIN, rol: 'portero' };
const bitacora = { registrar: () => undefined };

const montar = () => {
  const reloj = relojFijo(new Date('2026-10-03T12:00:00Z'));
  const delEdge = new MockProvider({ perfil: PERFIL_IDEAL, semilla: 1 });
  const tunel = tunelEnMemoria(delEdge);
  const registro = new RegistroDeModosDePuertaEnMemoria();
  const ajustes = new AjustesDePuertasEnMemoria();
  const ordenes = new FijarModoDePuerta(
    registro,
    ajustes,
    new AccionadorDeModoPorProveedor(tunel.proveedor, bitacora),
    reloj,
    bitacora,
  );
  const alertas: { notas: string; tipo: string; severidad: string }[] = [];
  const barrer = new BarrerReversionesDePuertas(
    registro,
    ordenes,
    { ejecutar: async (nueva) => alertas.push(nueva) },
    reloj,
    '00000000-0000-4000-8000-000000000003',
  );
  return { reloj, delEdge, tunel, registro, ajustes, ordenes, barrer, alertas };
};

const pedido = { copropiedadId: COP, dispositivoId: EQUIPO, numeroDePuerta: 1 } as const;

describe('C2 · quién y con qué', () => {
  it('un portero no deja la puerta libre aunque llegue al caso de uso (segunda barrera)', async () => {
    const m = montar();
    const r = await m.ordenes.fijar(PORTERO, {
      ...pedido,
      modo: 'libre',
      motivo: 'Mudanza del 302',
    });
    expect(r.ok ? 'ok' : r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
    expect(m.delEdge.modosDeSalida.size).toBe(0);
  });

  it('sin motivo no hay orden, ni fila, ni equipo tocado', async () => {
    const m = montar();
    const r = await m.ordenes.fijar(ADMIN, { ...pedido, modo: 'libre', motivo: '  ' });
    expect(r.ok ? 'ok' : r.error.codigo).toBe('DATO_INVALIDO');
    expect(await m.registro.vigentes(COP)).toEqual([]);
    expect(m.delEdge.modosDeSalida.size).toBe(0);
  });

  it('la duración: la máxima por omisión, nunca más que ella; la máxima se configura', async () => {
    expect(duracionDeLaOrden(undefined, 120)).toEqual({ ok: true, valor: 120 });
    expect(duracionDeLaOrden(30, 120)).toEqual({ ok: true, valor: 30 });
    expect(duracionDeLaOrden(121, 120).ok).toBe(false);
    const m = montar();
    await m.ajustes.fijarDuracionMaxima(COP, 60);
    const r = await m.ordenes.fijar(ADMIN, {
      ...pedido,
      modo: 'libre',
      motivo: 'Mudanza',
      minutos: 90,
    });
    expect(r.ok).toBe(false);
  });
});

describe('C1/C3/C5 · la orden cruza el túnel y vuelve sola a normal', () => {
  it('libre por 2 h: el Edge la cumple; antes del plazo no se revierte; al vencer, sí', async () => {
    const m = montar();
    const r = await m.ordenes.fijar(ADMIN, { ...pedido, modo: 'libre', motivo: 'Mudanza del 302' });
    expect(r.ok && r.valor.resultado).toBe('aceptada');
    expect(m.delEdge.modosDeSalida.get(`${EQUIPO}:1`)).toBe('libre');
    const [vigente] = await m.registro.vigentes(COP);
    expect(vigente?.revierteEn.toISOString()).toBe('2026-10-03T14:00:00.000Z');

    m.reloj.avanzar(119 * 60_000);
    expect(await m.barrer.ejecutar()).toMatchObject({ revertidas: 0 });
    expect(m.delEdge.modosDeSalida.get(`${EQUIPO}:1`)).toBe('libre');

    m.reloj.avanzar(60_000);
    expect(await m.barrer.ejecutar()).toMatchObject({ revertidas: 1, fallidas: 0 });
    expect(m.delEdge.modosDeSalida.get(`${EQUIPO}:1`)).toBe('normal');
    expect(await m.registro.vigentes(COP)).toEqual([]);
    expect(m.alertas).toEqual([]);
  });

  it('revertir ahora: vuelve a normal antes del plazo y deja de estar vigente', async () => {
    const m = montar();
    await m.ordenes.fijar(ADMIN, { ...pedido, modo: 'bloqueada', motivo: 'Fumigación del lobby' });
    const r = await m.ordenes.revertirAhora(ADMIN, { ...pedido, motivo: undefined });
    expect(r.ok && r.valor.resultado).toBe('aceptada');
    expect(m.delEdge.modosDeSalida.get(`${EQUIPO}:1`)).toBe('normal');
    expect(await m.registro.vigentes(COP)).toEqual([]);
  });
});

describe('C3 · el túnel caído al vencer: alerta, y reintento con espera creciente', () => {
  it('la reversión no llega: alerta alta; no se reintenta antes de la espera; al volver, revierte', async () => {
    const m = montar();
    await m.ordenes.fijar(ADMIN, {
      ...pedido,
      modo: 'libre',
      motivo: 'Mudanza del 302',
      minutos: 10,
    });
    m.tunel.cortar();
    m.reloj.avanzar(10 * 60_000);

    expect(await m.barrer.ejecutar()).toMatchObject({ revertidas: 0, fallidas: 1 });
    expect(m.alertas).toHaveLength(1);
    expect(m.alertas[0]).toMatchObject({ tipo: 'apertura_fallida', severidad: 'alta' });
    expect(m.alertas[0]?.notas).toMatch(/sigue LIBRE/);
    const [vigente] = await m.registro.vigentes(COP);
    expect(vigente?.reversionesFallidas).toBe(1);

    // Antes de 1 min no se insiste; a los 2 fallos, la espera es 2 min.
    m.reloj.avanzar(30_000);
    expect(await m.barrer.ejecutar()).toMatchObject({ fallidas: 0 });
    m.reloj.avanzar(30_000);
    expect(await m.barrer.ejecutar()).toMatchObject({ fallidas: 1 });
    expect(tocaRevertir((await m.registro.vigentes(COP))[0] as ModoVigente, m.reloj.ahora())).toBe(
      false,
    );
    expect(m.delEdge.modosDeSalida.get(`${EQUIPO}:1`)).toBe('libre');
  });
});

describe('tocaRevertir · la espera entre reintentos', () => {
  const base: ModoVigente = {
    id: 'x',
    copropiedadId: COP,
    dispositivoId: EQUIPO,
    numeroDePuerta: 1,
    modo: 'libre',
    motivo: 'm',
    operadorId: 'o',
    operadorNombre: null,
    rol: 'administrador',
    ordenadaEn: new Date('2026-10-03T10:00:00Z'),
    revierteEn: new Date('2026-10-03T12:00:00Z'),
    resultado: 'aceptada',
    reversionesFallidas: 0,
    ultimoIntento: null,
  };
  it('1, 2, 4… y nunca más de 30 min entre intentos', () => {
    const tras = (fallos: number, minutos: number) =>
      tocaRevertir(
        { ...base, reversionesFallidas: fallos, ultimoIntento: new Date('2026-10-03T13:00:00Z') },
        new Date(Date.parse('2026-10-03T13:00:00Z') + minutos * 60_000),
      );
    expect(tras(1, 0.9)).toBe(false);
    expect(tras(1, 1)).toBe(true);
    expect(tras(3, 3.9)).toBe(false);
    expect(tras(3, 4)).toBe(true);
    expect(tras(10, 29)).toBe(false);
    expect(tras(10, 30)).toBe(true);
  });
});
