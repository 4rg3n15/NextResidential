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
// La tubería ANTES que el módulo raíz: carga sus ficheros concretos en el
// mismo orden que el banco de pruebas, que es el orden probado (D-66).
import { montarTuberiaHttp } from './arranque/tuberia-http';
import { AppModule } from './app.module';
import { MOTIVO_SIN_METADATOS, emiteMetadatosDeTipos } from './arranque/metadatos-de-tipos';
import { ErrorDeConfiguracion, cargarConfiguracion } from './configuracion/esquema';
import { BitacoraEstructurada } from './comun/bitacora/bitacora-estructurada';
import { AdaptadorDeBitacoraNest } from './comun/bitacora/adaptador-nest';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { ProveedorDeJwks } from './autenticacion';
import { comprobarRecursosExternos } from './arranque/recursos-externos';
import { SONDA_POSTGRES, recursoBaseDeDatos } from './arranque/sonda-postgres';
import { abrirPuertoMientrasArranca } from './arranque/puerto-mientras-arranca';
import { instalarCierreOrdenado } from './arranque/cierre-ordenado';
import type { SondaDePostgres } from './arranque/sonda-postgres';
import {
  recursoBucketDeEvidencia,
  recursoJwks,
  recursoRecuperacionDeContrasena,
} from './arranque/recursos';

async function arrancar(): Promise<void> {
  // H-SITIO-06 (anexo 15-K) · antes que nada: sin metadatos de tipos el
  // ValidationPipe no valida ningún DTO, y eso no es un modo de desarrollo.
  if (!emiteMetadatosDeTipos()) throw new ErrorDeConfiguracion([MOTIVO_SIN_METADATOS]);
  // Primero la configuración, antes de construir nada: si falta una variable,
  // el proceso muere aquí con un motivo legible y un código de salida útil,
  // en vez de dentro del contenedor de inyección (§2.7.1).
  const config = cargarConfiguracion(process.env);
  // Otros fallos (15-M) · mientras se construye todo, el puerto contesta 503.
  const puertoDeArranque = await abrirPuertoMientrasArranca(config.PORT);

  const bitacoraDeArranque = new BitacoraEstructurada(undefined, config.LOG_LEVEL);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.conConfiguracion(config), {
    logger: new AdaptadorDeBitacoraNest(bitacoraDeArranque),
    // Otros fallos (15-M) · al cerrar, las conexiones abiertas (SSE de la consola,
    // también las que reconectan durante el cierre) se cortan: no retienen el apagado.
    forceCloseConnections: true,
  });
  const bitacora = app.get<Bitacora>(BITACORA);

  /**
   * V1 (15-N) · la tubería HTTP entera —contexto, seguridad, parsers,
   * saneamiento, filtro e interceptores—, en el orden que la función explica.
   * Es LA MISMA función que monta el banco de pruebas: la prueba extremo a
   * extremo del video recorre lo que se despliega, no una réplica.
   */
  montarTuberiaHttp(app, config);
  // Otros fallos (15-M) · cierre ordenado: corta el SSE, cierra módulos y
  // pools, y no se cuelga (`cierre-ordenado.ts`). Sustituye a enableShutdownHooks.
  instalarCierreOrdenado(app, bitacora);

  await puertoDeArranque?.cerrar();
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
