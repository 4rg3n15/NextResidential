import { describe, expect, it } from 'vitest';
import { constanciaDeAccionamiento } from './accionamiento-del-edge';
import type { AccesoAccionado, AccionamientoDelEdge } from './accionamiento-del-edge';
import type { GatewayRegistrado } from './puertos';

/**
 * 15-Q · Q4 · lo que el Edge hizo con el equipo sin WAN queda en la línea de
 * tiempo con la misma forma que la constancia de la nube, el instante REAL del
 * Edge y una clave de idempotencia propia y estable (RN-17).
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = 'd0000001-0000-4000-8000-000000000001';
const EVENTO = 'e0000001-0000-4000-8000-000000000001';
const gateway: GatewayRegistrado = {
  id: 'a0000001-0000-4000-8000-000000000001',
  copropiedadId: COP,
  nombre: 'Edge portería',
  usuarioServicioId: '00000000-0000-4000-8000-000000000003',
  credencialRef: 'env:INGESTA_FIRMA_SECRETO/g1',
  activo: true,
};

const acceso = (
  a: Partial<AccionamientoDelEdge> = {},
  referenciaExterna = 'hecho-edge-0001',
): AccesoAccionado => ({
  copropiedadId: COP,
  dispositivoId: EQUIPO,
  referenciaExterna,
  accionamiento: {
    tipo: 'apertura',
    estado: 'aceptada',
    latenciaMs: 420,
    ocurridoEn: '2026-10-02T03:15:00.000Z',
    ...a,
  },
});

describe('constanciaDeAccionamiento (15-Q, Q4)', () => {
  it('apertura aceptada: «apertura ordenada» con el instante del Edge y su actor', () => {
    const c = constanciaDeAccionamiento(acceso(), gateway, EVENTO);
    expect(c).toEqual({
      copropiedadId: COP,
      dispositivoId: EQUIPO,
      tipo: 'apertura_ordenada',
      titulo: 'Apertura ordenada por el Edge sin WAN: el equipo la aceptó',
      codigoMayor: null,
      codigoMenor: null,
      origen: 'plataforma',
      enVivo: true,
      ocurridoEn: new Date('2026-10-02T03:15:00.000Z'),
      horaDelEquipo: null,
      eventoId: EVENTO,
      claveIdempotencia: `${COP}:${EQUIPO}:plataforma:hecho-edge-0001.edge-apertura`,
      carga: {
        estado: 'aceptada',
        motivo: null,
        latenciaMs: 420,
        actor: 'Edge «Edge portería» (contingencia sin WAN)',
        edgeId: gateway.id,
      },
      creadoPor: gateway.usuarioServicioId,
    });
  });

  it('veredicto rechazado con motivo: resultado de verificación, con el motivo en el título', () => {
    const c = constanciaDeAccionamiento(
      acceso({ tipo: 'veredicto', estado: 'rechazada', motivo: 'rostro no reconocido' }),
      gateway,
      null,
    );
    expect(c).toMatchObject({
      tipo: 'resultado_de_verificacion',
      titulo:
        'Veredicto del Edge a la terminal sin WAN: el equipo la rechazó — rostro no reconocido',
      eventoId: null,
      carga: { estado: 'rechazada', motivo: 'rostro no reconocido' },
    });
  });

  it('el equipo inalcanzable se dice como tal', () => {
    const c = constanciaDeAccionamiento(acceso({ estado: 'inalcanzable' }), gateway, null);
    expect(c?.titulo).toBe('Apertura ordenada por el Edge sin WAN: el equipo no respondió');
  });

  it('RN-17 · la clave es estable entre reenvíos y distinta por tipo de accionamiento', () => {
    const una = constanciaDeAccionamiento(acceso(), gateway, EVENTO);
    const otra = constanciaDeAccionamiento(
      acceso({ ocurridoEn: '2026-10-02T03:16:00Z' }),
      gateway,
      null,
    );
    const veredicto = constanciaDeAccionamiento(acceso({ tipo: 'veredicto' }), gateway, EVENTO);
    expect(otra?.claveIdempotencia).toBe(una?.claveIdempotencia);
    expect(veredicto?.claveIdempotencia).not.toBe(una?.claveIdempotencia);
  });

  it('el título se recorta a 200 caracteres', () => {
    const c = constanciaDeAccionamiento(acceso({ motivo: 'x'.repeat(400) }), gateway, null);
    expect(c?.titulo).toHaveLength(200);
  });

  it('sin clave admisible no se escribe nada (se duplicaría en cada reenvío)', () => {
    expect(constanciaDeAccionamiento(acceso({}, 'con espacios'), gateway, null)).toBeNull();
  });

  it('E7 (15-R, C-55) · una referencia válida de 115+ caracteres ya deja constancia, estable', () => {
    const c = (n: number) => constanciaDeAccionamiento(acceso({}, 'r'.repeat(n)), gateway, null);
    expect(c(120)?.claveIdempotencia).toMatch(/:h-[0-9a-f]{64}\.edge-apertura$/);
    expect(c(114)?.claveIdempotencia).toMatch(/:r{114}\.edge-apertura$/); // la de siempre
  });
});
