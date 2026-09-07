import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import type { Configuracion } from './configuracion/esquema';

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
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
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
