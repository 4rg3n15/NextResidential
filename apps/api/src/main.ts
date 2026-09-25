import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import { resolve } from 'node:path';

/**
 * CORRECCIÓN 2026-09-07 (defecto reportado al cerrar la ETAPA 02).
 *
 * `node dist/main.js` rechazaba todas las variables como `Required` aunque
 * `apps/api/.env` existía y era correcto: nadie lo estaba leyendo. Nest **no**
 * carga `.env` por sí solo, y el proyecto no usa `@nestjs/config`.
 *
 * Se resuelve la ruta desde `__dirname` y no desde el directorio de trabajo:
 * el proceso puede arrancarse desde la raíz del monorepo, desde `apps/api` o
 * desde un gestor de procesos, y `process.cwd()` daría un resultado distinto
 * en cada caso. `override: false` mantiene la precedencia correcta: lo que ya
 * venga del entorno real —contenedor, CI— gana sobre el fichero.
 */
/**
 * `NCR_IGNORAR_ENV_FILE=1` omite la lectura del fichero. Existe para que una
 * comprobación pueda verificar de forma DETERMINISTA que la aplicación no
 * arranca sin configuración: sin esta salida, la sonda del DoD depende de que
 * la máquina no tenga `.env` —cierto en CI, falso en el equipo de cualquier
 * desarrollador—, y allí el proceso arranca y se queda escuchando para siempre.
 * No relaja nada: solo evita leer un fichero.
 */
/**
 * **DOS FICHEROS, EN ESTE ORDEN, Y NINGUNA SORPRESA** (nota del cliente,
 * 2026-09-10). Cada aplicación leía un sitio distinto y no estaba escrito en
 * ninguna parte: el `.env` del cliente estaba en la raíz y la API miraba solo
 * `apps/api/.env`, así que el fichero existía, era correcto y nadie lo leía —el
 * mismo defecto que la corrección de arriba resolvió para otra ruta—.
 *
 * Ahora se leen los dos: primero el de la aplicación, después el de la raíz, y
 * como `override: false` conserva lo primero que se fijó, **lo específico gana
 * sobre lo común** y el entorno real —contenedor, CI— gana sobre los dos. La
 * tabla de qué lee cada aplicación está en `docs/guias/CONEXION_SUPABASE.md`.
 */
if (process.env.NCR_IGNORAR_ENV_FILE !== '1') {
  cargarEnv({ path: resolve(__dirname, '..', '.env'), override: false });
  cargarEnv({ path: resolve(__dirname, '..', '..', '..', '.env'), override: false });
}
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import {
  LIMITE_DE_FOTOGRAFIA,
  RUTA_DE_FOTOGRAFIA_DE_VISITANTE,
  guardarCuerpoCrudo,
} from './autorizaciones';
import { acumularSobreCrudo, RUTA_DE_ALARM_SERVER } from './comun/sobre-de-equipo';
import { LIMITE_DE_TROZO_DE_AUDIO, RUTA_DE_AUDIO_DE_INTERCOM } from './comun/ruta-de-audio';
import { LIMITE_DE_OFERTA_SDP, RUTA_DE_WHEP_DE_VIDEO, TIPO_SDP } from './comun/ruta-de-video';
import { AppModule } from './app.module';
import { ErrorDeConfiguracion, cargarConfiguracion } from './configuracion/esquema';
import { aplicarSaneamiento, aplicarSeguridad } from './seguridad';
import { FiltroGlobalDeExcepciones } from './comun/filtros/filtro-global';
import { InterceptorDeCorrelacion } from './comun/interceptores/correlacion';
import { aplicarContextoDePeticion } from './comun/contexto/contexto-de-peticion';
import { BitacoraEstructurada } from './comun/bitacora/bitacora-estructurada';
import { InterceptorDeLatencias, REPORTE_DE_ERRORES } from './observabilidad';
import type { ReporteDeErrores } from './observabilidad';
import { GENERADOR_DE_ID } from '@ncr/domain-core';
import type { GeneradorDeId } from '@ncr/domain-core';
import { AdaptadorDeBitacoraNest } from './comun/bitacora/adaptador-nest';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { ProveedorDeJwks } from './autenticacion';
import { comprobarRecursosExternos } from './arranque/recursos-externos';
import { SONDA_POSTGRES, recursoBaseDeDatos } from './arranque/sonda-postgres';
import type { SondaDePostgres } from './arranque/sonda-postgres';
import {
  recursoBucketDeEvidencia,
  recursoJwks,
  recursoRecuperacionDeContrasena,
} from './arranque/recursos';

