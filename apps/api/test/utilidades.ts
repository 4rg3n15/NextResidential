import { generateKeyPair, SignJWT, exportJWK } from 'jose';
import type { JWK } from 'jose';
import { Test } from '@nestjs/testing';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { CLAVE_ROLES } from '../src/comun/decoradores';
import type { TestingModuleBuilder } from '@nestjs/testing';
import express from 'express';
import { guardarCuerpoCrudo } from '../src/autorizaciones/presentacion/guardia-firma';
import {
  LIMITE_DE_FOTOGRAFIA,
  RUTA_DE_FOTOGRAFIA_DE_VISITANTE,
} from '../src/autorizaciones/presentacion/limites';
import { acumularSobreCrudo, RUTA_DE_ALARM_SERVER } from '../src/comun/sobre-de-equipo';
import type { INestApplication } from '@nestjs/common';
import { aplicarSaneamiento, aplicarSeguridad } from '../src/seguridad';
import { aplicarContextoDePeticion } from '../src/comun/contexto/contexto-de-peticion';
import { InterceptorDeCorrelacion } from '../src/comun/interceptores/correlacion';
import { InterceptorDeLatencias, REPORTE_DE_ERRORES } from '../src/observabilidad';
import type { ReporteDeErrores } from '../src/observabilidad';
import { GENERADOR_DE_ID } from '@ncr/domain-core';
import type { GeneradorDeId } from '@ncr/domain-core';
import { AppModule } from '../src/app.module';
import { SONDA_POSTGRES } from '../src/arranque/sonda-postgres';
import { ProveedorDeJwks } from '../src/autenticacion/infraestructura/jwks';
import {
  REPOSITORIO_COPROPIEDADES,
  RepositorioCopropiedadesEnMemoria,
} from '../src/multiempresa/repositorio-copropiedades';
import type { Configuracion } from '../src/configuracion/esquema';
import type { Rol } from '../src/autenticacion/dominio/claims';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { FiltroGlobalDeExcepciones } from '../src/comun/filtros/filtro-global';
import { REPOSITORIO_DE_EQUIPOS, SIN_PROBAR, SONDA_DE_EQUIPO } from '../src/equipos';
import { REPOSITORIO_AUTORIZACIONES_ZONA, REPOSITORIO_ZONAS } from '../src/zonas';
import { RepositorioZonasEnMemoria } from '../src/zonas/infraestructura/repositorio-zonas-memoria';
import { RepositorioDeEquiposEnMemoria } from '../src/equipos/infraestructura/repositorio-equipos-en-memoria';
import { COP_A, COP_B } from './constantes';
import {
  AUTORIZACIONES_DEL_RESIDENTE,
  DIRECTORIO_DEL_RESIDENTE,
  NOTIFICACIONES_DEL_RESIDENTE,
  ZONAS_DEL_RESIDENTE,
} from '../src/residente/aplicacion/puertos';
import {
  AutorizacionesDelResidenteEnMemoria,
  DirectorioDelResidenteEnMemoria,
  NotificacionesDelResidenteEnMemoria,
  ZonasDelResidenteEnMemoria,
} from './dobles/directorio-del-residente';

export { COP_A, COP_B } from './constantes';

