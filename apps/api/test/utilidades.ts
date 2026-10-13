import { generateKeyPair, SignJWT, exportJWK } from 'jose';
import type { JWK, KeyLike } from 'jose';
import { Test } from '@nestjs/testing';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { CLAVE_ROLES } from '../src/comun/decoradores';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { montarTuberiaHttp } from '../src/arranque/tuberia-http';
import { AppModule } from '../src/app.module';
import { ControlDeIpDePorteros, ModoPruebas } from '../src/plataforma';
import { SONDA_POSTGRES } from '../src/arranque/sonda-postgres';
import { ProveedorDeJwks } from '../src/autenticacion/infraestructura/jwks';
import {
  REPOSITORIO_COPROPIEDADES,
  RepositorioCopropiedadesEnMemoria,
} from '../src/multiempresa/repositorio-copropiedades';
import type { Configuracion } from '../src/configuracion/esquema';
import type { Rol } from '../src/autenticacion/dominio/claims';
import { REPOSITORIO_DE_EQUIPOS, SIN_PROBAR, SONDA_DE_EQUIPO } from '../src/equipos';
import type { SondaDeEquipo } from '../src/equipos';
import { REPOSITORIO_AUTORIZACIONES_ZONA, REPOSITORIO_ZONAS } from '../src/zonas';
import { RepositorioZonasEnMemoria } from '../src/zonas/infraestructura/repositorio-zonas-memoria';
import { RepositorioDeEquiposEnMemoria } from '../src/equipos/infraestructura/repositorio-equipos-en-memoria';
import { COP_A, COP_B, EQUIPOS_DEL_BANCO } from './constantes';
import {
  CODIGO_DE_PATRULLAJE,
  ControlDeSesiones,
  REPOSITORIO_DE_PERFILES,
  REPOSITORIO_DE_SESIONES,
  REPOSITORIO_DE_TURNOS,
} from '../src/porteria';
import type {
  CodigoDePatrullaje,
  RepositorioDePerfiles,
  RepositorioDeSesiones,
  RepositorioDeTurnos,
} from '../src/porteria';
import { BITACORA_DE_IDENTIDAD } from '../src/comun/bitacora-de-identidad';
import type { BitacoraDeIdentidad } from '../src/comun/bitacora-de-identidad';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { ControlConLaSesionDeLaSuite, SESION_DE_LA_SUITE } from './dobles/sesion-de-la-suite';
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
import { HogarEnMemoria } from './dobles/hogar-en-memoria';
import { MenoresParaElRostroEnMemoria } from './dobles/menores-para-el-rostro';
import { MENORES_PARA_EL_ROSTRO } from '../src/residente/aplicacion/rostro-de-mis-menores';
import {
  ALTA_DEL_RESIDENTE,
  BITACORA_DE_RESIDENTES,
  CUENTAS_DE_RESIDENTES,
  OCUPANTES_DE_LA_VIVIENDA,
  PERFIL_DEL_RESIDENTE,
  VEHICULOS_PROPIOS,
} from '../src/residente/aplicacion/puertos-hogar';

export { COP_A, COP_B, EQUIPO_DE_B } from './constantes';

export const configuracionDePrueba: Configuracion = {
  NODE_ENV: 'test',
  PG_POOL_MAX: 10,
  SUPABASE_POOLER_MAX_CLIENTES: 15,
  PGBOSS_POOL_MAX: 2,
  EVENTOS_HISTORICOS_LOTE: 500,
  EVENTOS_HISTORICOS_POR_SEGUNDO: 500,
  PORT: 0,
  // H6 (15-L) · supertest llega por el bucle local: como el proxy de la consola.
  API_PROXIES_DE_CONFIANZA: 'loopback',
  MODO_PRUEBAS_FACTOR_DE_LIMITE: 10,
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
  /**
   * La suite corre SIEMPRE contra el simulado, que es lo que ADR-03 exige poder
   * hacer: el sistema completo tiene que demostrarse sin hardware. El adaptador
   * real se ejercita en la suite de contrato, contra el equipo simulado.
   */
  PROVEEDOR_DE_EQUIPOS: 'simulado',
  PROVEEDOR_SEMILLA: 20260908,
  TERMINAL_ABRE_SIN_PLATAFORMA: false,
  TERMINAL_PLAZO_DE_VERIFICACION_S: 8,
  EQUIPOS_TIEMPO_LIMITE_MS: 5000,
  EQUIPOS_ZONA_HORARIA: 'America/Bogota',
  TERMINAL_PLAN_DE_HORARIO: '1',
  EQUIPOS_FOTO_KB_MAXIMOS: 200,
  EQUIPOS_FOTO_LADO_MAXIMO: 1024,
  VIDEO_PUERTO_RTSP: 554,
  VIDEO_TRANSCODIFICAR: 'auto',
  // C4 · el latido corre por intervalo; las suites que lo miran llaman a la pasada.
  EQUIPOS_LATIDO_S: 0,
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
  // O6 (15-N) · los valores por omisión del esquema, explícitos: este literal no
  // pasa por él, y sin ellos la ventana de alertas valía NaN (ver
  // `configuracion-de-prueba.test.ts`).
  ALERTAS_VENTANA_DEDUP_S: 600,
  GUARDIA_VIGENCIA_EN_COLA_S: 300,
  GUARDIA_AUDIO_TRANSPORTE: 'websocket',
  EQUIPOS_DESVIO_DE_RELOJ_S: 30,
  ROSTRO_RESIDENTE_RETENCION_DIAS: 365,
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
  /**
   * Lo que `jose` entrega y lo que su verificación acepta. No `CryptoKey`: ese
   * tipo es de WebCrypto (lib DOM), y abrir las pruebas a los globales del
   * navegador dejaría compilar lo que en Node no existe (DT-15S1-03).
   */
  clavePublica: KeyLike;
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
    clavePublica: publicKey,
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
  /** 15-H · `session_id`. Al portero se le pone el de la suite si no se da otro. */
  sesionId?: string;
  /** 15-H · primer ingreso pendiente (ADR-023). */
  debeCambiarContrasena?: boolean;
}

