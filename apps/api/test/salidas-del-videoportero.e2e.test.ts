import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import {
  RegistroEnMemoria,
  crearProveedorDeEquipos,
  equiposSimulados,
  puertasAbiertasPor,
} from '@ncr/providers';
import type { FuenteDePlacas } from '@ncr/providers';
import { FUENTE_DE_PLACAS, PROVEEDOR_DE_EQUIPOS } from '../src/proveedores';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3/P5 · LAS PUERTAS DEL VIDEOPORTERO, DE PUNTA A PUNTA
 *
 * La API real (guardas, aislamiento, casos de uso, DTO) con el proveedor real
 * contra un videoportero SIMULADO que declara dos cerraduras como lo hace la
 * familia del manual. El administrador descubre y nombra; la guardia abre
 * CADA salida descubierta con motivo, atribuida y auditada, y se mide cuánto
 * tarda (KPI-32, CA-20: < 3 s). El oráculo de qué puerta se movió es lo que
 * el simulado HIZO (`puertasAbiertasPor`), no lo que la API dijo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const PORTERIA_A = '70000000-0000-4000-8000-000000000001';
const RELE_A = '00000000-0000-4000-8000-0000000000ff';
const HOST = 'portero-15p.invalid';
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-del-videoportero-simulado' } as const;
const MOTIVO = 'Visitante anunciado por el residente de la casa 4';

let app: INestApplication;
let firmante: Firmante;
const latenciasMs: number[] = [];

const como = async (
  rol: 'administrador' | 'operador_central' | 'portero' | 'superadministrador',
  cop: string = COP_A,
) =>
  `Bearer ${await tokenDe(firmante, rol === 'operador_central' ? { rol, copropiedadId: null, copropiedades: [cop] } : { rol, copropiedadId: cop })}`;

const abiertas = () => puertasAbiertasPor.get(HOST) ?? [];

beforeAll(async () => {
  firmante = await crearFirmante();
  const registro = new RegistroEnMemoria();
  registro.registrar({
    dispositivoId: PORTERIA_A,
    tipo: 'intercom',
    host: HOST,
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    numeroDePuerta: 1,
    canalDeAudioHabilitado: true,
  });
  const peticion = equiposSimulados({
    [HOST]: { familia: 'videoportero', ...CREDENCIAL, salidas: { puertas: 2, cerraduras: true } },
  });
  app = await crearApp(firmante, (b) =>
    b.overrideProvider(PROVEEDOR_DE_EQUIPOS).useFactory({
      inject: [FUENTE_DE_PLACAS, BITACORA, RELOJ],
      factory: (fuente: FuenteDePlacas, bitacora: Bitacora, reloj: Reloj) =>
        crearProveedorDeEquipos({
          clase: 'hikvision', // kpi-11-exento: nombre del adaptador que se compone
          registro,
          fuente,
          reloj,
          traza: bitacora,
          peticion,
        }),
    }),
  );
});
afterAll(async () => {
  await app?.close();
  if (latenciasMs.length > 0) {
    // Para el informe: la cifra sale de aquí, no se afirma.
    console.log(
      `[15-P · KPI-32] apertura por punto contra el simulado: ${latenciasMs.map((l) => `${String(l)} ms`).join(', ')}`,
    );
  }
});

const ruta = (cop: string, equipo: string, resto: string) =>
  `/copropiedades/${cop}/equipos/${equipo}/${resto}`;

describe('administración · descubrir y nombrar', () => {
  it('el árbol que el equipo declara: equipo → módulo → dos cerraduras', async () => {
    const r = await request(app.getHttpServer())
      .get(ruta(COP_A, PORTERIA_A, 'salidas'))
      .set('Authorization', await como('administrador'));
    expect(r.status).toBe(200);
    expect(r.body.motivoSinArbol).toBeNull();
    const nodos = r.body.arbol as { nivel: number; tipo: string; nombre: string }[];
    expect(nodos.map((n) => [n.nivel, n.tipo])).toEqual([
      [1, 'equipo'],
      [2, 'modulo'],
      [3, 'salida'],
      [3, 'salida'],
    ]);
    expect(nodos.filter((n) => n.tipo === 'salida').map((n) => n.nombre)).toEqual([
      'Cerradura 1',
      'Cerradura 2',
    ]);
    // Nada en el cuerpo delata cómo se llega al equipo: ni dirección, ni clave, ni rutas.
    expect(JSON.stringify(r.body)).not.toMatch(
      new RegExp(`${HOST}|${CREDENCIAL.clave}|RemoteControl|AccessControl`, 'i'),
    );
  });

  it('descubrir persiste dos puntos; renombrar cambia lo que verá la guardia', async () => {
    const admin = await como('administrador');
    const d = await request(app.getHttpServer())
      .post(ruta(COP_A, PORTERIA_A, 'salidas/descubrir'))
      .set('Authorization', admin);
    expect(d.status).toBe(200);
    const puntos = d.body.puntos as { id: string; numeroDePuerta: number }[];
    expect(puntos.map((p) => p.numeroDePuerta)).toEqual([1, 2]);
    const r = await request(app.getHttpServer())
      .patch(ruta(COP_A, PORTERIA_A, `salidas/${puntos[1]?.id ?? ''}`))
      .set('Authorization', admin)
      .send({ nombre: 'Portón vehicular' });
    expect(r.status).toBe(200);
    expect(r.body.nombre).toBe('Portón vehicular');
  });

  it('el portero no descubre (403); un relé no tiene árbol (400); otra copropiedad, 404', async () => {
    const portero = await request(app.getHttpServer())
      .post(ruta(COP_A, PORTERIA_A, 'salidas/descubrir'))
      .set('Authorization', await como('portero'));
    expect(portero.status).toBe(403);
    const rele = await request(app.getHttpServer())
      .get(ruta(COP_A, RELE_A, 'salidas'))
      .set('Authorization', await como('administrador'));
    expect(rele.status).toBe(400);
    expect(JSON.stringify(rele.body)).toMatch(/Sólo el videoportero/);
    const ajeno = await request(app.getHttpServer())
      .get(ruta(COP_B, PORTERIA_A, 'puntos'))
      .set('Authorization', await como('administrador', COP_B));
    expect(ajeno.status).toBe(404);
  });

  it('un nombre que no se ve no vale', async () => {
    const admin = await como('administrador');
    const lista = await request(app.getHttpServer())
      .get(ruta(COP_A, PORTERIA_A, 'puntos'))
      .set('Authorization', admin);
    const r = await request(app.getHttpServer())
      .patch(ruta(COP_A, PORTERIA_A, `salidas/${String(lista.body.puntos[0].id)}`))
      .set('Authorization', admin)
      .send({ nombre: ' '.repeat(5) });
    expect(r.status).toBe(400);
  });
});

