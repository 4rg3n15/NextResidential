import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { ResultadoAcceso } from '@ncr/domain-core';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import { MOTOR_DE_DECISION, type MotorDeDecision } from '../src/eventos/aplicacion/puertos';
import { URL_BASE, exigirBase } from './base-exigida';
import {
  revocarConsentimientoDe,
  sembrarResidenteConRostro,
  sembrarResidentesConRostro,
  sembrarRostroReconocible,
  type MotivoDeResidente,
} from './siembra-de-rostros';
import { cabecerasDelEdge } from './edge-de-prueba';
import { DecidirLocalmente } from '../../edge/src/aplicacion/decidir-localmente';
import type { InstantaneaDeReglas } from '../../edge/src/aplicacion/instantanea-de-reglas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q · RN-16, CA-21 · LA MISMA DECISIÓN EN LA NUBE Y EN EL EDGE, CON DATOS REALES
 *
 * La prueba de la ETAPA 12 (`apps/edge/test/misma-decision.test.ts`) comparaba
 * el motor consigo mismo sobre contextos fabricados. Ésta compara lo que de
 * verdad decide cada lado: la nube con su cargador contra PostgreSQL, y el Edge
 * con la instantánea que la API le SIRVE —la misma descarga que hace en sitio—.
 * Si la instantánea omite algo que el cargador lee, o el Edge arma el contexto
 * de otra manera, aquí aparece como un permiso o un motivo distinto.
 *
 * Lo que NO se compara, y por qué: la versión sellada. La nube sella v1
 * (`VersionDeReglasFija`, [SUPUESTO] S-182) y el Edge la de la instantánea
 * publicada. Es el número, no la decisión.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CAMARA = '90000000-0000-4000-8000-000000000001';
let app: INestApplication | undefined;
let plantillaPropia = '';
/** 15-S5 · la plantilla de «otro fichero»: entra en la instantánea y se revoca después. */
let plantillaAjena = '';
/** 15-S5 · una propia con el consentimiento revocado ANTES de la instantánea. */
let plantillaRevocada = '';
let residentes: Readonly<Record<MotivoDeResidente, string>> | undefined;
let instantanea: InstantaneaDeReglas | undefined;
let disponible = false;

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  plantillaPropia = await sembrarRostroReconocible(URL_BASE);
  plantillaAjena = await sembrarResidenteConRostro(URL_BASE, 'PERMITIDO');
  plantillaRevocada = await sembrarResidenteConRostro(URL_BASE, 'PERMITIDO');
  await revocarConsentimientoDe(URL_BASE, plantillaRevocada);
  residentes = await sembrarResidentesConRostro(URL_BASE);
  const firmante = await crearFirmante();
  app = await crearApp(firmante, undefined, {
    PROVEEDOR_DE_EQUIPOS: 'simulado',
    CARGADOR_DE_CONTEXTO: 'postgres',
    PERSISTENCIA_DE_EVENTOS: 'postgres',
    // Los DOS lados leen el consentimiento de la base. Con la biometría en memoria
    // la nube negaba todo rostro y la comparación pasaba sin probar nada (15-Q).
    PERSISTENCIA_DE_BIOMETRIA: 'postgres',
    DATABASE_URL: URL_BASE,
    DATABASE_POOLER_URL: URL_BASE,
  });
  const alta = await request(app.getHttpServer())
    .post(`/copropiedades/${COP_A}/edge-gateways`)
    .set(
      'Authorization',
      `Bearer ${await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: null })}`,
    )
    .send({ nombre: `Edge paridad ${String(Date.now())}` });
  const edge = {
    id: alta.body.edgeId,
    copropiedadId: COP_A,
    credencialRef: alta.body.credencialRef,
  };
  const ruta = `/copropiedades/${COP_A}/reglas/instantanea?desde=0`;
  const r = await request(app.getHttpServer())
    .get(ruta)
    .set(cabecerasDelEdge(edge, 'GET', ruta, '', { credencial: alta.body.secreto }));
  instantanea = r.body as InstantaneaDeReglas;
  disponible = r.status === 200;
});
afterAll(async () => {
  await app?.close();
});

exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);

/** Lo que importa de una decisión para RN-16: permiso, motivo, regla y confirmación. */
const esencia = (r: ResultadoAcceso) => ({
  permitido: r.permitido,
  motivo: r.permitido ? null : r.motivo,
  regla: r.reglaAplicada,
  confirmacion: r.permitido ? r.requiereConfirmacionHumana === true : false,
});

const CASOS: readonly { nombre: string; placa: string; confianza: number }[] = [
  { nombre: 'residente con vehículo del padrón', placa: 'PCH2145', confianza: 0.95 },
  { nombre: 'otro residente', placa: 'GBA7890', confianza: 0.95 },
  { nombre: 'vehículo sin dueño (persona sintética)', placa: 'CONC001', confianza: 0.95 },
  {
    nombre: 'placa de una VISITA vigente (autorización con placa)',
    placa: 'ABC9999',
    confianza: 0.95,
  },
  { nombre: 'placa de una visita vencida', placa: 'XYZ9999', confianza: 0.95 },
  { nombre: 'placa en lista negra', placa: 'XYZ0000', confianza: 0.95 },
  { nombre: 'placa desconocida', placa: 'NOEX123', confianza: 0.95 },
  {
    nombre: 'lectura en minúsculas (el objeto de valor normaliza)',
    placa: 'abc1234',
    confianza: 0.95,
  },
  { nombre: 'lectura dudosa por debajo del umbral', placa: 'ABC1234', confianza: 0.5 },
];

