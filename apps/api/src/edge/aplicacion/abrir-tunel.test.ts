import { describe, expect, it } from 'vitest';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { RUTA_DEL_TUNEL, SesionDeTunel, enlacesEnMemoria } from '@ncr/providers';
import type { Hola } from '@ncr/providers';
import { AuditoriaEnMemoria } from '../../comun/auditoria/auditoria-en-memoria';
import { TunelesDeEdge } from '../../proveedores';
import { AuditoriaDelTunelEnMemoria } from '../infraestructura/auditoria-del-tunel';
import { GatewaysEnMemoria } from '../infraestructura/edge-en-memoria';
import { PuentesEnMemoria } from '../infraestructura/puentes-en-memoria';
import { referenciaDeGeneracion } from '../infraestructura/referencia-de-credencial';
import { AbrirTunel, CIERRE } from './abrir-tunel';
import { AcreditarEdge } from './acreditar-edge';
import { derivarCredencial, firmarSolicitud, solicitudCanonica } from './credencial-del-edge';
import type { GatewayRegistrado } from './puertos';

/**
 * 15-Q2 · A1 · quién abre el túnel: la identidad de la 15-Q, el nonce, el
 * puente y UNO por copropiedad. El segundo se rechaza y queda auditado.
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
  const puentes = new PuentesEnMemoria();
  const auditoria = new AuditoriaEnMemoria();
  const delTunel = new AuditoriaDelTunelEnMemoria();
  const tuneles = new TunelesDeEdge();
  const acreditar = new AcreditarEdge(gateways, auditoria, bitacora, reloj, {
    maestra: MAESTRA,
    ventanaSegundos: 300,
  });
  const abrir = new AbrirTunel(acreditar, puentes, delTunel, tuneles, reloj, bitacora, 300);
  const alta = (copropiedadId: string, n: number, puente = true): GatewayRegistrado => {
    const g: GatewayRegistrado = {
      id: `a000000${String(n)}-0000-4000-8000-000000000001`,
      copropiedadId,
      nombre: `Edge ${String(n)}`,
      usuarioServicioId: '00000000-0000-4000-8000-000000000003',
      credencialRef: referenciaDeGeneracion(1),
      activo: true,
    };
    gateways.gateways.set(g.id, g);
    puentes.alta(copropiedadId, g.id, g.nombre);
    if (puente) void puentes.marcar(null, copropiedadId, g.id, true, AHORA);
    return g;
  };
  return { abrir, alta, tuneles, delTunel, auditoria, lineas };
};

let nonces = 0;
const hola = (
  g: GatewayRegistrado,
  cambios: Partial<Hola> & { credencial?: string } = {},
): Hola => {
  nonces += 1;
  const nonce = cambios.nonce ?? `nonce-de-prueba-${String(nonces).padStart(6, '0')}`;
  const marca = String(Math.floor(AHORA.getTime() / 1000));
  const credencial =
    cambios.credencial ??
    derivarCredencial(MAESTRA, {
      copropiedadId: g.copropiedadId,
      edgeId: g.id,
      credencialRef: g.credencialRef,
    });
  return {
    v: 1,
    t: 'hola',
    edgeId: g.id,
    copropiedadId: g.copropiedadId,
    marca,
    nonce,
    firma: firmarSolicitud(credencial, marca, solicitudCanonica('GET', RUTA_DEL_TUNEL, nonce)),
    ...cambios,
  };
};

const sesion = () => new SesionDeTunel(enlacesEnMemoria()[0], { paridad: 'par' });

describe('AbrirTunel (15-Q2, A1)', () => {
  it('el puente acreditado entra, y su túnel queda como el de su copropiedad', async () => {
    const m = montar();
    const g = m.alta(COP_A, 1);
    const r = await m.abrir.abrir(hola(g), sesion);
    expect(r.abierto).toBe(true);
    expect(m.tuneles.estadoDe(COP_A)).toMatchObject({ conectado: true, edgeId: g.id });
    expect(m.tuneles.conectados).toBe(1);
  });

  it('firma con otra credencial (otra generación): no acreditado, y no se audita como cruce', async () => {
    const m = montar();
    const g = m.alta(COP_A, 1);
    const r = await m.abrir.abrir(hola(g, { credencial: 'x'.repeat(64) }), sesion);
    expect(r).toMatchObject({ abierto: false, codigo: CIERRE.NO_ACREDITADO });
    expect(m.delTunel.rechazos).toEqual([]);
  });

  it('RN-15 · un Edge que dice servir OTRA copropiedad: 404, y queda en la auditoría', async () => {
    const m = montar();
    const g = m.alta(COP_A, 1);
    const r = await m.abrir.abrir(hola(g, { copropiedadId: COP_B }), sesion);
    expect(r).toMatchObject({ abierto: false, codigo: CIERRE.NO_ENCONTRADO });
    expect(m.auditoria.registros).toHaveLength(1);
  });

  it('el mismo hola dos veces: el nonce repetido no abre un segundo túnel', async () => {
    const m = montar();
    const g = m.alta(COP_A, 1);
    const capturado = hola(g);
    expect((await m.abrir.abrir(capturado, sesion)).abierto).toBe(true);
    const r = await m.abrir.abrir(capturado, sesion);
    expect(r).toMatchObject({ abierto: false, codigo: CIERRE.NO_ACREDITADO });
    expect(m.lineas).toContain('túnel del Edge: nonce repetido');
  });

  it('un Edge acreditado que NO es el puente: 4403 y auditado', async () => {
    const m = montar();
    const g = m.alta(COP_A, 1, false);
    const r = await m.abrir.abrir(hola(g), sesion);
    expect(r).toMatchObject({ abierto: false, codigo: CIERRE.NO_ES_PUENTE });
    expect(m.delTunel.rechazos).toEqual([expect.objectContaining({ motivo: 'NO_ES_PUENTE' })]);
  });

  it('A1 · un segundo túnel para la misma copropiedad se rechaza y se audita; el primero sigue', async () => {
    const m = montar();
    const g = m.alta(COP_A, 1);
    expect((await m.abrir.abrir(hola(g), sesion)).abierto).toBe(true);
    const segunda = sesion();
    const r = await m.abrir.abrir(hola(g), () => segunda);
    expect(r).toMatchObject({ abierto: false, codigo: CIERRE.YA_CONECTADO });
    expect(segunda.estaAbierta).toBe(false);
    expect(m.delTunel.rechazos).toEqual([
      expect.objectContaining({ motivo: 'YA_CONECTADO', edgeId: g.id, copropiedadId: COP_A }),
    ]);
    expect(m.tuneles.conectados).toBe(1);
  });

  it('cuando el primero se cae, el siguiente entra', async () => {
    const m = montar();
    const g = m.alta(COP_A, 1);
    const r = await m.abrir.abrir(hola(g), sesion);
    if (!r.abierto) throw new Error('debía abrir');
    r.tunel.sesion.cerrar(1000, 'fin');
    m.tuneles.liberar(r.tunel, AHORA);
    expect(m.tuneles.estadoDe(COP_A)).toMatchObject({ conectado: false, desde: AHORA });
    expect((await m.abrir.abrir(hola(g), sesion)).abierto).toBe(true);
  });
});
