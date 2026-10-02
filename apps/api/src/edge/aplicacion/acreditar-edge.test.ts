import { describe, expect, it } from 'vitest';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { AuditoriaEnMemoria } from '../../comun/auditoria/auditoria-en-memoria';
import { GatewaysEnMemoria } from '../infraestructura/edge-en-memoria';
import {
  referenciaDeGeneracion,
  siguienteReferencia,
} from '../infraestructura/referencia-de-credencial';
import { AcreditarEdge } from './acreditar-edge';
import type { SolicitudDelEdge } from './acreditar-edge';
import { derivarCredencial, firmarSolicitud, solicitudCanonica } from './credencial-del-edge';
import type { GatewayRegistrado } from './puertos';

/**
 * 15-Q · Q1/Q5 · la identidad del Edge, en la capa de aplicación.
 *
 * Lo que se demuestra: cada Edge firma con SU credencial (derivada, con su
 * copropiedad dentro), la firma cubre método y ruta, la ventana se respeta, el
 * Edge de baja no entra y el que pide otra copropiedad recibe 404 y queda en la
 * auditoría de seguridad — sólo si estaba acreditado.
 */
const MAESTRA = 'm'.repeat(48);
const COP_A = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';
const AHORA = new Date('2026-10-02T12:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };

const montar = () => {
  const lineas: string[] = [];
  const bitacora: Bitacora = { registrar: (_n, mensaje) => void lineas.push(mensaje) };
  const gateways = new GatewaysEnMemoria();
  const auditoria = new AuditoriaEnMemoria();
  const acreditar = new AcreditarEdge(gateways, auditoria, bitacora, reloj, {
    maestra: MAESTRA,
    ventanaSegundos: 300,
  });
  const alta = (copropiedadId: string, activo = true): GatewayRegistrado => {
    const g: GatewayRegistrado = {
      id: `aa${String(gateways.gateways.size)}00000-0000-4000-8000-000000000001`.slice(-36),
      copropiedadId,
      nombre: 'Portería',
      usuarioServicioId: '00000000-0000-4000-8000-000000000003',
      credencialRef: referenciaDeGeneracion(1),
      activo,
    };
    gateways.gateways.set(g.id, g);
    return g;
  };
  return { acreditar, auditoria, lineas, alta, gateways };
};

const firmada = (
  g: GatewayRegistrado,
  cambios: Partial<SolicitudDelEdge> & { credencial?: string; marcaEn?: Date } = {},
): SolicitudDelEdge => {
  const metodo = cambios.metodo ?? 'GET';
  const ruta = cambios.ruta ?? `/copropiedades/${g.copropiedadId}/reglas/instantanea?desde=0`;
  const cuerpo = cambios.cuerpo ?? '';
  const marca = String(Math.floor((cambios.marcaEn ?? AHORA).getTime() / 1000));
  const credencial =
    cambios.credencial ??
    derivarCredencial(MAESTRA, {
      copropiedadId: g.copropiedadId,
      edgeId: g.id,
      credencialRef: g.credencialRef,
    });
  return {
    edgeId: g.id,
    marca,
    firma: firmarSolicitud(credencial, marca, solicitudCanonica(metodo, ruta, cuerpo)),
    metodo,
    ruta,
    cuerpo,
    copropiedadSolicitada: g.copropiedadId,
    ...cambios,
  };
};

describe('AcreditarEdge (15-Q, Q1)', () => {
  it('el Edge firmado con SU credencial y pidiendo SU copropiedad entra', async () => {
    const { acreditar, alta } = montar();
    const g = alta(COP_A);
    expect(await acreditar.acreditar(firmada(g))).toEqual({ acreditado: true, gateway: g });
  });

  it('sin identidad, o con una que no es UUID, 401 y a la bitácora', async () => {
    const { acreditar, alta, lineas } = montar();
    const g = alta(COP_A);
    for (const edgeId of [undefined, 'no-es-uuid']) {
      expect(await acreditar.acreditar({ ...firmada(g), edgeId })).toMatchObject({
        acreditado: false,
        estado: 401,
        motivo: 'SIN_IDENTIDAD',
      });
    }
    expect(lineas).toContain('petición del Edge rechazada');
  });

  it('un Edge desconocido o dado de baja no entra', async () => {
    const { acreditar, alta } = montar();
    const deBaja = alta(COP_A, false);
    expect(await acreditar.acreditar(firmada(deBaja))).toMatchObject({ motivo: 'EDGE_INACTIVO' });
    const fantasma = { ...deBaja, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' };
    expect(await acreditar.acreditar(firmada(fantasma))).toMatchObject({
      motivo: 'EDGE_DESCONOCIDO',
    });
  });

  it('la credencial de OTRO Edge (o la maestra) no firma por éste', async () => {
    const { acreditar, alta } = montar();
    const a = alta(COP_A);
    const b = alta(COP_B);
    const deB = derivarCredencial(MAESTRA, {
      copropiedadId: b.copropiedadId,
      edgeId: b.id,
      credencialRef: b.credencialRef,
    });
    for (const credencial of [deB, MAESTRA]) {
      expect(await acreditar.acreditar(firmada(a, { credencial }))).toMatchObject({
        acreditado: false,
        motivo: 'FIRMA_NO_COINCIDE',
      });
    }
  });

  it('la firma cubre método y ruta: la de un GET no vale para otra ruta ni para un POST', async () => {
    const { acreditar, alta } = montar();
    const g = alta(COP_A);
    const original = firmada(g);
    expect(
      await acreditar.acreditar({ ...original, ruta: `${original.ruta.split('?')[0]}?desde=9` }),
    ).toMatchObject({ motivo: 'FIRMA_NO_COINCIDE' });
    expect(await acreditar.acreditar({ ...original, metodo: 'POST' })).toMatchObject({
      motivo: 'FIRMA_NO_COINCIDE',
    });
  });

  it('fuera de la ventana (adelantada o atrasada) y con marca ilegible, 401', async () => {
    const { acreditar, alta } = montar();
    const g = alta(COP_A);
    for (const desfase of [-301_000, 301_000]) {
      const marcaEn = new Date(AHORA.getTime() + desfase);
      expect(await acreditar.acreditar(firmada(g, { marcaEn }))).toMatchObject({
        motivo: 'FUERA_DE_VENTANA',
      });
    }
    expect(await acreditar.acreditar({ ...firmada(g), marca: 'ayer' })).toMatchObject({
      motivo: 'MARCA_INVALIDA',
    });
    expect(await acreditar.acreditar({ ...firmada(g), firma: '' })).toMatchObject({
      motivo: 'SIN_IDENTIDAD',
    });
  });

  it('RN-15 · un Edge acreditado que pide OTRA copropiedad: 404 y acceso cruzado auditado', async () => {
    const { acreditar, alta, auditoria } = montar();
    const a = alta(COP_A);
    const ruta = `/copropiedades/${COP_B}/reglas/instantanea?desde=0`;
    const r = await acreditar.acreditar({
      ...firmada(a, { ruta }),
      copropiedadSolicitada: COP_B,
    });
    expect(r).toEqual({ acreditado: false, estado: 404, motivo: 'OTRA_COPROPIEDAD' });
    expect(auditoria.registros).toEqual([
      expect.objectContaining({
        rol: 'edge',
        copropiedadSolicitada: COP_B,
        recurso: `/copropiedades/${COP_B}/reglas/instantanea`,
      }),
    ]);
  });

  it('el que pide otra copropiedad SIN firma válida no se audita: es ruido, no un tenant', async () => {
    const { acreditar, alta, auditoria } = montar();
    const a = alta(COP_A);
    await acreditar.acreditar({
      ...firmada(a),
      firma: 'f'.repeat(64),
      copropiedadSolicitada: COP_B,
    });
    expect(auditoria.registros).toEqual([]);
  });

  it('rotar cambia la credencial: la anterior deja de valer en el acto', async () => {
    const { acreditar, alta, gateways } = montar();
    const g = alta(COP_A);
    const vieja = firmada(g);
    const rotado = await gateways.rotar(
      {
        rol: 'superadministrador',
        usuarioId: 'x',
        copropiedadId: null,
        copropiedadesAtendidas: [],
        mfaVerificado: true,
      },
      COP_A,
      g.id,
    );
    expect(rotado?.credencialRef).toBe(siguienteReferencia(g.credencialRef));
    expect(await acreditar.acreditar(vieja)).toMatchObject({ motivo: 'FIRMA_NO_COINCIDE' });
    expect(await acreditar.acreditar(firmada(rotado as GatewayRegistrado))).toMatchObject({
      acreditado: true,
    });
  });
});
