import { generateKeyPair, SignJWT, exportJWK } from 'jose';
import type { JWK } from 'jose';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import express from 'express';
import { guardarCuerpoCrudo } from '../src/autorizaciones/presentacion/guardia-firma';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ProveedorDeJwks } from '../src/autenticacion/infraestructura/jwks';
import type { Configuracion } from '../src/configuracion/esquema';
import type { Rol } from '../src/autenticacion/dominio/claims';

export const COP_A = '10000000-0000-4000-8000-000000000001';
export const COP_B = '10000000-0000-4000-8000-000000000002';

export const configuracionDePrueba: Configuracion = {
  NODE_ENV: 'test',
  PORT: 0,
  SUPABASE_URL: 'https://proyecto-de-prueba.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'marcador',
  SUPABASE_SECRET_KEY: 'marcador',
  SUPABASE_JWKS_URL: 'https://proyecto-de-prueba.invalid/auth/v1/.well-known/jwks.json',
  // La suite corre con la regla del contrato EN VIGOR. El interruptor tiene sus
  // propias pruebas, que lo apagan explícitamente: si el valor por defecto de
  // la suite fuera `false`, las 363 pruebas dejarían de comprobar RN-20 sin que
  // nadie lo notara — que es como se pierde un control.
  JWKS_CACHE_TTL_SEGUNDOS: 600,
  JWKS_REFRESCO_MINIMO_SEGUNDOS: 60,
  DATABASE_URL: 'marcador',
  DATABASE_POOLER_URL: 'marcador',
  INGESTA_FIRMA_SECRETO: 'secreto-de-ingesta-solo-para-pruebas-32+',
  BIOMETRIA_LLAVE: 'llave-de-biometria-solo-para-pruebas-32+',
  BIOMETRIA_LLAVE_REF: 'env:BIOMETRIA_LLAVE',
  BIOMETRIA_PLAZO_CONSENTIMIENTO_HORAS: 24,
  INGESTA_VENTANA_SEGUNDOS: 300,
  LIMITE_PAYLOAD: '256kb',
  THROTTLE_TTL_SEGUNDOS: 60,
  THROTTLE_LIMITE: 100000, // el límite se prueba aparte; aquí estorbaría
  THROTTLE_DISPOSITIVO_LIMITE: 120,
  THROTTLE_INGESTA_IP_LIMITE: 3000,
  origenesPermitidos: ['https://consola.invalid'],
};

const EMISOR = `${configuracionDePrueba.SUPABASE_URL}/auth/v1`;

export interface Firmante {
  emitir(
    claims: Record<string, unknown>,
    opciones?: {
      alg?: string;
      kid?: string;
      exp?: string | number;
      iss?: string;
      aud?: string;
    },
  ): Promise<string>;
  jwk: JWK;
  clavePublica: CryptoKey;
}

/**
 * Par de claves local. La suite NO toca la red: el JWKS se sustituye por una
 * función que devuelve la clave pública generada aquí. Depender de Supabase
 * para probar el aislamiento haría que la suite fallara por causas ajenas y
 * dejara de romper el build por lo que debe romperlo.
 */
export const crearFirmante = async (kid = 'clave-de-prueba'): Promise<Firmante> => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  return {
    jwk,
    clavePublica: publicKey as CryptoKey,
    async emitir(claims, opciones = {}) {
      return new SignJWT(claims)
        .setProtectedHeader({ alg: opciones.alg ?? 'RS256', kid: opciones.kid ?? kid })
        .setIssuedAt()
        .setIssuer(opciones.iss ?? EMISOR)
        .setAudience(opciones.aud ?? 'authenticated')
        .setExpirationTime(opciones.exp ?? '5m')
        .sign(privateKey);
    },
  };
};

export interface Identidad {
  rol: Rol;
  copropiedadId?: string | null;
  copropiedades?: string[];
  aal?: 'aal1' | 'aal2';
  usuarioId?: string;
}

export const tokenDe = async (f: Firmante, id: Identidad): Promise<string> =>
  f.emitir({
    sub: id.usuarioId ?? '00000000-0000-4000-8000-000000000010',
    usuario_id: id.usuarioId ?? '00000000-0000-4000-8000-000000000010',
    rol: id.rol,
    copropiedad_id: id.copropiedadId === undefined ? COP_A : id.copropiedadId,
    ...(id.copropiedades ? { copropiedades: id.copropiedades } : {}),
    aal: id.aal ?? 'aal2',
  });

/**
 * `sustituir` permite a una suite cambiar un proveedor concreto sin duplicar
 * este fixture. Se añadió en la ETAPA 09-A para poder probar la recuperación
 * del segundo factor sin llamar a Supabase: lo que se sustituye es el PUERTO
 * `AdministradorDeFactores`, no el controlador, así que lo que se ejercita
 * sigue siendo el camino real.
 */
