import { describe, expect, it } from 'vitest';
import { GenerarInforme } from './informes';
import type { EventoRegistrado, RepositorioEventos } from './puertos';

/**
 * Los cuatro informes salen del MISMO hecho, así que lo que hay que probar no
 * es la consulta —es una— sino **qué cuenta cada uno** y qué dice de sí mismo.
 */
const COP = '10000000-0000-4000-8000-000000000001';

const evento = (parcial: Partial<EventoRegistrado>): EventoRegistrado => ({
  id: parcial.id ?? crypto.randomUUID(),
  copropiedadId: COP,
  ocurridoEn: parcial.ocurridoEn ?? new Date('2026-09-02T10:00:00Z'),
  tipo: parcial.tipo ?? 'ingreso',
  resultado: parcial.resultado ?? 'permitido',
  motivo: parcial.motivo ?? null,
  metodo: parcial.metodo ?? 'placa',
  personaId: parcial.personaId ?? null,
  viviendaId: parcial.viviendaId ?? null,
  zonaId: parcial.zonaId ?? null,
  dispositivoId: parcial.dispositivoId ?? 'disp-1',
  placaDetectada: parcial.placaDetectada ?? null,
  confianza: null,
  reglaAplicada: parcial.reglaAplicada ?? 'vigencia',
  versionReglas: 1,
  operadorId: parcial.operadorId ?? null,
  motivoManual: parcial.motivoManual ?? null,
  evidenciaId: null,
  decididoPorEdge: parcial.decididoPorEdge ?? false,
});

const repositorioCon = (filas: readonly EventoRegistrado[]): RepositorioEventos =>
  ({
    consultar: async () => ({ filas, siguiente: null }),
    anexar: async () => ({ tipo: 'anexado', id: 'x' }),
    porId: async () => null,
  }) as unknown as RepositorioEventos;

const rango = { desde: new Date('2026-09-01T00:00:00Z'), hasta: new Date('2026-09-30T00:00:00Z') };

describe('qué cuenta cada informe', () => {
  it('«accesos por periodo» cuenta todo lo que ocurrió', async () => {
    const r = await new GenerarInforme(
      repositorioCon([evento({}), evento({ tipo: 'denegado', resultado: 'negado' })]),
    ).ejecutar({ copropiedadId: COP, tipo: 'accesos_por_periodo', ...rango });
    expect(r.ok && r.valor.total).toBe(2);
  });

  it('«uso de zonas» cuenta SOLO lo que pasó por una zona', async () => {
    const r = await new GenerarInforme(
      repositorioCon([evento({ zonaId: 'z1' }), evento({ zonaId: null })]),
    ).ejecutar({ copropiedadId: COP, tipo: 'uso_de_zonas', ...rango });
    expect(r.ok && r.valor.total).toBe(1);
  });

  it('«auditoría de sistema» cuenta SOLO lo que decidió una persona', async () => {
    // La «bitácora de acciones del personal» del mockup no es todo el tránsito:
    // un informe de auditoría que incluye cada paso de cada residente es ruido
    // con otro nombre.
    const r = await new GenerarInforme(
      repositorioCon([
        evento({ operadorId: 'op-1', motivoManual: 'apertura manual' }),
        evento({}),
        evento({}),
      ]),
    ).ejecutar({ copropiedadId: COP, tipo: 'auditoria_de_sistema', ...rango });
    expect(r.ok && r.valor.total).toBe(1);
    expect(r.ok && r.valor.filas[0]?.detalle).toBe('apertura manual');
  });
});

describe('lo que el informe dice de sí mismo', () => {
  it('«visitantes frecuentes» DECLARA que no distingue residente de visitante', async () => {
    const r = await new GenerarInforme(repositorioCon([evento({ personaId: 'p1' })])).ejecutar({
      copropiedadId: COP,
      tipo: 'visitantes_frecuentes',
      ...rango,
    });
    expect(r.ok && r.valor.notas).toHaveLength(1);
    expect(r.ok && r.valor.notas[0]).toMatch(/no si era residente o visitante/);
  });

  it('los demás informes no arrastran notas que no les tocan', async () => {
    const r = await new GenerarInforme(repositorioCon([evento({})])).ejecutar({
      copropiedadId: COP,
      tipo: 'accesos_por_periodo',
      ...rango,
    });
    expect(r.ok && r.valor.notas).toEqual([]);
  });
});

describe('la frecuencia se agrupa por semana ISO', () => {
  it('dos días de la misma semana caen en el mismo punto', async () => {
    const r = await new GenerarInforme(
      repositorioCon([
        evento({ ocurridoEn: new Date('2026-09-01T10:00:00Z') }),
        evento({ ocurridoEn: new Date('2026-09-04T10:00:00Z') }),
      ]),
    ).ejecutar({ copropiedadId: COP, tipo: 'accesos_por_periodo', ...rango });
    expect(r.ok && r.valor.frecuencia).toHaveLength(1);
    expect(r.ok && r.valor.frecuencia[0]?.total).toBe(2);
  });

  it('el punto es el LUNES de la semana, también cuando el evento cae en domingo', async () => {
    // Domingo 2026-09-06 pertenece a la semana que empieza el lunes 31/08.
    const r = await new GenerarInforme(
      repositorioCon([evento({ ocurridoEn: new Date('2026-09-06T23:00:00Z') })]),
    ).ejecutar({ copropiedadId: COP, tipo: 'accesos_por_periodo', ...rango });
    expect(r.ok && r.valor.frecuencia[0]?.semana).toBe('2026-08-31');
  });

  it('los puntos salen ordenados en el tiempo', async () => {
    const r = await new GenerarInforme(
      repositorioCon([
        evento({ ocurridoEn: new Date('2026-09-15T10:00:00Z') }),
        evento({ ocurridoEn: new Date('2026-09-02T10:00:00Z') }),
      ]),
    ).ejecutar({ copropiedadId: COP, tipo: 'accesos_por_periodo', ...rango });
    const semanas = r.ok ? r.valor.frecuencia.map((p) => p.semana) : [];
    expect(semanas).toEqual([...semanas].sort());
  });
});

describe('el rango lo valida el DOMINIO, no este caso de uso', () => {
  it('un rango invertido se rechaza con el error del filtro', async () => {
    const r = await new GenerarInforme(repositorioCon([])).ejecutar({
      copropiedadId: COP,
      tipo: 'accesos_por_periodo',
      desde: new Date('2026-09-30T00:00:00Z'),
      hasta: new Date('2026-09-01T00:00:00Z'),
    });
    expect(r.ok).toBe(false);
  });
});