describe('guardia · abrir cada salida descubierta, con motivo y < 3 s', () => {
  it('cada punto abre SU puerta, atribuido al operador, y queda en el historial', async () => {
    const operador = await como('operador_central');
    const lista = await request(app.getHttpServer())
      .get(ruta(COP_A, PORTERIA_A, 'puntos'))
      .set('Authorization', operador);
    expect(lista.status).toBe(200);
    const puntos = lista.body.puntos as { id: string; nombre: string; numeroDePuerta: number }[];
    expect(puntos.map((p) => p.nombre)).toEqual(['Cerradura 1', 'Portón vehicular']);
    const antes = abiertas().length;
    for (const punto of [...puntos].reverse()) {
      const inicio = performance.now();
      const r = await request(app.getHttpServer())
        .post(`/copropiedades/${COP_A}/guardia/ordenes`)
        .set('Authorization', operador)
        .send({ dispositivoId: PORTERIA_A, accion: 'abrir', motivo: MOTIVO, puntoId: punto.id });
      latenciasMs.push(Math.round(performance.now() - inicio));
      expect(r.status).toBe(201);
      expect(r.body.resultado).toBe('aceptada');
      expect(r.body.punto).toEqual({
        id: punto.id,
        nombre: punto.nombre,
        numeroDePuerta: punto.numeroDePuerta,
      });
      expect(r.body.rol).toBe('operador_central');
    }
    expect(abiertas().slice(antes)).toEqual([2, 1]);
    expect(Math.max(...latenciasMs)).toBeLessThan(3000);
    const historial = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/guardia/ordenes`)
      .set('Authorization', operador);
    expect(historial.body.ordenes[0].punto.nombre).toBe('Cerradura 1');
    expect(historial.body.ordenes[1].punto.nombre).toBe('Portón vehicular');
  });

  it('sin motivo NO se abre (RN-08, CA-16): 400 y la puerta quieta', async () => {
    const operador = await como('operador_central');
    const lista = await request(app.getHttpServer())
      .get(ruta(COP_A, PORTERIA_A, 'puntos'))
      .set('Authorization', operador);
    const antes = abiertas().length;
    const r = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/guardia/ordenes`)
      .set('Authorization', operador)
      .send({
        dispositivoId: PORTERIA_A,
        accion: 'abrir',
        motivo: '',
        puntoId: lista.body.puntos[0].id,
      });
    expect(r.status).toBe(400);
    expect(abiertas().length).toBe(antes);
  });

  it('un punto que no es de este equipo: 404 y la puerta quieta', async () => {
    const antes = abiertas().length;
    const r = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/guardia/ordenes`)
      .set('Authorization', await como('operador_central'))
      .send({
        dispositivoId: PORTERIA_A,
        accion: 'abrir',
        motivo: MOTIVO,
        puntoId: '99999999-0000-4000-8000-000000000001',
      });
    expect(r.status).toBe(404);
    expect(abiertas().length).toBe(antes);
  });

  it('KPI-35 · el operador de B no abre un punto de A, ni por su ruta ni por la de A', async () => {
    const lista = await request(app.getHttpServer())
      .get(ruta(COP_A, PORTERIA_A, 'puntos'))
      .set('Authorization', await como('operador_central'));
    const deB = await como('operador_central', COP_B);
    const antes = abiertas().length;
    for (const cop of [COP_A, COP_B]) {
      const r = await request(app.getHttpServer())
        .post(`/copropiedades/${cop}/guardia/ordenes`)
        .set('Authorization', deB)
        .send({
          dispositivoId: PORTERIA_A,
          accion: 'abrir',
          motivo: MOTIVO,
          puntoId: lista.body.puntos[0].id,
        });
      expect([403, 404]).toContain(r.status);
    }
    expect(abiertas().length).toBe(antes);
  });

  it('R1 · sin punto, la orden abre la puerta de la ficha como hasta ahora', async () => {
    const antes = abiertas().length;
    const r = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/guardia/ordenes`)
      .set('Authorization', await como('operador_central'))
      .send({ dispositivoId: PORTERIA_A, accion: 'abrir', motivo: MOTIVO });
    expect(r.status).toBe(201);
    expect(r.body.punto).toBeNull();
    expect(abiertas().slice(antes)).toEqual([1]);
  });
});
