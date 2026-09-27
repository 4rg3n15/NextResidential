import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { FACE_TEMPLATE_PROVIDER } from '@ncr/domain-core';
import type { MockProvider } from '@ncr/providers';
import { NAVEGACION } from '../../web/src/lib/navegacion';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-03 · CADA RUTA QUE LA PANTALLA LLAMA ADMITE A CADA ROL QUE LA VE
 *
 * En sitio, el superadministrador capturó un rostro desde «Rostro del
 * visitante» y el seguimiento contestó 403: `GET consentimientos/:id` no lo
 * admitía. Mirando el resto apareció el mismo defecto en otra dirección: el
 * portero y el operador de central ven la pantalla y `sincronizacion-total` los
 * rechazaba.
 *
 * Ninguna de las dos listas se escribe aquí:
 *
 *  · los ROLES salen de la tabla de navegación de la consola (quién ve la
 *    pantalla);
 *  · las RUTAS, de las llamadas `cliente.X('…')` del directorio de la pantalla.
 *
 * Y se distingue el 403 de la GUARDA —«Rol no autorizado»— del 403 del DOMINIO
 * —RN-09 sin consentimiento, que sí es correcto—: los dos son 403, y sólo el
 * primero es el defecto.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const PANTALLA = resolve(process.cwd(), '../web/src/app/(consola)/biometria');
const TITULAR = '40000000-0000-4000-8000-000000000103';
const TERMINAL = '90000000-0000-4000-8000-000000000001';
const HORA = 3_600_000;
const VECTOR = Buffer.from([9, 8, 7, 6, 5, 4, 3, 2, 1]).toString('base64');

const entrada = NAVEGACION.find((e) => e.clave === 'biometria');
const ROLES = [...(entrada?.roles ?? [])];

const rutasDeLaPantalla = (): { metodo: string; ruta: string }[] => {
  const encontradas = new Map<string, { metodo: string; ruta: string }>();
  for (const nombre of readdirSync(PANTALLA)) {
    if (!/\.tsx?$/.test(nombre) || /\.test\./.test(nombre)) continue;
    const texto = readFileSync(join(PANTALLA, nombre), 'utf8');
    for (const m of texto.matchAll(/cliente\.(GET|POST|PUT|PATCH|DELETE)\(\s*'([^']+)'/g)) {
      encontradas.set(`${m[1]} ${m[2]}`, { metodo: m[1]!, ruta: m[2]! });
    }
  }
  return [...encontradas.values()];
};

let app: INestApplication;
let firmante: Firmante;

/** Cada rol con el alcance con el que entra de verdad a COP_A. */
const tokenPara = (rol: string): Promise<string> =>
  tokenDe(firmante, {
    rol: rol as Parameters<typeof tokenDe>[1]['rol'],
    ...(rol === 'superadministrador'
      ? { copropiedadId: null }
      : rol === 'operador_central'
        ? { copropiedadId: null, copropiedades: [COP_A] }
        : { copropiedadId: COP_A }),
  });

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  (app.get(FACE_TEMPLATE_PROVIDER) as MockProvider).dispositivos.add(TERMINAL);
});
afterAll(async () => {
  await app?.close();
});

/** Una captura real con ese rol: da identificadores que existen. */
const capturarCon = async (token: string) => {
  const r = await request(app.getHttpServer())
    .post(`/copropiedades/${COP_A}/biometria/capturas`)
    .set('authorization', `Bearer ${token}`)
    .send({
      titularId: TITULAR,
      medidas: { rostrosDetectados: 1, nitidez: 0.85, iluminacion: 0.6, proporcionRostro: 0.4 },
      vector: VECTOR,
      versionPolitica: 'v1.0',
      canal: 'app',
      suprimirEn: new Date(Date.now() + 8 * HORA).toISOString(),
    });
  return r;
};

describe('H-SITIO-03 · las rutas de «Rostro del visitante» contra los roles que la ven', () => {
  it('las dos fuentes se leyeron: una lista vacía pasaría cualquier aserción', () => {
    expect(ROLES).toContain('superadministrador');
    expect(ROLES.length).toBeGreaterThanOrEqual(4);
    const rutas = rutasDeLaPantalla().map((r) => `${r.metodo} ${r.ruta}`);
    expect(rutas).toContain('GET /copropiedades/{id}/biometria/consentimientos/{consentimientoId}');
    expect(rutas).toContain(
      'POST /copropiedades/{id}/biometria/plantillas/{plantillaId}/sincronizacion-total',
    );
    expect(rutas.length).toBeGreaterThanOrEqual(4);
  });

  it.each(ROLES)('%s: ninguna ruta de la pantalla lo rechaza por rol', async (rol) => {
    const token = await tokenPara(rol);
    const captura = await capturarCon(token);
    expect(captura.status, `capturas con ${rol}: ${JSON.stringify(captura.body)}`).toBe(201);
    const { consentimientoId, plantillaId } = captura.body as {
      consentimientoId: string;
      plantillaId: string;
    };

    for (const { metodo, ruta } of rutasDeLaPantalla()) {
      const url = ruta
        .replace('{id}', COP_A)
        .replace('{consentimientoId}', consentimientoId)
        .replace('{plantillaId}', plantillaId);
      const servidor = request(app.getHttpServer());
      const verbo = metodo.toLowerCase() as 'get' | 'post';
      const r = ruta.endsWith('/capturas')
        ? captura
        : await servidor[verbo](url).set('authorization', `Bearer ${token}`).send({});
      const cuerpo = JSON.stringify(r.body);
      // El 403 de la GUARDA es el defecto; el del dominio (RN-09: aún no hay
      // consentimiento vigente) es la respuesta correcta a esta altura.
      expect(cuerpo, `${rol} → ${metodo} ${ruta}`).not.toMatch(/Rol no autorizado/);
      expect([401, 404, 500], `${rol} → ${metodo} ${ruta}: ${cuerpo}`).not.toContain(r.status);
    }
  });
});