export const tokenDe = async (f: Firmante, id: Identidad): Promise<string> =>
  f.emitir({
    sub: id.usuarioId ?? '00000000-0000-4000-8000-000000000010',
    usuario_id: id.usuarioId ?? '00000000-0000-4000-8000-000000000010',
    rol: id.rol,
    copropiedad_id: id.copropiedadId === undefined ? COP_A : id.copropiedadId,
    ...(id.copropiedades ? { copropiedades: id.copropiedades } : {}),
    aal: id.aal ?? 'aal2',
    ...(id.sesionId !== undefined
      ? { session_id: id.sesionId }
      : id.rol === 'portero'
        ? { session_id: SESION_DE_LA_SUITE }
        : {}),
    ...(id.debeCambiarContrasena === true ? { debe_cambiar_contrasena: true } : {}),
  });

/**
 * ETAPA 15-H · la sesión de portería de la suite (ver `dobles/sesion-de-la-suite`).
 * Las suites anteriores emiten tokens de portero sin iniciar sesión, y el
 * turno les es ortogonal. Cualquier otro `session_id` recorre el camino real
 * de la guarda. Se exporta para las suites que montan su propio banco.
 */
export const conSesionDePorteriaDeLaSuite = (b: TestingModuleBuilder): TestingModuleBuilder =>
  b.overrideProvider(ControlDeSesiones).useFactory({
    factory: (
      p: RepositorioDePerfiles,
      t: RepositorioDeTurnos,
      se: RepositorioDeSesiones,
      c: CodigoDePatrullaje,
      bi: BitacoraDeIdentidad,
      r: Reloj,
      origen: ControlDeIpDePorteros,
    ) => new ControlConLaSesionDeLaSuite(p, t, se, c, bi, r, origen),
    inject: [
      REPOSITORIO_DE_PERFILES,
      REPOSITORIO_DE_TURNOS,
      REPOSITORIO_DE_SESIONES,
      CODIGO_DE_PATRULLAJE,
      BITACORA_DE_IDENTIDAD,
      RELOJ,
      // H4 (15-L) · la regla de IP REAL también en el doble: el inicio de
      // sesión del portero la evalúa como en producción.
      ControlDeIpDePorteros,
    ],
  });

/**
 * `sustituir` permite a una suite cambiar un proveedor concreto sin duplicar
 * este fixture. Se añadió en la ETAPA 09-A para poder probar la recuperación
 * del segundo factor sin llamar a Supabase: lo que se sustituye es el PUERTO
 * `AdministradorDeFactores`, no el controlador, así que lo que se ejercita
 * sigue siendo el camino real.
 */
/**
 * El directorio del residente, con su doble en memoria y DOS VIVIENDAS
 * pobladas en la misma copropiedad, y los puertos de 11-B y de la 15-I.
 *
 * Se sustituye aquí —y no en cada suite— porque el eje de aislamiento que la
 * ETAPA 11 añade es residente contra residente DENTRO del mismo conjunto, y sin
 * dos viviendas con datos distinguibles ese recorrido pasaría en verde con una
 * implementación que solo filtrara por copropiedad. Los adaptadores PostgreSQL
 * se ejercen contra base real.
 */
