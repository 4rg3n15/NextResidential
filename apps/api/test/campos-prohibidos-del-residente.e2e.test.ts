import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { RequestMethod } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { CLAVE_ROLES } from '../src/comun/decoradores';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * RONDA 15-W · NINGUNA RUTA DEL RESIDENTE ACEPTA QUE ÉL ELIJA QUIÉN ES (§6)
 *
 * «Ninguna ruta del residente acepta `viviendaId`, `personaId`, `titularId`,
 * `rol`, `estado`, `origen` ni `es_titular` en el cuerpo. Las pruebas que los
 * envían deben recibir 400.» Desde la 15-X, tampoco `suprimirEn`: el plazo del
 * rostro lo pone el servidor. La vivienda, la persona y el rol los pone el
 * ámbito que resuelve la API; si una ruta los aceptara, el residente podría
 * escribir en la casa de otro con una petición bien formada.
 *
 * La lista de rutas SALE DEL ENRUTADOR —toda escritura con `@Roles('residente')`
 * y un `@Body()`—, no de esta prueba: una ruta nueva entra sola, y un DTO que
 * declare uno de esos campos la pone en rojo el día que se escribe. Cada uno se
 * envía SOLO, y el 400 tiene que nombrarlo (`forbidNonWhitelisted`): un 400 por
 * otro motivo no demuestra nada.
 *
 * Las escrituras SIN cuerpo no leen ninguno: lo que se les mande no decide
 * nada. Se declaran aquí con su nombre, y una nueva sin clasificar rompe.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const PROHIBIDOS: Record<string, unknown> = {
  viviendaId: '00000000-0000-4000-8000-0000000000a2',
  personaId: '00000000-0000-4000-8000-0000000000a3',
  titularId: '00000000-0000-4000-8000-0000000000a4',
  rol: 'administrador',
  estado: 'activo',
  origen: 'administracion',
  es_titular: true,
  // 15-X (D2) · el plazo del rostro lo pone el servidor (365 días o los 18 del menor).
  suprimirEn: '2099-01-01T00:00:00Z',
};
const SIN_CUERPO = new Set([
  // 15-X: retirar mi rostro.
  'POST /copropiedades/:id/mi/rostro/retiro',
  // 15-W: el traspaso, añadir una plaza y eliminar un vehículo propio.
  'POST /copropiedades/:id/mi/menores/:residenteId/codigo-de-traspaso',
  'POST /copropiedades/:id/mi/ocupantes/plazas',
  'DELETE /copropiedades/:id/mi/vehiculos/:vehiculoId',
  // Anteriores: la sesión, los códigos de recuperación y dos revocaciones.
  'POST /auth/cierre',
  'POST /auth/mfa/codigos',
  'POST /auth/restablecimiento',
  'POST /copropiedades/:id/biometria/consentimientos/:consentimientoId/revocacion',
  'POST /copropiedades/:id/mi/vehiculos/:vehiculoId/desactivacion',
]);
const OTRO_ID = '00000000-0000-4000-8000-0000000000ff';
const ESCRITURAS = new Map<number, 'post' | 'put' | 'patch' | 'delete'>([
  [RequestMethod.POST, 'post'],
  [RequestMethod.PUT, 'put'],
  [RequestMethod.PATCH, 'patch'],
  [RequestMethod.DELETE, 'delete'],
]);

interface Escritura {
  readonly metodo: 'post' | 'put' | 'patch' | 'delete';
  readonly ruta: string;
  readonly conCuerpo: boolean;
}
const clave = (e: Escritura): string => `${e.metodo.toUpperCase()} ${e.ruta}`;

/** Las escrituras del residente, del enrutador, con si su manejador lee el cuerpo. */
const escriturasDelResidente = (app: INestApplication): Escritura[] => {
  const reflector = app.get(Reflector);
  const escaner = new MetadataScanner();
  const lista: Escritura[] = [];
  for (const { instance, metatype } of app.get(DiscoveryService).getControllers()) {
    if (!instance || !metatype) continue;
    const prefijo = reflector.get<string>(PATH_METADATA, metatype) ?? '';
    for (const nombre of escaner.getAllMethodNames(Object.getPrototypeOf(instance) as object)) {
      const manejador = (instance as Record<string, unknown>)[nombre];
      if (typeof manejador !== 'function') continue;
      const roles =
        reflector.get<string[]>(CLAVE_ROLES, manejador) ??
        reflector.get<string[]>(CLAVE_ROLES, metatype) ??
        [];
      const metodo = ESCRITURAS.get(reflector.get<number>(METHOD_METADATA, manejador));
      if (!roles.includes('residente') || metodo === undefined) continue;
      const sufijo = reflector.get<string>(PATH_METADATA, manejador) ?? '';
      const argumentos = (Reflect.getMetadata(ROUTE_ARGS_METADATA, metatype, nombre) ??
        {}) as Record<string, unknown>;
      lista.push({
        metodo,
        ruta: `/${[prefijo, sufijo].filter((p) => p !== '' && p !== '/').join('/')}`,
        conCuerpo: Object.keys(argumentos).some((k) => k.startsWith(`${RouteParamtypes.BODY}:`)),
      });
    }
  }
  return lista;
};

let app: INestApplication;
let token = '';
let escrituras: Escritura[] = [];
let ip = 0;

beforeAll(async () => {
  const firmante = await crearFirmante();
  app = await crearApp(firmante);
  token = await tokenDe(firmante, { rol: 'residente', copropiedadId: COP_A, aal: 'aal1' });
  escrituras = escriturasDelResidente(app);
});
afterAll(async () => {
  await app?.close();
});

describe('15-W · §6 · el residente no elige vivienda, persona, titular, rol, estado ni origen', () => {
  it('la lista sale del enrutador: hay escrituras con cuerpo, y las sin cuerpo están todas declaradas', () => {
    expect(escrituras.filter((e) => e.conCuerpo).length).toBeGreaterThan(10);
    const sinCuerpo = escrituras.filter((e) => !e.conCuerpo).map(clave);
    expect(sinCuerpo.sort()).toEqual([...SIN_CUERPO].sort());
  });

  it('cada escritura con cuerpo rechaza cada campo prohibido con 400, y el 400 lo nombra', async () => {
    const aceptados: string[] = [];
    for (const e of escrituras.filter((x) => x.conCuerpo)) {
      const ruta = e.ruta.replace(':id', COP_A).replace(/:[A-Za-z]+/g, OTRO_ID);
      for (const [campo, valor] of Object.entries(PROHIBIDOS)) {
        ip += 1;
        const servidor = request(app.getHttpServer());
        const r = await servidor[e.metodo](ruta)
          .set('Authorization', `Bearer ${token}`)
          .set('x-forwarded-for', `198.51.100.${String((ip % 250) + 1)}`)
          .send({ [campo]: valor });
        if (
          r.status !== 400 ||
          !JSON.stringify(r.body).includes(`property ${campo} should not exist`)
        )
          aceptados.push(`${clave(e)} · ${campo} → ${String(r.status)}`);
      }
    }
    expect(aceptados).toEqual([]);
  }, 60_000);
});
