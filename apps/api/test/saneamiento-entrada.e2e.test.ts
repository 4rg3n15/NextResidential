/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SANEAMIENTO DE ENTRADA · H-13-05 y H-13-06 · ETAPA 13
 *
 * Replica el arranque REAL de `main.ts` —`aplicarSeguridad`, los parsers con
 * `LIMITE_PAYLOAD`, el filtro global— porque los dos hallazgos que fija viven
 * en ese ensamblaje y no en un controlador suelto. Montar la app «a la manera
 * de las pruebas» los habría ocultado.
 *
 * H-13-06 · §2.7.4 exigía desde la ETAPA 01 «remoción de caracteres de control
 * y bytes nulos» antes de persistir. Nunca se construyó. La auditoría lo midió:
 * un `motivo` con `\\u0000`, `\\u0007` y `\\u001b` entraba con 201 y se releía
 * intacto. Un `\\u001b` es el comienzo de una secuencia ANSI: pinta texto falso
 * en el terminal de quien lee la bitácora, que es prueba de auditoría (RN-03).
 *
 * H-13-05 · `forbidNonWhitelisted` rechazaba `colado` y ACEPTABA `__proto__`,
 * `constructor`, `toString`, `valueOf` y `hasOwnProperty`. No hubo contaminación
 * de prototipo —se comprobó—, pero una lista blanca que no ve cinco claves no
 * es una lista blanca.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { aplicarSaneamiento, aplicarSeguridad } from '../src/seguridad';
import { guardarCuerpoCrudo } from '../src/autorizaciones/presentacion/guardia-firma';
import { FiltroGlobalDeExcepciones } from '../src/comun/filtros/filtro-global';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { SONDA_POSTGRES } from '../src/arranque/sonda-postgres';
import { ProveedorDeJwks } from '../src/autenticacion/infraestructura/jwks';
import {
  REPOSITORIO_COPROPIEDADES,
  RepositorioCopropiedadesEnMemoria,
} from '../src/multiempresa/repositorio-copropiedades';
import {
  COP_A,
  COP_B,
  conSesionDePorteriaDeLaSuite,
  configuracionDePrueba,
  crearFirmante,
  tokenDe,
} from './utilidades';

let app: INestApplication;
let portero = '';
let administrador = '';
const OTRO = '00000000-0000-4000-8000-0000000000ff';
const srv = () => app.getHttpServer();

beforeAll(async () => {
  const f = await crearFirmante();
  portero = await tokenDe(f, { rol: 'portero', copropiedadId: COP_A });
  administrador = await tokenDe(f, { rol: 'administrador', copropiedadId: COP_A });
  const modulo = await conSesionDePorteriaDeLaSuite(
    Test.createTestingModule({
      imports: [AppModule.conConfiguracion(configuracionDePrueba)],
    }),
  )
    .overrideProvider(REPOSITORIO_COPROPIEDADES)
    .useFactory({
      factory: () => {
        const c = new RepositorioCopropiedadesEnMemoria();
        c.declarar([
          { id: COP_A, nombre: 'A', zonaHoraria: 'America/Bogota' },
          { id: COP_B, nombre: 'B', zonaHoraria: 'America/Bogota' },
        ]);
        return c;
      },
    })
    .overrideProvider(ProveedorDeJwks)
    .useValue({
      obtener: () => async () => f.clavePublica,
      sondear: async () => ({ estado: 'ok', claves: 1 }),
      disponible: true,
    })
    .overrideProvider(SONDA_POSTGRES)
    .useValue({ comprobar: async () => ({ estado: 'ok', detalle: 'doble' }) })
    .compile();

  // ─── EXACTAMENTE el orden de main.ts (77, 82, 83, 85) ───
  app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  aplicarSeguridad(app, configuracionDePrueba);
  app.use(
    express.json({ limit: configuracionDePrueba.LIMITE_PAYLOAD, verify: guardarCuerpoCrudo }),
  );
  app.use(express.urlencoded({ limit: configuracionDePrueba.LIMITE_PAYLOAD, extended: false }));
  aplicarSaneamiento(app);
  app.useGlobalFilters(new FiltroGlobalDeExcepciones(app.get<Bitacora>(BITACORA)));
  await app.init();
  await app.listen(0);
}, 60_000);
afterAll(async () => {
  await app?.close();
});