describe.skipIf(URL_BASE === undefined)('RN-16 · nube y Edge deciden igual (15-Q)', () => {
  it.each(CASOS)('$nombre', async ({ placa, confianza }) => {
    const motor = (app as INestApplication).get<MotorDeDecision>(MOTOR_DE_DECISION);
    const nube = await motor.decidir({
      copropiedadId: COP_A,
      dispositivoId: CAMARA,
      metodo: 'placa',
      personaId: null,
      placaLeida: placa,
      zonaId: null,
      confianza,
    });
    const cache = { vigente: () => instantanea ?? null, guardar: () => false };
    const edge = new DecidirLocalmente(cache, {
      copropiedadId: COP_A,
      contingencia: 'denegar',
      cacheObsoletaMinutos: 1440,
    }).decidir({
      dispositivoId: CAMARA,
      metodo: 'placa',
      referenciaExterna: `paridad-${placa}-${String(confianza)}`,
      confianza,
      placaLeida: placa,
      personaId: null,
      zonaId: null,
      ocurridoEn: new Date(),
    });
    expect(edge.porContingencia).toBe(false);
    expect(esencia(edge.resultado)).toEqual(esencia(nube));
  });

  it('el rostro de cada plantilla de la instantánea: mismo veredicto (RN-09 en el instante)', async () => {
    const motor = (app as INestApplication).get<MotorDeDecision>(MOTOR_DE_DECISION);
    const cache = { vigente: () => instantanea ?? null, guardar: () => false };
    const plantillas = instantanea?.plantillas ?? [];
    // 15-S5 · lo que hacía `biometria-pg` en paralelo, siempre en este instante:
    // revocar una plantilla ajena DESPUÉS de la instantánea y ANTES de la nube.
    await revocarConsentimientoDe(URL_BASE ?? '', plantillaAjena);
    // El rostro reconocible de esta corrida está, y reconocible: si no, la
    // comparación sólo cubriría negaciones por consentimiento.
    expect(
      plantillas.find((p) => p.plantillaId === plantillaPropia)?.reconocibleHasta,
    ).toBeTruthy();
    // 15-S5 · la interferencia es real: la ajena estaba en la instantánea.
    expect(plantillas.some((p) => p.plantillaId === plantillaAjena)).toBe(true);
    // Y sólo se comparan las que siembra ESTE fichero: las de otro pueden cambiar
    // entre la instantánea y la nube, y entonces no son los mismos datos (RN-16 es
    // «misma decisión con la misma versión de reglas», no «con datos distintos»).
    const propias = new Set([
      plantillaPropia,
      plantillaRevocada,
      ...Object.values(residentes ?? {}),
    ]);
    const comparadas = plantillas.filter((p) => propias.has(p.plantillaId));
    expect(comparadas).toHaveLength(propias.size);
    for (const p of comparadas) {
      const solicitud = { personaId: p.personaId, placaLeida: null, zonaId: null, confianza: 1 };
      const nube = await motor.decidir({
        copropiedadId: COP_A,
        dispositivoId: CAMARA,
        metodo: 'facial',
        ...solicitud,
      });
      const edge = new DecidirLocalmente(cache, {
        copropiedadId: COP_A,
        contingencia: 'denegar',
        cacheObsoletaMinutos: 1440,
      }).decidir({
        dispositivoId: CAMARA,
        metodo: 'facial',
        referenciaExterna: `rostro-${p.plantillaId}`,
        ocurridoEn: new Date(),
        ...solicitud,
      });
      expect(esencia(edge.resultado), p.plantillaId).toEqual(esencia(nube));
    }
  });

  it('15-X · D1 · el rostro de un residente: su motivo, y el mismo en los dos', async () => {
    const motor = (app as INestApplication).get<MotorDeDecision>(MOTOR_DE_DECISION);
    const cache = { vigente: () => instantanea ?? null, guardar: () => false };
    for (const [motivo, plantillaId] of Object.entries(residentes ?? {})) {
      const plantilla = instantanea?.plantillas?.find((p) => p.plantillaId === plantillaId);
      expect(plantilla, motivo).toBeDefined();
      const solicitud = {
        personaId: plantilla?.personaId ?? null,
        placaLeida: null,
        zonaId: null,
        confianza: 1,
      };
      const nube = await motor.decidir({
        copropiedadId: COP_A,
        dispositivoId: CAMARA,
        metodo: 'facial',
        ...solicitud,
      });
      const edge = new DecidirLocalmente(cache, {
        copropiedadId: COP_A,
        contingencia: 'denegar',
        cacheObsoletaMinutos: 1440,
      }).decidir({
        dispositivoId: CAMARA,
        metodo: 'facial',
        referenciaExterna: `residente-${plantillaId}`,
        ocurridoEn: new Date(),
        ...solicitud,
      });
      expect(nube.permitido ? 'PERMITIDO' : nube.motivo, motivo).toBe(motivo);
      expect(esencia(edge.resultado), motivo).toEqual(esencia(nube));
    }
  });

  it('los casos cubren permitidos Y negados: si no, no probarían nada', async () => {
    expect(instantanea?.vehiculos.length).toBeGreaterThan(0);
    expect(instantanea?.autorizaciones.some((a) => a.placa === 'ABC9999')).toBe(true);
  });
});
