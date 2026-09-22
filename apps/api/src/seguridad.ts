import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import type { Configuracion } from './configuracion/esquema';
import { SaneamientoMiddleware } from './comun/saneamiento';

/**
 * Endurecimiento HTTP (§2.7). Vive en un único archivo para que una auditoría
 * pueda leer la postura de seguridad entera de una vez, en lugar de buscarla
 * repartida por `main.ts`.
 */
export const aplicarSeguridad = (app: INestApplication, config: Configuracion): void => {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          // Sin `unsafe-inline` ni `unsafe-eval` (§2.7.7). El nonce por
          // petición lo aporta la consola en la ETAPA 09; la API no sirve HTML.
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", config.SUPABASE_URL],
        },
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      noSniff: true,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Lista blanca explícita: se compara contra la lista, nunca se refleja el
  // origen recibido. Un origen no permitido NO produce un error de servidor —
  // simplemente no se emiten cabeceras CORS y el navegador bloquea la respuesta.
  // Devolver 500 convertiría un rechazo correcto en ruido de incidentes.
  app.enableCors({
    origin: (origen, callback) =>
      callback(null, !origen || config.origenesPermitidos.includes(origen)),
    /**
     * Los verbos que la API expone DE VERDAD. `DELETE` estuvo anunciado hasta
     * la ETAPA 13 sin que existiera una sola ruta que lo usara (H-13-22):
     *
     *   $ grep -rhoE "@(Get|Post|Put|Patch|Delete)\(" src --include=*.controller.ts | sort | uniq -c
     *        34 @Get(   ·   1 @Patch(   ·   43 @Post(
     *
     * No era explotable —no hay ruta que alcanzar— pero sí una desviación de
     * mínimo privilegio en lo anunciado. Y aquí no volverá por descuido: RN-19
     * prohíbe el borrado físico, así que una ruta `DELETE` sería la excepción
     * y merece decidirse, no heredarse de esta lista.
     */
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    /**
     * Sin esto, la consola NO PODÍA LEER el identificador de correlación que el
     * interceptor ya emitía en toda respuesta (H-13-22). `x-request-id` estaba
     * en `allowedHeaders` —lo que el navegador puede ENVIAR— y no en
     * `exposedHeaders` —lo que puede LEER—, y por CORS sólo son legibles las
     * siete cabeceras seguras por omisión. Como la consola vive en un origen
     * distinto por diseño, su JavaScript no alcanzaba el identificador con el
     * que se correlaciona un incidente. Afecta a la trazabilidad, no a la
     * confidencialidad, pero la trazabilidad es la mitad de esta etapa.
     */
    exposedHeaders: ['x-request-id', 'Retry-After'],
    credentials: true,
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * H-13-05 y H-13-06 · el saneamiento de §2.7.4, que nunca se construyó.
 *
 * VA APARTE DE `aplicarSeguridad`, y el motivo es el orden: `aplicarSeguridad`
 * corre ANTES que los parsers de `express`, así que allí `req.body` todavía no
 * existe y sanearlo no saneaba nada. Lo aprendí por ejecución —la prueba de
 * H-13-06 siguió en rojo con el middleware puesto en el sitio cómodo—.
 *
 * Llamar a esto DESPUÉS de `express.json()` y `express.urlencoded()` y ANTES de
 * cualquier ruta es la condición para que funcione, y por eso tiene su propia
 * función con su propio nombre en lugar de esconderse dentro de la otra.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const aplicarSaneamiento = (app: INestApplication): void => {
  const saneamiento = new SaneamientoMiddleware();
  app.use(
    (
      req: Parameters<typeof saneamiento.use>[0],
      res: Parameters<typeof saneamiento.use>[1],
      next: Parameters<typeof saneamiento.use>[2],
    ) => saneamiento.use(req, res, next),
  );
};
