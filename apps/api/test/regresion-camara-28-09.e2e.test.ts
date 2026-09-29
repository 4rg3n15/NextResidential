import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import {
  aperturasFisicasPor,
  capacidadesDescubiertas,
  crearProveedorDeEquipos,
  equiposSimulados,
  sobreDeLectura,
} from '@ncr/providers';
import type { FuenteDePlacas } from '@ncr/providers';
import type { ContextoTenant } from '../src/autenticacion';
import { RegistroDeEquiposPg } from '../src/equipos';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { FUENTE_DE_PLACAS, PROVEEDOR_DE_EQUIPOS } from '../src/proveedores';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * REGRESIÓN · EL FLUJO DE LA CÁMARA DEL 28/09/2026, POR LA API
 *
 * Lectura de placa → `POST /alarm-server/<secreto>` (el sobre multipart tal
 * como lo emite el firmware) → decisión del motor → `AccionadorPorProveedor`
 * → adaptador del fabricante → control de barrera → Digest → la orden de
 * apertura en la cámara → evento. Es la única ruta verificada con
 * hardware, y la ETAPA 15-M toca la ingesta y el cliente Digest que hay
 * debajo: esta suite se escribió ANTES y sus aserciones no cambian.
 *
 * La cámara es la simulada del paquete de proveedores, dada de alta en el
 * REGISTRO como en la consola, con el adaptador real delante: el oráculo es
 * `aperturasFisicasPor`, el relé de la simulada, no la respuesta HTTP.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();
const ADMIN = '00000000-0000-4000-8000-000000000010';
const LLAVE = 'llave-de-equipos-solo-para-pruebas-32+';
const HOST = `camara-28-09-${CORRIDA.toLowerCase()}.invalid`;
const CLAVE = 'clave-de-la-camara-simulada';
const SECRETO = 'a'.repeat(48);
const ORIGEN_DEL_BANCO = '127.0.0.1,::1';
const PLACA = `R${CORRIDA.slice(0, 5)}`;

const ctxAdmin = (): ContextoTenant => ({
  usuarioId: ADMIN,
  rol: 'administrador',
  copropiedadId: COP_A,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});

