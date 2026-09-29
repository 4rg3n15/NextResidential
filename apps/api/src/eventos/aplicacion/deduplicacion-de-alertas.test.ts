import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { AbrirAlertaDeEquipo, debeAbrirAlerta, notasConClave } from './deduplicacion-de-alertas';
import { EscalarAlerta } from './escalamiento';
import { RepositorioAlertasEnMemoria } from '../infraestructura/repositorios-en-memoria';
import type { CanalTiempoReal } from './puertos';

const AHORA = new Date('2026-09-29T10:00:00Z');
const hace = (s: number): Date => new Date(AHORA.getTime() - s * 1000);
const COP = '10000000-0000-4000-8000-000000000001';
const CAMARA = '90000000-0000-4000-8000-000000000001';

describe('debeAbrirAlerta · una por condición, no una por lectura (E5)', () => {
  const ventanaMs = 600_000;
  it('sin ninguna anterior, se abre', () => {
    expect(
      debeAbrirAlerta({ ultima: null, ahora: AHORA, ventanaMs, persistente: false }).abrir,
    ).toBe(true);
  });
  it('persistente: mientras haya una abierta o en atención, NO se abre otra, pase el tiempo que pase', () => {
    for (const estado of ['abierta', 'en_atencion'] as const) {
      const d = debeAbrirAlerta({
        ultima: { id: 'a1', generadaEn: hace(86_400), estado, archivada: false },
        ahora: AHORA,
        ventanaMs,
        persistente: true,
      });
      expect(d.abrir).toBe(false);
      expect(d.motivo).toMatch(/mientras dure la condición/);
    }
  });
  it('persistente: resuelta o archivada hace más de la ventana, se vuelve a abrir', () => {
    expect(
      debeAbrirAlerta({
        ultima: { id: 'a1', generadaEn: hace(700), estado: 'resuelta', archivada: false },
        ahora: AHORA,
        ventanaMs,
        persistente: true,
      }).abrir,
    ).toBe(true);
    expect(
      debeAbrirAlerta({
        ultima: { id: 'a1', generadaEn: hace(700), estado: 'abierta', archivada: true },
        ahora: AHORA,
        ventanaMs,
        persistente: true,
      }).abrir,
    ).toBe(true);
  });
  it('no persistente: dentro de la ventana no se repite; fuera, sí', () => {
    const dentro = debeAbrirAlerta({
      ultima: { id: 'a1', generadaEn: hace(599), estado: 'resuelta', archivada: false },
      ahora: AHORA,
      ventanaMs,
      persistente: false,
    });
    expect(dentro.abrir).toBe(false);
    expect(dentro.motivo).toMatch(/hace 599 s/);
    expect(
      debeAbrirAlerta({
        ultima: { id: 'a1', generadaEn: hace(600), estado: 'resuelta', archivada: false },
        ahora: AHORA,
        ventanaMs,
        persistente: false,
      }).abrir,
    ).toBe(true);
  });
  it('ventana 0 = una por lectura (comportamiento anterior, a propósito)', () => {
    expect(
      debeAbrirAlerta({
        ultima: { id: 'a1', generadaEn: AHORA, estado: 'resuelta', archivada: false },
        ahora: AHORA,
        ventanaMs: 0,
        persistente: false,
      }).abrir,
    ).toBe(true);
  });
});