const conDoblesDelResidente = (b: TestingModuleBuilder): TestingModuleBuilder => {
  const hogar = new HogarEnMemoria();
  // 15-X (D3) · y un menor en cada vivienda: el del vecino responde 404.
  return b
    .overrideProvider(DIRECTORIO_DEL_RESIDENTE)
    .useFactory({ factory: () => new DirectorioDelResidenteEnMemoria() })
    .overrideProvider(AUTORIZACIONES_DEL_RESIDENTE)
    .useFactory({ factory: () => new AutorizacionesDelResidenteEnMemoria() })
    .overrideProvider(ZONAS_DEL_RESIDENTE)
    .useFactory({ factory: () => new ZonasDelResidenteEnMemoria() })
    .overrideProvider(NOTIFICACIONES_DEL_RESIDENTE)
    .useFactory({ factory: () => new NotificacionesDelResidenteEnMemoria() })
    .overrideProvider(ALTA_DEL_RESIDENTE)
    .useValue(hogar)
    .overrideProvider(OCUPANTES_DE_LA_VIVIENDA)
    .useValue(hogar)
    .overrideProvider(VEHICULOS_PROPIOS)
    .useValue(hogar)
    .overrideProvider(PERFIL_DEL_RESIDENTE)
    .useValue(hogar)
    .overrideProvider(BITACORA_DE_RESIDENTES)
    .useValue(hogar)
    .overrideProvider(CUENTAS_DE_RESIDENTES)
    .useValue(hogar)
    .overrideProvider(MENORES_PARA_EL_ROSTRO)
    .useFactory({ factory: () => new MenoresParaElRostroEnMemoria() });
};

/** 15-L · el registro de equipos del banco sin base, cada uno en su copropiedad. */
export const registroDelBanco = (): RepositorioDeEquiposEnMemoria => {
  const registro = new RepositorioDeEquiposEnMemoria();
  for (const equipo of EQUIPOS_DEL_BANCO) registro.sembrar(equipo.copropiedadId, equipo);
  return registro;
};

/**
 * H5 (15-L) · el modo pruebas arranca ACTIVO, como en la base. La suite que
 * prueba una restricción de porteros —límites, bloqueo, reglas de IP— lo apaga
 * por el camino de producción (el mismo que usa la consola).
 */
export const sinModoPruebas = async (app: INestApplication): Promise<void> => {
  await app.get(ModoPruebas).cambiar(false, '00000000-0000-4000-8000-0000000000aa', null);
};

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
    readonly sonda?: SondaDeEquipo;
  },
): Promise<INestApplication> => {
  const equiposPorOmision = equipos?.repositorio;
  const sondaPorOmision = equipos?.sonda;
  // La MISMA configuración para el módulo y para lo que se monta fuera de él
  // (seguridad, límites del cuerpo). Hasta la 15-L, `aplicarSeguridad` recibía
  // siempre la de prueba: una suite que variaba `API_PROXIES_DE_CONFIANZA`
  // probaba el `trust proxy` por omisión sin saberlo.
  const efectiva: Configuracion =
    configuracion === undefined
      ? configuracionDePrueba
      : { ...configuracionDePrueba, ...configuracion };
  const base = Test.createTestingModule({
    imports: [
      // `DiscoveryModule` para poder LEER los decoradores del código en la
      // suite de aislamiento, en vez de mantener una lista paralela en la
      // prueba que diga verificarlos y no los verifique.
      DiscoveryModule,
      AppModule.conConfiguracion(efectiva),
    ],
  });
  // La sesión de la suite va ANTES de `sustituir`, para que una suite que
  // quiera el control real de portería pueda reemplazarlo y gane.
  const conSuite = conSesionDePorteriaDeLaSuite(base);
  const sustituido = sustituir === undefined ? conSuite : sustituir(conSuite);
  const baseReal = configuracion?.PERSISTENCIA_DE_EVENTOS === 'postgres';
  const conCatalogo = baseReal
    ? sustituido
    : sustituido
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
        });
  /**
   * ETAPA 15-I · con base real (`PERSISTENCIA_DE_EVENTOS=postgres`) el catálogo
   * de copropiedades, el residente y su hogar usan sus adaptadores PostgreSQL:
   * la suite contra base recorre la cadena ENTERA —configuración → identidad →
   * vivienda → plazas → vehículos— y no un doble. Sin base, los de siempre.
   */
  const modulo = await (baseReal ? conCatalogo : conDoblesDelResidente(conCatalogo))
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
    .useFactory({ factory: () => equiposPorOmision ?? registroDelBanco() })
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
   * V1 (15-N) · LA MISMA FUNCIÓN QUE `main.ts`, no una réplica: contexto,
   * seguridad, parsers, saneamiento, filtro e interceptores. Hasta la 15-N
   * este banco copiaba la tubería línea a línea; el defecto del video vivía
   * justo ahí (el saneamiento recortaba la oferta SDP) y la prueba extremo a
   * extremo tiene que recorrer lo que se despliega.
   */
  montarTuberiaHttp(app, efectiva);
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
   * Cientos de bind/close por fichero, en paralelo, son una carrera: basta con
   * que otra petición cierre el servidor entre el constructor de `supertest` y
   * la conexión para que el cliente encuentre el socket muerto. Con el servidor
   * escuchando de antemano, `supertest` no monta ni derriba nada.
   *
   * Y en `127.0.0.1`, no en la comodín (DT-15X-07, 15-S5): en macOS un doble
   * de otro fichero en `127.0.0.1:0` podía quedarse el MISMO puerto y recibir
   * él la petición, que cerraba sin responder: el mismo `socket hang up`
   * (`servidores-en-loopback.test.ts`).
   */
  await app.listen(0, '127.0.0.1');
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
