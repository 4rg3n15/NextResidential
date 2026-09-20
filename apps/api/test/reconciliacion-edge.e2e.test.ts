import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, configuracionDePrueba, crearApp, crearFirmante, tokenDe } from './utilidades';
import {
  CABECERA_FIRMA,
  CABECERA_MARCA,
  firmar,
} from '../src/autorizaciones/presentacion/firma-ingesta';

/**
 * ETAPA 12 · La entrada de reconciliación del Edge. RN-16, RN-17, CA-21, CA-22.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE ESTA SUITE TIENE QUE DEMOSTRAR
 *
 * 1. Que la nube **NO vuelve a decidir**. El evento se escribe con la decisión
 *    que trajo el gateway, no con la que la nube tomaría hoy. Es lo que hace
 *    auditable un corte de WAN (CA-21) y lo único que impide que el histórico
 *    afirme algo que nadie decidió.
 * 2. Que el **instante** que queda registrado es el del acceso, no el de la
 *    reconciliación. Veinte accesos de media hora apilados en el minuto de la
 *    reconexión dejan la línea de tiempo inservible.
 * 3. Que un reenvío se descarta **en silencio y con 202** (CA-22). Un 409 le
 *    diría «error» a algo que salió bien, y el Edge reintentaría para siempre.
 * 4. Que sigue exigiendo firma. Es una ruta pública sin sesión: sin firma sería
 *    un buzón abierto para inventar accesos en una tabla inmutable (RN-03).
 */
