import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { aperturasFisicasPor, desenlacesDeVerificacionPor, sobreDeLectura } from '@ncr/providers';
import { cargarConfiguracionDeSitio } from '../src/configuracion/esquema-de-sitio';
import { componerEdge } from '../src/composicion';
import type { EdgeCompuesto } from '../src/composicion';
import { firmaLocal } from '../src/infraestructura/http/proteccion-local';
import {
  HOST_CAMARA,
  HOST_TERMINAL,
  NubeDePrueba,
  PLANTILLA,
  SECRETO_CAMARA,
  SECRETO_LOCAL,
  entornoDeSitio,
  equiposDeSitio,
} from './banco-de-sitio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q · EL EDGE EN SITIO CONTRA LOS EQUIPOS SIMULADOS DE `providers`
 *
 * P-27 = B, por sus dos caras:
 *  · CON nube, el Edge escucha y no hace nada: ni decide, ni acciona, ni encola;
 *  · SIN nube, decide con la instantánea que descargó, ABRE la barrera, CONTESTA
 *    a la terminal, encola con lo que hizo, y no acciona dos veces lo repetido.
 * Y al volver la nube: la bandeja se vacía y las reglas se piden en el acto.
 *
 * Los equipos son los simulados de `packages/providers` —la misma pila HTTP,
 * Digest y analizadores de la nube—; la cámara publica por HTTP de verdad al
 * receptor del Edge; la nube es el doble de `banco-de-sitio.ts`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const nube = new NubeDePrueba();
const { peticion, flujoDeLaTerminal } = equiposDeSitio();
let edge: EdgeCompuesto;
let servidor: Server;
let base = '';
const lineas: string[] = [];

beforeAll(async () => {
  const config = cargarConfiguracionDeSitio(entornoDeSitio());
  edge = componerEdge(config, {
    registrar: (_n, m) => void lineas.push(m),
    transporteDeNube: nube.transporte,
    peticionAEquipos: peticion,
  });
  servidor = createServer((req, res) => void edge.manejador(req, res));
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  base = `http://127.0.0.1:${String((servidor.address() as AddressInfo).port)}`;
});
afterAll(async () => {
  edge?.proveedor.olvidar?.('90000000-0000-4000-8000-000000000002');
  await new Promise((listo) => servidor?.close(listo));
});

const publicarPlaca = (placa: string, referencia: string, secreto = SECRETO_CAMARA) => {
  const sobre = sobreDeLectura({ placa, referencia, confianza: 95 });
  return fetch(`${base}/alarm-server/${secreto}`, {
    method: 'POST',
    headers: { 'content-type': sobre.tipoDeContenido },
    body: sobre.cuerpo,
  });
};
const aperturas = (): number => aperturasFisicasPor.get(HOST_CAMARA) ?? 0;
const hasta = async (condicion: () => boolean, ms = 3000): Promise<void> => {
  const fin = Date.now() + ms;
  while (!condicion() && Date.now() < fin) await new Promise((r) => setTimeout(r, 20));
};

