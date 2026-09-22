import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { RELOJ, BITACORA } from '@ncr/domain-core';
import { redactar } from '../comun/bitacora/bitacora-estructurada';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { METRICAS, REPORTE_DE_ERRORES } from './aplicacion/puertos';
import { RegistroDeLatencias } from './infraestructura/registro-de-latencias';
import { ReporteSentry } from './infraestructura/sentry-http';
import { SinReporteDeErrores } from './infraestructura/sin-reporte';
import { ObservabilidadController } from './presentacion/observabilidad.controller';
import { InterceptorDeLatencias } from './presentacion/interceptor-de-latencias';

export interface OpcionesObservabilidad {
  readonly sentryDsn?: string;
  readonly entorno: string;
  readonly version: string;
  readonly ventana?: number;
}

/**
 * `@Global` porque el puerto de métricas lo consume el interceptor —que vive
 * fuera de cualquier módulo de negocio— y `EscalarAlerta`, que vive dentro de
 * uno. Importarlo en cada módulo que mide crearía justamente el acoplamiento
 * que §2.2 evita: nadie «depende de observabilidad», la observan.
 */
@Global()
@Module({})
export class ObservabilidadModule {
  static registrar(opciones: OpcionesObservabilidad): DynamicModule {
    return {
      module: ObservabilidadModule,
      controllers: [ObservabilidadController],
      providers: [
        {
          provide: METRICAS,
          inject: [RELOJ],
          useFactory: (reloj: Reloj) => new RegistroDeLatencias(reloj, opciones.ventana),
        },
        {
          provide: REPORTE_DE_ERRORES,
          inject: [BITACORA],
          useFactory: (bitacora: Bitacora) =>
            opciones.sentryDsn === undefined || opciones.sentryDsn === ''
              ? new SinReporteDeErrores()
              : new ReporteSentry({
                  dsn: opciones.sentryDsn,
                  entorno: opciones.entorno,
                  version: opciones.version,
                  redactar,
                  bitacora,
                }),
        },
        InterceptorDeLatencias,
      ],
      exports: [METRICAS, REPORTE_DE_ERRORES, InterceptorDeLatencias],
    };
  }
}
