import { describe, expect, it, vi } from 'vitest';
import { errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import {
  MAXIMO_DE_NOTIFICACIONES,
  VerMisNotificaciones,
  VerMisVisitasConSituacion,
  conSituacion,
  notificacionesDe,
  situacionDe,
} from './mis-notificaciones';
import type { AutorizacionDelResidente, DirectorioDelResidente } from './puertos';

/**
 * 15-L · la situación de cada visita y las notificaciones del residente se
 * derivan en el servidor, con su reloj: la app y la consola dicen lo mismo.
 */

const AHORA = new Date('2026-09-27T15:00:00Z');
const hace = (horas: number): string => new Date(AHORA.getTime() - horas * 3_600_000).toISOString();

const visita = (sobre: Partial<AutorizacionDelResidente> = {}): AutorizacionDelResidente => ({
  id: 'a-1',
  visitante: 'Ana',
  tipo: 'puntual',
  desde: hace(1),
  hasta: hace(-1),
  placa: null,
  permiteAccesoVehicular: false,
  estado: 'activa',
  acompanantes: 0,
  revocadaEn: null,
  motivoRevocacion: null,
  ...sobre,
});

const evento = (
  sobre: Partial<{
    id: string;
    ocurridoEn: string;
    resultado: string | null;
    persona: string | null;
    deVisitante: boolean;
  }> = {},
) => ({
  id: 'e-1',
  ocurridoEn: hace(2),
  resultado: 'permitido',
  persona: 'Ana',
  deVisitante: true,
  ...sobre,
});

describe('situacionDe · lo que enseña la tarjeta', () => {
  it('rechazada gana a todo; si no, vencida, programada o vigente según el reloj', () => {
    expect(situacionDe(visita({ estado: 'revocada' }), AHORA)).toBe('rechazada');
    expect(situacionDe(visita({ desde: hace(3), hasta: hace(1) }), AHORA)).toBe('vencida');
    expect(situacionDe(visita({ desde: hace(-1), hasta: hace(-2) }), AHORA)).toBe('programada');
    expect(situacionDe(visita(), AHORA)).toBe('vigente');
    // El instante exacto del fin ya no es vigente.
    expect(situacionDe(visita({ hasta: AHORA.toISOString() }), AHORA)).toBe('vencida');
  });

  it('el motivo del rechazo sólo acompaña a una rechazada, y lo interno no sale', () => {
    const rechazada = conSituacion(
      visita({ estado: 'revocada', revocadaEn: hace(1), motivoRevocacion: 'No la esperan' }),
      AHORA,
    );
    expect(rechazada).toMatchObject({ situacion: 'rechazada', motivoRechazo: 'No la esperan' });
    expect(rechazada).not.toHaveProperty('revocadaEn');
    expect(rechazada).not.toHaveProperty('motivoRevocacion');
    expect(conSituacion(visita({ motivoRevocacion: 'x' }), AHORA).motivoRechazo).toBeNull();
  });
});

describe('notificacionesDe · rechazos e ingresos, de lo más reciente a lo más antiguo', () => {
  it('un rechazo trae el motivo; un ingreso, el visitante', () => {
    const lista = notificacionesDe(
      [visita({ estado: 'revocada', revocadaEn: hace(1), motivoRevocacion: 'No la esperan' })],
      [evento({ ocurridoEn: hace(2) })],
      AHORA,
    );
    expect(lista.map((n) => n.tipo)).toEqual(['visita_rechazada', 'ingreso_de_visitante']);
    expect(lista[0]).toMatchObject({
      motivo: 'No la esperan',
      autorizacionId: 'a-1',
      id: 'rechazo-a-1',
    });
    expect(lista[1]).toMatchObject({ visitante: 'Ana', motivo: null, id: 'ingreso-e-1' });
  });

  it('no avisa de negaciones, de residentes ni de lo que tiene más de 30 días', () => {
    const lista = notificacionesDe(
      [
        visita({
          id: 'vieja',
          estado: 'revocada',
          revocadaEn: hace(24 * 31),
          motivoRevocacion: 'x',
        }),
        visita({ id: 'viva' }),
      ],
      [
        evento({ id: 'negado', resultado: 'negado' }),
        evento({ id: 'residente', deVisitante: false }),
        evento({ id: 'antiguo', ocurridoEn: hace(24 * 31) }),
      ],
      AHORA,
    );
    expect(lista).toEqual([]);
  });

  it('como mucho las 50 más recientes', () => {
    const eventos = Array.from({ length: 70 }, (_, i) =>
      evento({ id: `e-${String(i)}`, ocurridoEn: hace(i) }),
    );
    const lista = notificacionesDe([], eventos, AHORA);
    expect(lista).toHaveLength(MAXIMO_DE_NOTIFICACIONES);
    expect(lista[0]?.id).toBe('ingreso-e-0');
  });
});

describe('los casos de uso leen de SU vivienda, con el reloj del servidor', () => {
  const ctx: ContextoTenant = {
    usuarioId: 'u-1',
    rol: 'residente',
    copropiedadId: 'cop-1',
    copropiedadesAtendidas: ['cop-1'],
    mfaVerificado: false,
  };
  const AMBITO = { copropiedadId: 'cop-1', viviendaId: 'v-1' };
  const montar = () => {
    const resolver = { ejecutar: vi.fn(async () => exito({ ambito: AMBITO, vinculo: {} })) };
    const directorio = {
      autorizaciones: vi.fn(async () => [
        visita({ estado: 'revocada', revocadaEn: hace(1), motivoRevocacion: 'No la esperan' }),
      ]),
      historial: vi.fn(async () => [evento()]),
    };
    const reloj = { ahora: () => AHORA };
    return {
      resolver,
      directorio,
      notificaciones: new VerMisNotificaciones(
        resolver as unknown as ResolverMiAmbito,
        directorio as unknown as DirectorioDelResidente,
        reloj,
      ),
      visitas: new VerMisVisitasConSituacion(
        resolver as unknown as ResolverMiAmbito,
        directorio as unknown as DirectorioDelResidente,
        reloj,
      ),
    };
  };

  it('notificaciones y visitas con situación, del ámbito resuelto', async () => {
    const m = montar();
    const n = await m.notificaciones.ejecutar(ctx, 'cop-1');
    expect(n.ok && n.valor.length).toBe(2);
    expect(m.directorio.historial).toHaveBeenCalledWith(AMBITO, { periodo: 'mes', limite: 200 });
    const v = await m.visitas.ejecutar(ctx, 'cop-1');
    expect(v.ok && v.valor[0]?.situacion).toBe('rechazada');
  });

  it('sin vínculo con una vivienda, ni una cosa ni la otra', async () => {
    const m = montar();
    m.resolver.ejecutar.mockResolvedValue(
      fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'sin vivienda')) as never,
    );
    expect(esFallo(await m.notificaciones.ejecutar(ctx, 'cop-1'))).toBe(true);
    expect(esFallo(await m.visitas.ejecutar(ctx, 'cop-1'))).toBe(true);
    expect(m.directorio.autorizaciones).not.toHaveBeenCalled();
  });
});