const ORDENES = `/copropiedades/${COP_A}/guardia/ordenes`;
const base = { dispositivoId: OTRO, accion: 'abrir', motivo: 'Motivo suficientemente largo' };

describe('H-13-06 · el saneamiento de §2.7.4, por el pipeline de producción', () => {
  it('un motivo con NUL y caracteres de control entra LIMPIO, no verbatim', async () => {
    const sucio = 'Apertura\u0000autorizada\u0007por\u001bportería';
    const r = await request(srv())
      .post(ORDENES)
      .set('authorization', `Bearer ${portero}`)
      .send({ ...base, motivo: sucio });
    expect(r.status).toBe(201);
    // Lo que importa no es el código: es que el valor NO conserve los bytes.
    expect(r.body.motivo).not.toContain('\u0000');
    expect(r.body.motivo).not.toContain('\u0007');
    expect(r.body.motivo).not.toContain('\u001b');
    expect(r.body.motivo).toBe('Aperturaautorizadaporportería');
  });

  it('y al RELEERLO tampoco: el saneamiento ocurre antes de persistir', async () => {
    const r = await request(srv()).get(ORDENES).set('authorization', `Bearer ${portero}`);
    expect(r.status).toBe(200);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain('\\u0000');
    expect(texto).not.toContain('\\u001b');
  });

  /*
   * El tabulador y el salto de línea NO se comprueban aquí: `motivo` los
   * colapsa a un espacio en el dominio desde antes de esta etapa
   * (`apertura-manual.ts`, «recorte, longitud máxima y rechazo de lo que sólo
   * son espacios»). Afirmar que sobreviven en esta ruta sería afirmar algo
   * falso del producto. La garantía de que el saneador NO borra de más se
   * prueba donde corresponde: en `src/comun/saneamiento.test.ts`, contra la
   * función, sin un dominio de por medio que la enmascare.
   */
  it('Unicode se normaliza a NFC: dos cadenas que se ven iguales lo son', async () => {
    // "é" descompuesta (e + U+0301) debe guardarse como la forma compuesta.
    const r = await request(srv())
      .post(ORDENES)
      .set('authorization', `Bearer ${portero}`)
      .send({ ...base, motivo: 'Aperturaé de portería' });
    expect(r.status).toBe(201);
    expect(r.body.motivo).toBe('Aperturaé de portería'.normalize('NFC'));
  });
});

describe('H-13-05 · la lista blanca ve TAMBIÉN las claves heredadas', () => {
  for (const clave of [
    'colado',
    '__proto__',
    'constructor',
    'toString',
    'valueOf',
    'hasOwnProperty',
  ]) {
    it(`rechaza una clave no declarada: ${clave}`, async () => {
      const crudo = `{"dispositivoId":"${OTRO}","accion":"abrir","motivo":"Motivo suficientemente largo",${JSON.stringify(clave)}:{"x":1}}`;
      const r = await request(srv())
        .post(ORDENES)
        .set('authorization', `Bearer ${portero}`)
        .set('content-type', 'application/json')
        .send(crudo);
      expect(r.status).toBe(400);
    });
  }

  it('y ninguna de ellas contamina Object.prototype', async () => {
    const crudo = `{"dispositivoId":"${OTRO}","accion":"abrir","motivo":"Motivo suficientemente largo","__proto__":{"polucionNCR":"si"}}`;
    await request(srv())
      .post(ORDENES)
      .set('authorization', `Bearer ${portero}`)
      .set('content-type', 'application/json')
      .send(crudo);
    expect((Object.prototype as Record<string, unknown>).polucionNCR).toBeUndefined();
  });
});

