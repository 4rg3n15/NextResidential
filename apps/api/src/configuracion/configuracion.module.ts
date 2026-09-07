import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Configuracion } from './esquema';

export const CONFIGURACION = Symbol.for('ncr.Configuracion');

/**
 * La configuración NO se valida aquí: se recibe ya validada.
 *
 * Validarla dentro de una factoría de Nest la deja atrapada en el contenedor de
 * inyección, que envuelve el fallo y hace perder el código de salida — el
 * proceso muere con un 1 genérico y un volcado del framework. §2.7.1 pide que
 * la aplicación «no arranque»; para que eso sea diagnosticable, la validación
 * ocurre en `main.ts` ANTES de construir nada, y aquí solo se publica el
 * resultado. Ningún otro punto del código vuelve a leer `process.env`.
 */
@Global()
@Module({})
export class ConfiguracionModule {
  static conValores(config: Configuracion): DynamicModule {
    return {
      module: ConfiguracionModule,
      providers: [{ provide: CONFIGURACION, useValue: config }],
      exports: [CONFIGURACION],
    };
  }
}
