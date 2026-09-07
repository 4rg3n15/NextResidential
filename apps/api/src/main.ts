import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from './app.module';
import { ErrorDeConfiguracion, cargarConfiguracion } from './configuracion/esquema';
import { aplicarSeguridad } from './seguridad';
import { FiltroGlobalDeExcepciones } from './comun/filtros/filtro-global';
import { InterceptorDeCorrelacion } from './comun/interceptores/correlacion';
import { BitacoraEstructurada } from './comun/bitacora/bitacora-estructurada';
import { AdaptadorDeBitacoraNest } from './comun/bitacora/adaptador-nest';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';

async function arrancar(): Promise<void> {
  // Primero la configuración, antes de construir nada: si falta una variable,
  // el proceso muere aquí con un motivo legible y un código de salida útil,
  // en vez de dentro del contenedor de inyección (§2.7.1).
  const config = cargarConfiguracion(process.env);

  const bitacoraDeArranque = new BitacoraEstructurada();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.conConfiguracion(config), {
    logger: new AdaptadorDeBitacoraNest(bitacoraDeArranque),
  });
  const bitacora = app.get<Bitacora>(BITACORA);

  aplicarSeguridad(app, config);
  // Límite de tamaño de payload (§2.7.8), antes de cualquier ruta.
  app.use(express.json({ limit: config.LIMITE_PAYLOAD }));
  app.use(express.urlencoded({ limit: config.LIMITE_PAYLOAD, extended: false }));

  app.useGlobalFilters(new FiltroGlobalDeExcepciones(bitacora));
  app.useGlobalInterceptors(app.get(InterceptorDeCorrelacion));
  app.enableShutdownHooks();

  await app.listen(config.PORT);
  bitacora.registrar('info', 'API arrancada', { puerto: config.PORT, entorno: config.NODE_ENV });
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