export const configuracionDePrueba: Configuracion = {
  NODE_ENV: 'test',
  PG_POOL_MAX: 20,
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
  EQUIPOS_LLAVE: 'llave-de-equipos-solo-para-pruebas-32+',
  EQUIPOS_LLAVE_REF: 'env:EQUIPOS_LLAVE',
  BIOMETRIA_PLAZO_CONSENTIMIENTO_HORAS: 24,
  /**
   * La suite corre SIEMPRE contra el simulado, que es lo que ADR-03 exige poder
   * hacer: el sistema completo tiene que demostrarse sin hardware. El adaptador
   * real se ejercita en la suite de contrato, contra el equipo simulado.
   */
  PROVEEDOR_DE_EQUIPOS: 'simulado',
  PROVEEDOR_SEMILLA: 20260908,
  // Este banco no tiene base: el cargador que lee de ella fallaría en cada
  // lectura. El conservador deniega, que es lo que las suites de la API
  // esperan; el cargador PostgreSQL tiene su propia suite contra base real.
  CARGADOR_DE_CONTEXTO: 'conservador',
  // La suite no tiene base: el histórico va en memoria, y lo dice al arrancar.
  PERSISTENCIA_DE_EVENTOS: 'memoria',
  PERSISTENCIA_DE_BIOMETRIA: 'memoria',
  INGESTA_VENTANA_SEGUNDOS: 300,
  LIMITE_PAYLOAD: '256kb',
  LOG_LEVEL: 'aviso',
  PGBOSS_SCHEMA: 'pgboss',
  // La suite NUNCA planifica: veinte aplicaciones montadas abrirían veinte
  // conexiones de pg-boss contra una base que en este banco no existe.
  PLANIFICADOR_HABILITADO: false,
  METRICAS_VENTANA: 2048,
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
  /**
   * ETAPA 15-B · los dos puertos de equipos se pasan POR AQUÍ y no por
   * `sustituir`, porque los `overrideProvider` de más abajo se aplican DESPUÉS
   * y ganarían: una suite que los sustituyera con `sustituir` vería su doble
   * ignorado y la prueba pasaría por la razón equivocada. Pasó, y por eso está
   * escrito.
   */
  equipos?: {
    readonly repositorio?: unknown;
    readonly sonda?: { probar: (d: unknown) => Promise<unknown> };
  },
): Promise<INestApplication> => {
  const equiposPorOmision = equipos?.repositorio;
  const sondaPorOmision = equipos?.sonda;
  const base = Test.createTestingModule({
    imports: [
      // `DiscoveryModule` para poder LEER los decoradores del código en la
      // suite de aislamiento, en vez de mantener una lista paralela en la
      // prueba que diga verificarlos y no los verifique.
      DiscoveryModule,
      AppModule.conConfiguracion(
        configuracion === undefined
          ? configuracionDePrueba
          : { ...configuracionDePrueba, ...configuracion },
      ),
    ],
  });
  const modulo = await (sustituir === undefined ? base : sustituir(base))
    /**
     * El catálogo de copropiedades se sustituye por el doble en memoria.
     *
     * En producción lo sirve PostgreSQL bajo la RLS; aquí no hay contraseña
     * (D-17) y una consulta real dejaría la suite dependiendo de una base. Lo
     * que estas pruebas ejercitan es el **filtro de aplicación**, que es la
     * barrera que sigue en pie cuando la llave secreta omite la RLS. El camino
     * de la RLS se prueba aparte y contra base real.
     */
    .overrideProvider(REPOSITORIO_COPROPIEDADES)
    .useFactory({
      factory: () => {
        const catalogo = new RepositorioCopropiedadesEnMemoria();
        catalogo.declarar([
          { id: COP_A, nombre: 'Copropiedad A', zonaHoraria: 'America/Bogota' },
          { id: COP_B, nombre: 'Copropiedad B', zonaHoraria: 'America/Bogota' },
        ]);
        return catalogo;
      },
    })
    /**
     * El directorio del residente, con su doble en memoria y DOS VIVIENDAS
     * pobladas en la misma copropiedad.
     *
     * Se sustituye aquí —y no en cada suite— porque el eje de aislamiento que
     * la ETAPA 11 añade es residente contra residente DENTRO del mismo
     * conjunto, y sin dos viviendas con datos distinguibles ese recorrido
     * pasaría en verde con una implementación que solo filtrara por
     * copropiedad. El adaptador PostgreSQL se ejerce aparte, contra base real.
     */
    .overrideProvider(DIRECTORIO_DEL_RESIDENTE)
    .useFactory({ factory: () => new DirectorioDelResidenteEnMemoria() })
    // Los tres puertos que 11-B añadió. El de escritura guarda por ámbito, que
    // es lo que hace que la prueba del segundo eje diga algo sobre las
    // escrituras y no solo sobre las lecturas.
    .overrideProvider(AUTORIZACIONES_DEL_RESIDENTE)
    .useFactory({ factory: () => new AutorizacionesDelResidenteEnMemoria() })
    .overrideProvider(ZONAS_DEL_RESIDENTE)
    .useFactory({ factory: () => new ZonasDelResidenteEnMemoria() })
    .overrideProvider(NOTIFICACIONES_DEL_RESIDENTE)
    .useFactory({ factory: () => new NotificacionesDelResidenteEnMemoria() })
    /**
     * ETAPA 15-B · los equipos, con su doble en memoria y su sonda muda.
     *
     * El repositorio real habla con PostgreSQL y la sonda real habla con un
     * aparato: los dos quedan fuera del alcance de esta suite por el mismo
     * motivo (D-17 y ADR-03). Lo que aquí se ejercita es el camino completo de
     * la petición —rol, alcance, forma del DTO y, sobre todo, que el secreto no
     * vuelve— y eso no necesita ni base ni cámara.
     *
     * La sonda devuelve «guardado sin comprobar» porque es el veredicto
     * honesto cuando no hay equipo al otro lado. Las suites que prueban los
     * cuatro resultados la sustituyen por el suyo.
     */
    /**
     * ETAPA 15-D (P1) · las zonas ya persisten en PostgreSQL en producción; en
     * este banco sin base se vuelve al doble en memoria, que es la MISMA
     * instancia que las suites siembran por `RepositorioZonasEnMemoria`.
     */
    .overrideProvider(REPOSITORIO_ZONAS)
    .useFactory({
      factory: (enMemoria: RepositorioZonasEnMemoria) => enMemoria,
      inject: [RepositorioZonasEnMemoria],
    })
    .overrideProvider(REPOSITORIO_AUTORIZACIONES_ZONA)
    .useFactory({
      factory: (enMemoria: RepositorioZonasEnMemoria) => enMemoria.permisosDeZona,
      inject: [RepositorioZonasEnMemoria],
    })
    .overrideProvider(REPOSITORIO_DE_EQUIPOS)
    .useFactory({ factory: () => equiposPorOmision ?? new RepositorioDeEquiposEnMemoria() })
    .overrideProvider(SONDA_DE_EQUIPO)
    .useValue(sondaPorOmision ?? { probar: async () => SIN_PROBAR })
    .overrideProvider(ProveedorDeJwks)
    .useValue({
      // `obtener()` devuelve la función que `jose` usa para resolver la clave
      // a partir del encabezado. Aquí resuelve siempre a la pública local.
      obtener: () => async () => firmante.clavePublica,
      sondear: async () => ({ estado: 'ok', claves: 1 }),
      disponible: true,
    })
    /**
     * La sonda de PostgreSQL, con doble. La suite no tiene base —los
     * repositorios de estos módulos son los de memoria— y sin este reemplazo
     * `/ready` respondería 503 en todas las pruebas.
     *
     * Que quede dicho, porque es exactamente el patrón que esta ronda persigue:
     * **este doble no demuestra nada sobre la base real.** Lo que sí la toca es
     * la comprobación de arranque de `main.ts` y el `/ready` del proceso
     * desplegado, que ejecutan un `SELECT 1` de verdad. Un doble aquí evita que
     * la suite dependa de una base; no sustituye a esa comprobación.
     */
    .overrideProvider(SONDA_POSTGRES)
    .useValue({ comprobar: async () => ({ estado: 'ok', detalle: 'doble de pruebas' }) })
    .compile();

  // `bodyParser: false` + el mismo `express.json({ verify })` de `main.ts`.
  // Sin esto la suite probaría una tubería distinta de la de producción, y la
  // firma del Alarm Server —que se calcula sobre el cuerpo CRUDO— no tendría
  // cuerpo crudo que verificar.
  const app = modulo.createNestApplication({ logger: false, bodyParser: false });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * LA TUBERÍA DEL DESPLIEGUE, NO UNA IMITACIÓN · H-13-11
   *
   * Hasta la ETAPA 13 este fixture RECONSTRUÍA a mano el `ValidationPipe` y no
   * llamaba a `aplicarSeguridad` en absoluto. La consecuencia, medida:
   *
   *   $ vitest run --coverage --coverage.include='src/seguridad.ts'
   *     Tests  656 passed | 5 skipped (661)
   *     seguridad.ts | 0 % Stmts | 0 % Lines | 1-57
   *
   * Cero. Las 656 pruebas en verde no ejercitaban NI UNA LÍNEA del
   * endurecimiento HTTP: ni la lista blanca de CORS, ni la CSP, ni HSTS, ni el
   * pipe real. Cambiar `origin:` por `true`, o borrar `forbidNonWhitelisted`,
   * no ponía nada en rojo. Y los dos literales ya habían divergido: producción
   * pasaba `transformOptions: { enableImplicitConversion: false }` y el fixture
   * no, así que la suite validaba con reglas de conversión distintas.
   *
   * Es la familia de falso verde que §2.8.0 documenta —la metadata de
   * decoradores en la 03, el `dist` viejo en la 04—, aplicada esta vez a §2.7.2,
   * §2.7.3 y §2.7.7. Mientras estuvo así, toda afirmación de los informes de
   * etapa sobre esas tres secciones se apoyaba en una tubería que el despliegue
   * no usa.
   *
   * El orden replica `main.ts` exactamente, y el orden es parte del contrato:
   * `aplicarSaneamiento` va DESPUÉS de los parsers porque antes no hay cuerpo.
   * ═════════════════════════════════════════════════════════════════════════
   */
  /**
   * ETAPA 14 · el contexto de petición va PRIMERO, igual que en `main.ts`.
   *
   * Y está aquí por la misma lección de H-13-11: lo que el banco no monta, el
   * banco no prueba. Si la correlación y el interceptor de latencias se
   * cablearan solo en `main.ts`, la suite pasaría en verde sobre una API que
   * no es la que se despliega — que es exactamente el defecto que se corrigió
   * cuando se descubrió que `aplicarSeguridad` no se llamaba aquí.
   */
  aplicarContextoDePeticion(app, () => app.get<GeneradorDeId>(GENERADOR_DE_ID).nuevo());

  aplicarSeguridad(app, configuracionDePrueba);
  /**
   * ETAPA 15 · el acumulador del sobre crudo, ANTES de `express.json` y sólo
   * bajo su ruta — igual que en `main.ts`, y por la misma lección de H-13-11.
   * Si se cableara sólo allí, la suite probaría un receptor de «servidor de
   * alarma» que nunca recibe cuerpo, y estaría en verde.
   */
  app.use(RUTA_DE_ALARM_SERVER, acumularSobreCrudo);
  app.use(
    RUTA_DE_FOTOGRAFIA_DE_VISITANTE,
    express.json({ limit: LIMITE_DE_FOTOGRAFIA, verify: guardarCuerpoCrudo }),
  );
  app.use(
    express.json({ limit: configuracionDePrueba.LIMITE_PAYLOAD, verify: guardarCuerpoCrudo }),
  );
  app.use(express.urlencoded({ limit: configuracionDePrueba.LIMITE_PAYLOAD, extended: false }));
  aplicarSaneamiento(app);
  /**
   * EL MISMO FILTRO GLOBAL QUE PRODUCCIÓN.
   *
   * Faltaba, y la consecuencia no era teórica: `main.ts` envuelve todo error en
   * `{ estado, correlacion, mensaje }`, mientras que aquí salía el cuerpo por
   * defecto de Nest. Es decir, **toda aserción de esta suite sobre un cuerpo de
   * error estaba comprobando una forma que el despliegue no produce**, y una
   * pantalla escrita contra lo que la suite ve habría leído el campo
   * equivocado en producción sin que nada fallara en verde.
   *
   * Apareció al montar el 422 de configuración (bloque 7), que es el primer
   * error cuyo CUERPO la consola necesita —los rechazos por campo—.
   */
  app.useGlobalFilters(
    new FiltroGlobalDeExcepciones(
      app.get<Bitacora>(BITACORA),
      app.get<ReporteDeErrores>(REPORTE_DE_ERRORES),
    ),
  );
  app.useGlobalInterceptors(app.get(InterceptorDeCorrelacion), app.get(InterceptorDeLatencias));
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

/**
 * Rutas que llevan un metadato de decorador, **leído del código y no de una
 * lista escrita en la prueba**.
 *
 * Por qué hace falta (ETAPA 09-B). La suite de aislamiento mantenía sus
 * exenciones como conjuntos literales y las «correspondía» con el código
 * comprobando solo que la ruta existiera en el enrutador — lo cual es cierto
 * de cualquier ruta, tenga el decorador o no. Es decir: el control decía
 * verificar la correspondencia y no la verificaba. Decimosexta aparición de la
 * familia, y justo sobre las exenciones del aislamiento.
 *
 * Ahora la fuente es `Reflector` sobre el manejador real: si alguien añade una
 * ruta al conjunto de la prueba sin poner el decorador —o al revés—, los dos
 * conjuntos dejan de coincidir y la suite rompe el build.
 */
export const rutasConMetadato = (app: INestApplication, clave: string): string[] => {
  const descubrimiento = app.get(DiscoveryService);
  const reflector = app.get(Reflector);
  const escaner = new MetadataScanner();
  const rutas = new Set<string>();

  for (const envoltorio of descubrimiento.getControllers()) {
    const { instance, metatype } = envoltorio;
    if (!instance || !metatype) continue;
    const prefijo = reflector.get<string>(PATH_METADATA, metatype) ?? '';
    const prototipo = Object.getPrototypeOf(instance) as object;

    for (const nombre of escaner.getAllMethodNames(prototipo)) {
      const manejador = (instance as Record<string, unknown>)[nombre];
      if (typeof manejador !== 'function') continue;
      const marcado =
        reflector.get<boolean>(clave, manejador) === true ||
        reflector.get<boolean>(clave, metatype) === true;
      if (!marcado) continue;
      const sufijo = reflector.get<string>(PATH_METADATA, manejador) ?? '';
      rutas.add(`/${[prefijo, sufijo].filter((p) => p !== '' && p !== '/').join('/')}`);
    }
  }
  return [...rutas].sort();
};

/**
 * Rutas que declaran un rol concreto en su `@Roles(...)`, **leído del código**.
 *
 * `rutasConMetadato` solo sirve para marcas booleanas; `CLAVE_ROLES` guarda un
 * arreglo. Hace falta para el recorrido del segundo eje: la lista de rutas que
 * un residente alcanza no se escribe en la prueba —envejecería en la primera
 * que se añada— sino que se deriva del enrutador, y la suite exige que todas
 * tengan su comprobación de vivienda.
 */
export const rutasConRol = (app: INestApplication, rol: Rol): RutaExpuesta[] => {
  const descubrimiento = app.get(DiscoveryService);
  const reflector = app.get(Reflector);
  const escaner = new MetadataScanner();
  const rutas: RutaExpuesta[] = [];

  for (const envoltorio of descubrimiento.getControllers()) {
    const { instance, metatype } = envoltorio;
    if (!instance || !metatype) continue;
    const prefijo = reflector.get<string>(PATH_METADATA, metatype) ?? '';
    const prototipo = Object.getPrototypeOf(instance) as object;

    for (const nombre of escaner.getAllMethodNames(prototipo)) {
      const manejador = (instance as Record<string, unknown>)[nombre];
      if (typeof manejador !== 'function') continue;
      const roles =
        reflector.get<string[]>(CLAVE_ROLES, manejador) ??
        reflector.get<string[]>(CLAVE_ROLES, metatype) ??
        [];
      if (!roles.includes(rol)) continue;
      const sufijo = reflector.get<string>(PATH_METADATA, manejador) ?? '';
      const ruta = `/${[prefijo, sufijo].filter((p) => p !== '' && p !== '/').join('/')}`;
      const metodo = METODOS.find(
        (m) => reflector.get<unknown>(METHOD_METADATA, manejador) === m.codigo,
      );
      rutas.push({ metodo: metodo?.nombre ?? 'GET', ruta });
    }
  }
  return rutas.sort((a, b) => `${a.metodo} ${a.ruta}`.localeCompare(`${b.metodo} ${b.ruta}`));
};

/**
 * `METHOD_METADATA` de Nest guarda el verbo como número del enum
 * `RequestMethod`. Se traduce aquí en vez de confiar en el orden del enum.
 */
const METODOS = [
  { codigo: RequestMethod.GET, nombre: 'GET' },
  { codigo: RequestMethod.POST, nombre: 'POST' },
  { codigo: RequestMethod.PUT, nombre: 'PUT' },
  { codigo: RequestMethod.DELETE, nombre: 'DELETE' },
  { codigo: RequestMethod.PATCH, nombre: 'PATCH' },
] as const;