describe('H-13-07 · un cuerpo absurdamente anidado responde 400, no 500', () => {
  it('profundidad 3 000 → 4xx: es entrada inválida, no un fallo del servidor', async () => {
    let anidado: Record<string, unknown> = { fin: 1 };
    for (let i = 0; i < 3000; i += 1) anidado = { a: anidado };
    const r = await request(srv())
      .post(ORDENES)
      .set('authorization', `Bearer ${portero}`)
      .send({ ...base, extra: anidado });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * H-13-13 · un parámetro de consulta repetido o con sintaxis de objeto es
 * entrada malformada: 400, no «Error interno».
 *
 * `qs` convierte `?b=1&b=2` en arreglo y `?b[x]=1` en objeto; la firma del
 * controlador declara `string`, así que el primer `.trim()` reventaba. Medido
 * antes del arreglo: escalar -> 200, arreglo -> 500, objeto -> 500.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('H-13-13 · parámetros de consulta no escalares', () => {
  const PERSONAS = `/copropiedades/${COP_A}/padron/personas`;

  it('el escalar sigue funcionando: no se rompe lo legítimo', async () => {
    const r = await request(srv())
      .get(`${PERSONAS}?busqueda=a`)
      .set('authorization', `Bearer ${administrador}`);
    expect(r.status).toBeLessThan(400);
  });

  it('repetido (?busqueda=a&busqueda=b) → 400', async () => {
    const r = await request(srv())
      .get(`${PERSONAS}?busqueda=a&busqueda=b`)
      .set('authorization', `Bearer ${administrador}`);
    expect(r.status).toBe(400);
  });

  it('con sintaxis de objeto (?busqueda[x]=1) → 400', async () => {
    const r = await request(srv())
      .get(`${PERSONAS}?busqueda[x]=1`)
      .set('authorization', `Bearer ${administrador}`);
    expect(r.status).toBe(400);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * H-13-09 · UNA CARGA LARGA LLEGA ENTERA
 *
 * Es la regresión del hallazgo ALTO de esta etapa. El saneamiento recortaba a
 * 4096 caracteres con `.slice()`, así que el CSV y el XLSX del padrón llegaban
 * mutilados sin un solo error: el DTO no protestaba —4096 cabe en su
 * `@Length(1, 1_000_000)`— y en el XLSX la firma `PK\x03\x04` sobrevivía al
 * corte, de modo que la validación de tipo real daba el archivo por bueno.
 *
 * La comprobación NO es que el saneador devuelva la cadena entera —eso ya lo
 * prueba `saneamiento.test.ts`—, sino que el número de filas que la API dice
 * haber LEÍDO coincide con las que se enviaron, a través de la tubería real.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('H-13-09 · una carga por encima del antiguo techo llega completa', () => {
  const FILAS = 200;

  it(`un CSV de ${FILAS} filas se lee entero, no recortado a 4096 caracteres`, async () => {
    const cabecera = 'identificador,agrupacion,documento,tipo_documento,nombre,placa,es_titular';
    const filas = Array.from(
      { length: FILAS },
      (_, i) => `${100 + i},Torre 1,10${String(i).padStart(6, '0')},CC,Persona ${i},,false`,
    );
    const csv = [cabecera, ...filas].join('\n');
    // Muy por encima del techo que se retiró: si volviera, se leerían ~55.
    expect(csv.length).toBeGreaterThan(4096 * 2);

    const r = await request(srv())
      .post(`/copropiedades/${COP_A}/padron/carga`)
      .set('authorization', `Bearer ${administrador}`)
      .send({ csv });

    expect(r.status).toBeLessThan(500);
    if (r.status === 201 || r.status === 200) {
      expect(r.body.filasLeidas).toBe(FILAS);
    }
  });
});