describe('regresión 28/09 · lectura → servidor de alarma → decisión → relé → evento', () => {
  let pool: Pool | undefined;
  let app: INestApplication | undefined;
  let camaraId = '';
  let admin = '';
  // H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
  exigirBase('sin DATABASE_URL_PRUEBAS', () => app !== undefined);
  const servidor = () => (app as INestApplication).getHttpServer();
  const relé = () => aperturasFisicasPor.get(HOST) ?? 0;

  const publicar = (placa: string, referencia: string) => {
    const sobre = sobreDeLectura({ placa, confianza: 91, referencia });
    return request(servidor())
      .post(`/alarm-server/${SECRETO}`)
      .set('content-type', sobre.tipoDeContenido)
      .send(sobre.cuerpo);
  };

  beforeAll(async () => {
    if (URL_BASE === undefined || URL_BASE === '') return;
    pool = new Pool({ connectionString: URL_BASE, max: 4 });
    const equipos = new RepositorioDeEquiposPg(pool, LLAVE, 'env:EQUIPOS_LLAVE');
    const creada = await equipos.crear(
      ctxAdmin(),
      COP_A,
      {
        nombre: `Cámara de entrada ${CORRIDA}`,
        tipo: 'camara_lpr',
        host: HOST,
        puerto: 80,
        protocolo: 'http',
        usuario: 'servicio',
        secreto: CLAVE,
      },
      {
        clase: 'alcanzado',
        detalle: 'responde',
        modelo: 'DS-TCG405-E',
        firmware: 'V5.4.0',
        latenciaMs: 1,
        verificado: true,
        capacidades: capacidadesDescubiertas({ aperturaRemota: 'si' }),
      },
    );
    camaraId = creada.id;
    const peticion = equiposSimulados({
      [HOST]: { familia: 'camara', usuario: 'servicio', clave: CLAVE },
    });
    const firmante = await crearFirmante();
    // El padrón y los eventos van a PostgreSQL, como en sitio: el banco en
    // memoria no tiene padrón que consultar.
    app = await crearApp(
      firmante,
      (b) =>
        b.overrideProvider(PROVEEDOR_DE_EQUIPOS).useFactory({
          inject: [FUENTE_DE_PLACAS, BITACORA, RELOJ],
          factory: (fuente: FuenteDePlacas, bitacora: Bitacora, r: Reloj) =>
            crearProveedorDeEquipos({
              clase: 'hikvision', // kpi-11-exento: nombre del adaptador que se compone
              registro: new RegistroDeEquiposPg(pool as Pool, LLAVE),
              peticion,
              fuente,
              reloj: r,
              traza: bitacora,
            }),
        }),
      {
        PROVEEDOR_DE_EQUIPOS: 'simulado',
        ALARM_SERVER_EQUIPOS: `${COP_A}|${camaraId}|${SECRETO}|${ORIGEN_DEL_BANCO}`,
        CARGADOR_DE_CONTEXTO: 'postgres',
        PERSISTENCIA_DE_EVENTOS: 'postgres',
        DATABASE_URL: URL_BASE,
        DATABASE_POOLER_URL: URL_BASE,
        EQUIPOS_LLAVE: LLAVE,
      },
      { repositorio: equipos },
    );
    admin = await tokenDe(firmante, { rol: 'administrador', usuarioId: ADMIN });

    const vivienda = await request(servidor())
      .post(`/copropiedades/${COP_A}/padron/viviendas`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ identificador: `R28-${CORRIDA}` })
      .expect(201);
    await request(servidor())
      .post(`/copropiedades/${COP_A}/padron/vehiculos`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ viviendaId: vivienda.body.id, placa: PLACA })
      .expect(201);
  });
  afterAll(async () => {
    if (pool !== undefined && camaraId !== '') {
      await new RepositorioDeEquiposPg(pool, LLAVE, 'env:EQUIPOS_LLAVE')
        .desactivar(ctxAdmin(), COP_A, camaraId, 'fin de la regresión de la cámara')
        .catch(() => undefined);
    }
    await app?.close();
    await pool?.end();
  });

  it('una placa del padrón: 200, aceptado, y el relé de ESA cámara se acciona una vez', async () => {
    if (app === undefined) return;
    const antes = relé();
    const r = await publicar(PLACA, `reg-${CORRIDA}-1`).expect(200);
    expect(r.body).toMatchObject({ aceptado: true });
    expect(r.headers['connection']).toBe('close');
    expect(relé()).toBe(antes + 1);
  });

  it('la cámara reenvía el MISMO hecho: 200 y ninguna segunda apertura (RN-17)', async () => {
    if (app === undefined) return;
    const antes = relé();
    await publicar(PLACA, `reg-${CORRIDA}-1`).expect(200);
    expect(relé()).toBe(antes);
  });

  it('una placa desconocida: 200 (la cámara no reintenta) y el relé NO se mueve', async () => {
    if (app === undefined) return;
    const antes = relé();
    const r = await publicar('NADIE00', `reg-${CORRIDA}-2`).expect(200);
    expect(r.body).toMatchObject({ aceptado: true });
    expect(relé()).toBe(antes);
  });

  it('un secreto distinto: 401 sin decir qué falló', async () => {
    if (app === undefined) return;
    const sobre = sobreDeLectura({ placa: PLACA, referencia: `reg-${CORRIDA}-3` });
    const r = await request(servidor())
      .post(`/alarm-server/${'b'.repeat(48)}`)
      .set('content-type', sobre.tipoDeContenido)
      .send(sobre.cuerpo)
      .expect(401);
    expect(JSON.stringify(r.body)).not.toMatch(/secreto|origen|equipo/i);
  });

  it('el evento de la lectura queda en el historial, atribuido a ESA cámara', async () => {
    if (app === undefined) return;
    const ahora = Date.now();
    const desde = new Date(ahora - 3_600_000).toISOString();
    const hasta = new Date(ahora + 3_600_000).toISOString();
    const r = await request(servidor())
      .get(
        `/copropiedades/${COP_A}/eventos?desde=${encodeURIComponent(desde)}` +
          `&hasta=${encodeURIComponent(hasta)}&dispositivoId=${camaraId}&tamanoPagina=50`,
      )
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const eventos = r.body.filas as { dispositivoId?: string; placa?: string }[];
    expect(Array.isArray(eventos)).toBe(true);
    expect(eventos.length).toBeGreaterThanOrEqual(1);
    for (const e of eventos) expect(e.dispositivoId).toBe(camaraId);
  });
});