describe('el Edge en sitio (15-Q, P-27 = B)', () => {
  it('con nube: descarga la instantánea y NO actúa sobre la cámara', async () => {
    const r = await edge.contingencia.tic(new Date());
    expect(r.modo).toBe('en_linea');
    expect(r.descarga).toMatchObject({ estado: 'nueva', version: 1 });
    const antes = aperturas();
    expect((await publicarPlaca('ABC123', 'con-nube-1')).status).toBe(200);
    expect(aperturas()).toBe(antes);
    expect(edge.bandeja.cuantosPendientes()).toBe(0);
  });

  it('sin nube: decide con la caché, ABRE la barrera y encola con lo que hizo', async () => {
    nube.wan = false;
    expect((await edge.contingencia.tic(new Date())).modo).toBe('autonomo');
    const antes = aperturas();
    expect((await publicarPlaca('ABC123', 'sin-nube-1')).status).toBe(200);
    expect(aperturas()).toBe(antes + 1);
    const [pendiente] = edge.bandeja.pendientes(new Date(), 10);
    expect(JSON.parse(pendiente?.cuerpo ?? '{}')).toMatchObject({
      placaLeida: 'ABC123',
      decision: { permitido: true, versionDeReglas: 1 },
      accionamiento: { tipo: 'apertura', estado: 'aceptada' },
    });
  });

  it('Q5 · la MISMA publicación repetida no abre dos veces', async () => {
    const antes = aperturas();
    await publicarPlaca('ABC123', 'sin-nube-1');
    expect(aperturas()).toBe(antes);
    expect(edge.bandeja.cuantosPendientes()).toBe(1);
  });

  it('una placa en lista negra se niega, se encola y no abre', async () => {
    const antes = aperturas();
    await publicarPlaca('MAL666', 'sin-nube-2');
    expect(aperturas()).toBe(antes);
    expect(edge.bandeja.cuantosPendientes()).toBe(2);
  });

  it('la terminal que espera veredicto recibe el del Edge (plantilla → titular)', async () => {
    await edge.rearmarEscuchas();
    flujoDeLaTerminal.emitir({
      eventType: 'AccessControllerEvent',
      dateTime: new Date().toISOString(),
      AccessControllerEvent: {
        majorEventType: 5,
        subEventType: 75,
        currentEvent: true,
        serialNo: 9001,
        remoteCheck: true,
        employeeNoString: PLANTILLA,
      },
    });
    await hasta(() => (desenlacesDeVerificacionPor.get(HOST_TERMINAL) ?? []).length > 0);
    expect(desenlacesDeVerificacionPor.get(HOST_TERMINAL)?.[0]).toMatchObject({
      serie: '9001',
      desenlace: 'abrio',
    });
    await hasta(() => edge.bandeja.cuantosPendientes() === 3);
    expect(edge.bandeja.cuantosPendientes()).toBe(3);
  });

  it('al volver la nube: reconcilia todo una vez, con lo accionado, y pide reglas en el acto', async () => {
    nube.wan = true;
    nube.instantanea = { ...nube.instantanea, version: 2 };
    const r = await edge.contingencia.tic(new Date());
    expect(r.modo).toBe('en_linea');
    expect(r.reconciliacion).toMatchObject({ creados: 3, fallidos: 0 });
    expect(r.descarga).toMatchObject({ estado: 'nueva', version: 2 });
    expect(nube.distintos).toBe(3);
    expect(nube.recibidos.filter((e) => e['accionamiento'] !== undefined)).toHaveLength(2);
    expect(edge.bandeja.cuantosPendientes()).toBe(0);
  });

  it('una instantánea cuyo hash no es el de su contenido se rechaza: se sigue con la anterior', async () => {
    nube.instantanea = { ...nube.instantanea, version: 3, placasEnListaNegra: [] };
    const r = await edge.contingencia.tic(new Date(Date.now() + 3_600_000));
    expect(r.descarga).toMatchObject({ estado: 'rechazada' });
    expect(edge.cache.vigente(nube.instantanea.copropiedadId)?.version).toBe(2);
  });

  it('una cámara con un secreto que no es el suyo no publica: 401', async () => {
    expect((await publicarPlaca('ABC123', 'x', 'z'.repeat(40))).status).toBe(401);
  });

  it('/estado exige firma local y no acepta el mismo nonce dos veces', async () => {
    expect((await fetch(`${base}/estado`)).status).toBe(401);
    const marca = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(12).toString('hex');
    const cabeceras = {
      'x-ncr-marca-temporal': marca,
      'x-ncr-nonce': nonce,
      'x-ncr-firma': firmaLocal(SECRETO_LOCAL, marca, nonce, 'GET', '/estado', ''),
    };
    const r = await fetch(`${base}/estado`, { headers: cabeceras });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ modo: 'en_linea', pendientes: 0 });
    expect((await fetch(`${base}/estado`, { headers: cabeceras })).status).toBe(401);
  });

  it('lo que no es una ruta del Edge es 404', async () => {
    expect((await fetch(`${base}/ingesta/eventos`, { method: 'POST' })).status).toBe(404);
  });
});