export const crearApp = async (
  firmante: Firmante,
  sustituir?: (constructor: TestingModuleBuilder) => TestingModuleBuilder,
  /**
   * Variaciones de CONFIGURACIÓN, no de proveedores. Sustituir el proveedor de
   * la política de MFA probaría el guard pero no el cableado que va de la
   * variable de entorno al guard, que es justo donde un interruptor de
   * seguridad se rompe: el esquema la lee, el módulo no la pasa, y el guard
   * recibe el valor por defecto sin que nadie lo note.
   */
  configuracion?: Partial<Configuracion>,
): Promise<INestApplication> => {
  const base = Test.createTestingModule({
    imports: [
      AppModule.conConfiguracion(
        configuracion === undefined
          ? configuracionDePrueba
          : { ...configuracionDePrueba, ...configuracion },
      ),
    ],
  });
  const modulo = await (sustituir === undefined ? base : sustituir(base))
    .overrideProvider(ProveedorDeJwks)
    .useValue({
      // `obtener()` devuelve la función que `jose` usa para resolver la clave
      // a partir del encabezado. Aquí resuelve siempre a la pública local.
      obtener: () => async () => firmante.clavePublica,
      sondear: async () => ({ estado: 'ok', claves: 1 }),
      disponible: true,
    })
    .compile();

  // `bodyParser: false` + el mismo `express.json({ verify })` de `main.ts`.
  // Sin esto la suite probaría una tubería distinta de la de producción, y la
  // firma del Alarm Server —que se calcula sobre el cuerpo CRUDO— no tendría
  // cuerpo crudo que verificar.
  const app = modulo.createNestApplication({ logger: false, bodyParser: false });
  app.use(
    express.json({ limit: configuracionDePrueba.LIMITE_PAYLOAD, verify: guardarCuerpoCrudo }),
  );
  app.use(express.urlencoded({ limit: configuracionDePrueba.LIMITE_PAYLOAD, extended: false }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  /**
   * El servidor escucha AQUÍ, una sola vez, y el fixture es dueño de su ciclo
   * de vida. No es un detalle de estilo: es la corrección de una prueba
   * intermitente (`socket hang up`, 2026-09-08).
   *
   * `supertest` es un cliente, pero si el servidor que recibe no está
   * escuchando se comporta como uno: en su constructor hace
   * `if (!app.address()) this._server = app.listen(0)` y, al terminar la
   * petición, `server.close()`. Medido: con `app.init()` a secas, **300
   * peticiones producen 300 `listen()` y 300 `close()`** —un socket de escucha
   * nuevo, en un puerto efímero distinto, montado y derribado por cada
   * petición— y el servidor queda sin escuchar al final. Con esta línea, 300
   * peticiones producen **un `listen()` y ningún `close()`**.
   *
   * Cientos de bind/close por fichero, en paralelo con los demás ficheros de la
   * suite, es una carrera esperando a ocurrir: la URL se fija en el constructor
   * de `supertest` y la conexión se abre después, así que basta con que otra
   * petición cierre el servidor en medio para que el cliente encuentre el
   * socket muerto. Eso es exactamente `socket hang up`, y explica por qué solo
   * aparecía a veces y por qué reejecutar «lo arreglaba».
   *
   * Con el servidor escuchando de antemano, `app.address()` nunca es nulo,
   * `supertest` no monta ni derriba nada y la única forma de cerrar el
   * servidor es el `app.close()` del `afterAll`.
   */
  await app.listen(0);
  return app;
};

/**
 * Dirección real del servidor de pruebas.
 *
 * Existe porque `crearApp` ya deja el servidor escuchando: lo que antes había
 * que montar a mano para hablar por socket, ahora se pregunta.
 */
export const direccionDe = (app: INestApplication): string => {
  const direccion = (app.getHttpServer() as { address(): { port: number } | null }).address();
  if (direccion === null) throw new Error('el servidor de pruebas no está escuchando');
  return `http://127.0.0.1:${direccion.port}`;
};

/**
 * Enumera las rutas REALES del enrutador de Nest.
 *
 * Es la pieza que hace que «100 % de endpoints» sea verdad y no una promesa:
 * una lista escrita a mano envejece en la primera etapa que añada un
 * controlador. Al leer el enrutador, un endpoint nuevo sin cobertura hace
 * fallar la suite el día que se añade.
 */
export interface RutaExpuesta {
  metodo: string;
  ruta: string;
}

export const enumerarRutas = (app: INestApplication): RutaExpuesta[] => {
  const servidor = app.getHttpAdapter().getInstance() as {
    _router?: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
    router?: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
  };
  const pila = servidor._router?.stack ?? servidor.router?.stack ?? [];
  const rutas: RutaExpuesta[] = [];
  for (const capa of pila) {
    if (!capa.route) continue;
    for (const [metodo, activo] of Object.entries(capa.route.methods)) {
      if (activo) rutas.push({ metodo: metodo.toUpperCase(), ruta: capa.route.path });
    }
  }
  return rutas;
};