const montar = () => {
  const alertas = new RepositorioAlertasEnMemoria();
  const canal: CanalTiempoReal = { publicar: async () => 1 };
  const bitacora: Bitacora = { registrar: () => undefined };
  const reloj = { ahora: () => AHORA };
  let n = 0;
  const ids = { nuevo: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
  const escalador = new EscalarAlerta(canal, alertas, reloj, bitacora);
  const abrir = new AbrirAlertaDeEquipo(alertas, escalador, reloj, ids, bitacora, 600_000);
  return { alertas, abrir };
};

describe('AbrirAlertaDeEquipo · sellada con la hora de recepción y deduplicada', () => {
  it('la cámara que decide sola: UNA alerta por cámara aunque lleguen diez lecturas', async () => {
    const { alertas, abrir } = montar();
    const nueva = {
      copropiedadId: COP,
      dispositivoId: CAMARA,
      tipo: 'acceso_dudoso' as const,
      severidad: 'alta' as const,
      clave: 'camara_decide_sola',
      notas: 'sin atestación vigente',
      persistente: true,
    };
    const primera = await abrir.ejecutar(nueva, 'ingesta');
    expect(primera.alerta).not.toBeNull();
    expect(primera.alerta?.generadaEn).toEqual(AHORA);
    expect(primera.alerta?.dispositivoId).toBe(CAMARA);
    expect(primera.alerta?.notas).toBe(
      notasConClave('camara_decide_sola', 'sin atestación vigente'),
    );
    for (let i = 0; i < 9; i += 1) {
      expect((await abrir.ejecutar(nueva, 'ingesta')).alerta).toBeNull();
    }
    expect((await alertas.abiertasDe(COP)).length).toBe(1);
  });

  it('dos claves distintas del mismo tipo y equipo son dos condiciones: dos alertas', async () => {
    const { alertas, abrir } = montar();
    const base = {
      copropiedadId: COP,
      dispositivoId: CAMARA,
      tipo: 'sabotaje' as const,
      severidad: 'media' as const,
      persistente: true,
    };
    await abrir.ejecutar({ ...base, clave: 'reloj_desviado', notas: '53 s adelantado' }, 'x');
    await abrir.ejecutar({ ...base, clave: 'otra', notas: 'otra cosa' }, 'x');
    await abrir.ejecutar({ ...base, clave: 'reloj_desviado', notas: '54 s adelantado' }, 'x');
    expect((await alertas.abiertasDe(COP)).length).toBe(2);
  });

  it('archivada con motivo: sale de la cola, sigue existiendo y se puede volver a abrir pasada la ventana', async () => {
    const { alertas, abrir } = montar();
    const nueva = {
      copropiedadId: COP,
      dispositivoId: CAMARA,
      tipo: 'acceso_dudoso' as const,
      severidad: 'alta' as const,
      clave: 'camara_decide_sola',
      notas: 'x',
      persistente: true,
    };
    const primera = await abrir.ejecutar(nueva, 'ingesta');
    const id = primera.alerta?.id ?? '';
    expect(await alertas.archivar(COP, [id, 'no-existe'], 'ruido de sitio', 'op', AHORA)).toBe(1);
    expect(await alertas.abiertasDe(COP)).toEqual([]);
    expect(await alertas.porId(COP, id)).not.toBeNull();
    expect(alertas.archivoDe(COP, id)).toMatchObject({ motivo: 'ruido de sitio', por: 'op' });
    // Dentro de la ventana no se reabre; es lo que impide el bucle archivar/abrir.
    expect((await abrir.ejecutar(nueva, 'ingesta')).alerta).toBeNull();
  });

  it('filtra por equipo y severidad', async () => {
    const { alertas, abrir } = montar();
    await abrir.ejecutar(
      {
        copropiedadId: COP,
        dispositivoId: CAMARA,
        tipo: 'sabotaje',
        severidad: 'media',
        clave: 'a',
        notas: 'a',
        persistente: false,
      },
      'x',
    );
    await abrir.ejecutar(
      {
        copropiedadId: COP,
        dispositivoId: '90000000-0000-4000-8000-000000000002',
        tipo: 'sabotaje',
        severidad: 'critica',
        clave: 'b',
        notas: 'b',
        persistente: false,
      },
      'x',
    );
    expect((await alertas.abiertasDe(COP, { dispositivoId: CAMARA })).length).toBe(1);
    expect((await alertas.abiertasDe(COP, { severidad: 'critica' })).length).toBe(1);
    expect((await alertas.abiertasDe(COP, { severidad: 'informativa' })).length).toBe(0);
  });
});