async function arrancar(): Promise<void> {
  // Primero la configuración, antes de construir nada: si falta una variable,
  // el proceso muere aquí con un motivo legible y un código de salida útil,
  // en vez de dentro del contenedor de inyección (§2.7.1).
  const config = cargarConfiguracion(process.env);

  const bitacoraDeArranque = new BitacoraEstructurada(undefined, config.LOG_LEVEL);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.conConfiguracion(config), {
    logger: new AdaptadorDeBitacoraNest(bitacoraDeArranque),
  });
  const bitacora = app.get<Bitacora>(BITACORA);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * EL PRIMERO DE TODOS, Y EL ORDEN ES FUNCIONAL (ETAPA 14).
   *
   * Todo lo que corra después —seguridad, parsers, saneamiento, Nest entero—
   * queda dentro del `AsyncLocalStorage` de la petición, y por tanto toda
   * línea de registro que escriban lleva su correlación. Colocado más abajo,
   * las líneas de las capas que van antes saldrían sin ella, que es
   * exactamente la mitad que faltaba: el identificador existía y los logs no
   * lo llevaban.
   */
  aplicarContextoDePeticion(app, () => app.get<GeneradorDeId>(GENERADOR_DE_ID).nuevo());

  aplicarSeguridad(app, config);
  // Límite de tamaño de payload (§2.7.8), antes de cualquier ruta.
  // `verify` guarda el cuerpo CRUDO antes de parsearlo: la firma del Alarm
  // Server se calcula sobre los bytes que llegaron, y reserializar el JSON
  // produciría otra cadena con la que ninguna firma cuadraría (RNF-03.11).
  /**
   * ANTES de `express.json`, y sólo bajo su propia ruta (ETAPA 15).
   *
   * La cámara publica `multipart/form-data`. `express.json` no lo parsea y
   * dejaría el flujo sin consumir; montarlo después tampoco serviría, porque
   * para entonces el cuerpo ya se habría perdido. Aquí se acumula el sobre
   * crudo, acotado en tamaño, y `@ncr/providers` lo abre.
   */
  app.use(RUTA_DE_ALARM_SERVER, acumularSobreCrudo);
  // A4 · el audio del operador, crudo y acotado, sólo bajo su ruta.
  app.use(
    RUTA_DE_AUDIO_DE_INTERCOM,
    express.raw({ type: 'application/octet-stream', limit: LIMITE_DE_TROZO_DE_AUDIO }),
  );
  // A5 · la oferta SDP del navegador, como texto y acotada, sólo bajo su ruta.
  app.use(RUTA_DE_WHEP_DE_VIDEO, express.text({ type: TIPO_SDP, limit: LIMITE_DE_OFERTA_SDP }));
  // O3 · la fotografía del visitante: más que el tope general, SÓLO en su ruta.
  app.use(
    RUTA_DE_FOTOGRAFIA_DE_VISITANTE,
    express.json({ limit: LIMITE_DE_FOTOGRAFIA, verify: guardarCuerpoCrudo }),
  );
  app.use(express.json({ limit: config.LIMITE_PAYLOAD, verify: guardarCuerpoCrudo }));
  app.use(express.urlencoded({ limit: config.LIMITE_PAYLOAD, extended: false }));
  // §2.7.4 · saneamiento DESPUÉS de los parsers: antes no hay cuerpo que sanear.
  aplicarSaneamiento(app);

  app.useGlobalFilters(
    new FiltroGlobalDeExcepciones(bitacora, app.get<ReporteDeErrores>(REPORTE_DE_ERRORES)),
  );
  // Correlación primero, latencias después: el cronómetro se lee en el log de
  // la misma petición que lo produjo.
  app.useGlobalInterceptors(app.get(InterceptorDeCorrelacion), app.get(InterceptorDeLatencias));
  app.enableShutdownHooks();

  await app.listen(config.PORT);
  bitacora.registrar('info', 'API arrancada', { puerto: config.PORT, entorno: config.NODE_ENV });

  /**
   * Los recursos externos se comprueban AL ARRANCAR, hablando con el recurso
   * real (DT-12). Se hace después de `listen` a propósito: si se hiciera antes,
   * un endpoint lento retrasaría la apertura del puerto y el orquestador daría
   * el despliegue por muerto. Aquí el proceso ya responde `/health`, y `/ready`
   * sigue siendo quien decide si entra tráfico.
   */
  await comprobarRecursosExternos(
    [
      recursoJwks(app.get(ProveedorDeJwks)),
      recursoBaseDeDatos(app.get<SondaDePostgres>(SONDA_POSTGRES)),
      recursoBucketDeEvidencia({
        supabaseUrl: config.SUPABASE_URL,
        llaveSecreta: config.SUPABASE_SECRET_KEY,
        bucket: config.EVIDENCIA_BUCKET,
      }),
      recursoRecuperacionDeContrasena({
        urlDeRedireccion: config.RECUPERACION_URL_REDIRECCION,
        origenesPermitidos: config.origenesPermitidos,
      }),
    ],
    bitacora,
  );
}

arrancar().catch((error: unknown) => {
  // Un fallo de configuración se explica con claridad; no se vuelca el entorno.
  if (error instanceof ErrorDeConfiguracion) {
    console.error(error.message);
    process.exit(78); // EX_CONFIG
  }
  console.error('Fallo al arrancar la API:', error instanceof Error ? error.message : error);
  process.exit(1);
});
