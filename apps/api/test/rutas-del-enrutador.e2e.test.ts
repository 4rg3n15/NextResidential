/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ENRUTADOR VE TODOS LOS ENDPOINTS QUE EL CÓDIGO DECLARA · 15-U
 *
 * Las suites de aislamiento (KPI-36/37) y de escalamiento de privilegios
 * recorren las rutas que ENUMERA el enrutador de Express (`enumerarRutas`), y
 * sólo exigen que la lista no esté vacía. Eso basta mientras la forma en que
 * Express guarda sus rutas no cambie. La 15-U lo cambia: Express 5 mueve el
 * enrutador (`app._router` → `app.router`) y su sintaxis de rutas
 * (path-to-regexp 8). Un enrutador que dejara de verse —o que se viera a
 * medias— daría a esas dos suites una lista más corta, y una lista más corta
 * pasa en verde.
 *
 * Aquí se cruzan las dos fuentes: lo que el enrutador tiene registrado y lo
 * que los decoradores de los controladores declaran (método y ruta, leídos con
 * `Reflector`). Tienen que ser EXACTAMENTE el mismo conjunto, sin duplicados:
 * entonces «la suite recorre el 100 % de los endpoints» es una medida, no una
 * suposición.
 *
 * Y una segunda medida, que la subida a NestJS 11 hizo necesaria: Nest 11 ya no
 * deduplica los módulos dinámicos por el HASH de su configuración, sino por la
 * REFERENCIA del objeto. Un `EquiposModule.registrar()` llamado desde seis
 * módulos eran seis módulos, cada uno con sus controladores (375 rutas en vez
 * de 174) y sus singletons (estado repartido: un rostro sincronizado en una
 * instancia y buscado en otra). Por eso también se exige que ningún módulo
 * exista dos veces en el contenedor.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { crearApp, crearFirmante, enumerarRutas } from './utilidades';

let app: INestApplication;

beforeAll(async () => {
  app = await crearApp(await crearFirmante());
});
afterAll(async () => {
  await app?.close();
});

/** `/a/` + `b/:c` → `/a/b/:c`, como los une Nest al registrar la ruta. */
const unir = (...partes: string[]): string =>
  `/${partes
    .flatMap((p) => p.split('/'))
    .filter((s) => s !== '')
    .join('/')}`;

const comoLista = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.map(String) : [typeof valor === 'string' ? valor : ''];

/** Lo que los decoradores declaran: un `MÉTODO /ruta` por manejador y ruta. */
const declaradas = (aplicacion: INestApplication): string[] => {
  const reflector = aplicacion.get(Reflector);
  const escaner = new MetadataScanner();
  const lista: string[] = [];
  for (const { instance, metatype } of aplicacion.get(DiscoveryService).getControllers()) {
    if (!instance || !metatype) continue;
    const prefijos = comoLista(reflector.get<unknown>(PATH_METADATA, metatype));
    for (const nombre of escaner.getAllMethodNames(Object.getPrototypeOf(instance) as object)) {
      const manejador = (instance as Record<string, unknown>)[nombre];
      if (typeof manejador !== 'function') continue;
      const codigo = reflector.get<RequestMethod | undefined>(METHOD_METADATA, manejador);
      if (codigo === undefined) continue; // un método auxiliar, no un endpoint
      const metodo = codigo === RequestMethod.ALL ? '_ALL' : RequestMethod[codigo];
      for (const prefijo of prefijos) {
        for (const sufijo of comoLista(reflector.get<unknown>(PATH_METADATA, manejador))) {
          lista.push(`${metodo} ${unir(prefijo, sufijo)}`);
        }
      }
    }
  }
  return lista.sort();
};

describe('el enrutador de Express y los decoradores coinciden (15-U)', () => {
  it('cada endpoint declarado está en el enrutador, y nada más', () => {
    const enrutador = enumerarRutas(app)
      .map((r) => `${r.metodo} ${r.ruta}`)
      .sort();
    const codigo = declaradas(app);
    // No vacías: dos listas vacías también son iguales.
    expect(codigo.length).toBeGreaterThan(100);
    expect(enrutador).toEqual(codigo);
  });

  it('ningún endpoint aparece dos veces', () => {
    const vistas = enumerarRutas(app).map((r) => `${r.metodo} ${r.ruta}`);
    expect(vistas.length).toBe(new Set(vistas).size);
  });

  it('ningún módulo está dos veces en el contenedor (NestJS 11 deduplica por referencia)', () => {
    const nombres = [...app.get(ModulesContainer).values()].map((m) => m.metatype.name);
    const repetidos = nombres.filter((n, i) => nombres.indexOf(n) !== i);
    expect(nombres.length).toBeGreaterThan(20);
    expect([...new Set(repetidos)]).toEqual([]);
  });
});