describe('reconciliación desde el Edge', () => {
  let app: INestApplication;
  let tokenAdmin: string;

  /**
   * Lo que el histórico devuelve, en lo que aquí importa.
   *
   * No trae `claveIdempotencia` —y está bien que no la traiga: es un detalle de
   * la ingesta, no algo que una consola deba leer— así que los eventos se
   * correlacionan por `reglaAplicada` y por `ocurridoEn`, que son datos del
   * hecho y bastan para identificar los de esta prueba.
   */
  interface Registro {
    readonly resultado: string;
    readonly motivo: string | null;
    readonly reglaAplicada: string;
    readonly versionReglas: number;
    readonly decididoPorEdge: boolean;
    readonly ocurridoEn: string;
  }

  /**
   * El histórico EXIGE rango —sin él responde 400 y no una consulta sin techo—,
   * así que se pide uno que abarque el instante de los eventos de esta suite.
   */
  const comoAdmin = (ruta: string) =>
    request(app.getHttpServer())
      .get(ruta)
      .query({
        desde: '2026-09-21T00:00:00.000Z',
        hasta: '2026-09-22T00:00:00.000Z',
        tamanoPagina: 200,
      })
      .set('Authorization', `Bearer ${tokenAdmin}`);

  beforeAll(async () => {
    const firmante = await crearFirmante();
    app = await crearApp(firmante);
    tokenAdmin = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  });
  afterAll(async () => {
    await app?.close();
  });

  const OCURRIO = '2026-09-21T10:05:00.000Z';

  const evento = (referencia: string, cambios: Record<string, unknown> = {}) => ({
    copropiedadId: COP_A,
    dispositivoId: 'disp-talanquera-1',
    metodo: 'placa' as const,
    placaLeida: 'ABC123',
    confianzaCentesimas: 95,
    referenciaExterna: referencia,
    ocurridoEn: OCURRIO,
    cachePotencialmenteObsoleto: false,
    decision: {
      permitido: true,
      reglaAplicada: 'motor.ningunaRegulaNiega',
      versionDeReglas: 7,
    },
    ...cambios,
  });

  const enviar = (cuerpo: object) => {
    const crudo = JSON.stringify(cuerpo);
    const marca = String(Math.floor(Date.now() / 1000));
    return request(app.getHttpServer())
      .post('/ingesta/reconciliacion')
      .set({
        [CABECERA_MARCA]: marca,
        [CABECERA_FIRMA]: firmar(configuracionDePrueba.INGESTA_FIRMA_SECRETO, marca, crudo),
        'content-type': 'application/json',
      })
      .send(crudo);
  };

  it('sin firma NO entra: es una ruta pública en una tabla inmutable', async () => {
    await request(app.getHttpServer())
      .post('/ingesta/reconciliacion')
      .send({ eventos: [evento('rec-sin-firma')] })
      .expect(401);
  });

  it('acepta un lote firmado y devuelve un resultado por clave', async () => {
    const r = await enviar({ eventos: [evento('rec-0001'), evento('rec-0002')] }).expect(202);
    expect(r.body.aceptado).toBe(true);
    expect(r.body.resultados).toHaveLength(2);
    expect(r.body.resultados[0].aceptado).toBe(true);
    expect(r.body.resultados[0].duplicado).toBe(false);
    // La clave la construye el DOMINIO, igual que en el Edge: es lo que hace
    // que el reenvío se reconozca.
    expect(r.body.resultados[0].claveIdempotencia).toBe(
      `${COP_A}:disp-talanquera-1:placa:rec-0001`,
    );
  });

  it('CA-22 · el reenvío se descarta EN SILENCIO, con 202 y `duplicado`', async () => {
    await enviar({ eventos: [evento('rec-repetido')] }).expect(202);
    const segunda = await enviar({ eventos: [evento('rec-repetido')] }).expect(202);
    expect(segunda.body.resultados[0].aceptado).toBe(true);
    expect(segunda.body.resultados[0].duplicado).toBe(true);
  });

  it('CA-21 · LA DECISIÓN DEL EDGE QUEDA ESCRITA, no la que la nube tomaría hoy', async () => {
    /**
     * La prueba de fondo de la etapa, y por eso lee el evento DE VUELTA en vez
     * de conformarse con un 202.
     *
     * El motor de la aplicación de pruebas permite —es `motorPermite`—. El
     * gateway, en cambio, NEGÓ por lista negra durante el corte, con la versión
     * de reglas que tenía entonces. Si la nube recalculara, el histórico diría
     * «permitido» de un acceso que en la portería no se concedió, con la
     * versión de hoy y no la de entonces, y el corte quedaría sin auditar.
     *
     * Las tres afirmaciones son las tres mitades del problema: el resultado, el
     * motivo y la versión sellada.
     */
    await enviar({
      eventos: [
        evento('rec-negado', {
          decision: {
            permitido: false,
            motivo: 'LISTA_NEGRA',
            reglaAplicada: 'politica.listaNegra',
            versionDeReglas: 7,
          },
        }),
      ],
    }).expect(202);

    const historial = await comoAdmin(
      `/copropiedades/${COP_A}/eventos`,
    ).expect(200);
    const evt = (historial.body.filas as Registro[]).find(
      (e) => e.reglaAplicada === 'politica.listaNegra',
    );
    expect(evt, 'el evento reconciliado tiene que estar en el histórico').toBeDefined();
    expect(evt?.resultado, 'NEGADO, aunque el motor de la nube permita').toBe('negado');
    expect(evt?.motivo).toBe('LISTA_NEGRA');
    expect(evt?.versionReglas, 'la versión de ENTONCES, no la de hoy').toBe(7);
    expect(evt?.decididoPorEdge, 'queda marcado como decidido en el Edge').toBe(true);
  });

  it('CA-22 · el INSTANTE registrado es el del acceso, no el de la reconciliación', async () => {
    // Veinte accesos de media hora apilados en el minuto de la reconexión
    // dejan inservible la línea de tiempo, que es lo que lee una auditoría.
    const cuandoDeVerdad = '2026-09-21T10:07:31.000Z';
    await enviar({
      eventos: [evento('rec-instante', { ocurridoEn: cuandoDeVerdad })],
    }).expect(202);

    const historial = await comoAdmin(
      `/copropiedades/${COP_A}/eventos`,
    ).expect(200);
    const evt = (historial.body.filas as Registro[]).find(
      (e) => new Date(e.ocurridoEn).toISOString() === cuandoDeVerdad,
    );
    expect(
      evt,
      'el instante guardado es el del acceso; si fuera el de la reconciliación, no se encontraría',
    ).toBeDefined();
    expect(evt?.decididoPorEdge).toBe(true);
  });

  it('CA-16 · una negación SIN motivo se rechaza', async () => {
    const r = await enviar({
      eventos: [
        evento('rec-sin-motivo', {
          decision: { permitido: false, reglaAplicada: 'x', versionDeReglas: 7 },
        }),
      ],
    }).expect(202);
    expect(r.body.resultados[0].aceptado).toBe(false);
    expect(r.body.resultados[0].detalle).toContain('motivo');
  });

  it('una versión de reglas imposible se rechaza y CORTA el lote', async () => {
    // Cortar es lo correcto: si el tercero entrara y el segundo no, el
    // histórico tendría un hueco en medio de un corte.
    const r = await enviar({
      eventos: [
        evento('rec-ok-antes'),
        evento('rec-version-mala', {
          decision: { permitido: true, reglaAplicada: 'x', versionDeReglas: 0 },
        }),
        evento('rec-nunca-llega'),
      ],
    }).expect(400);
    expect(JSON.stringify(r.body)).toMatch(/versionDeReglas|entero/i);
  });

  it('un lote de 501 eventos se rechaza: el tope es del DTO', async () => {
    const eventos = Array.from({ length: 501 }, (_, i) => evento(`rec-masivo-${i}`));
    await enviar({ eventos }).expect(400);
  });

  it('el ORDEN del lote es el orden en que se procesa', async () => {
    const r = await enviar({
      eventos: [evento('rec-orden-1'), evento('rec-orden-2'), evento('rec-orden-3')],
    }).expect(202);
    expect(r.body.resultados.map((x: { claveIdempotencia: string }) => x.claveIdempotencia)).toEqual(
      ['rec-orden-1', 'rec-orden-2', 'rec-orden-3'].map(
        (ref) => `${COP_A}:disp-talanquera-1:placa:${ref}`,
      ),
    );
  });

  it('KPI-31 · el marcado de caché obsoleta viaja y se acepta', async () => {
    const r = await enviar({
      eventos: [evento('rec-obsoleto', { cachePotencialmenteObsoleto: true })],
    }).expect(202);
    expect(r.body.resultados[0].aceptado).toBe(true);
  });

  it('un campo no declarado se rechaza: `forbidNonWhitelisted` está activo', async () => {
    await enviar({ eventos: [evento('rec-extra', { campoInventado: 1 })] }).expect(400);
  });
});
