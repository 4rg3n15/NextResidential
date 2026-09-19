import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { DIRECTORIO_DEL_RESIDENTE } from './aplicacion/puertos';
import type { DirectorioDelResidente } from './aplicacion/puertos';
import { DirectorioDelResidentePg } from './infraestructura/directorio-pg';
import {
  ResolverMiAmbito,
  VerMiFamilia,
  VerMiHistorial,
  VerMisAutorizaciones,
  VerMisVehiculos,
  VerMiVivienda,
} from './aplicacion/casos-de-uso';
import { MiController } from './presentacion/mi.controller';

/**
 * Módulo de la superficie del residente.
 *
 * No exporta su puerto: **nadie más lee por aquí**. El padrón sigue siendo el
 * dueño de las escrituras del padrón y este módulo no las toca; lo único que
 * comparte con el resto es el ámbito del dominio, que vive en `domain-core`.
 * Que el barril no exporte nada operativo es la señal de que la frontera está
 * donde debe (§2.2).
 */
@Module({})
export class ResidenteModule {
  static registrar(): DynamicModule {
    return {
      module: ResidenteModule,
      controllers: [MiController],
      providers: [
        {
          provide: DIRECTORIO_DEL_RESIDENTE,
          inject: [Pool],
          useFactory: (pool: Pool) => new DirectorioDelResidentePg(pool, {}),
        },
        ResolverMiAmbito,
        {
          provide: VerMiVivienda,
          inject: [ResolverMiAmbito, DIRECTORIO_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, d: DirectorioDelResidente) => new VerMiVivienda(r, d),
        },
        {
          provide: VerMiFamilia,
          inject: [ResolverMiAmbito, DIRECTORIO_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, d: DirectorioDelResidente) => new VerMiFamilia(r, d),
        },
        {
          provide: VerMisVehiculos,
          inject: [ResolverMiAmbito, DIRECTORIO_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, d: DirectorioDelResidente) => new VerMisVehiculos(r, d),
        },
        {
          provide: VerMisAutorizaciones,
          inject: [ResolverMiAmbito, DIRECTORIO_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, d: DirectorioDelResidente) =>
            new VerMisAutorizaciones(r, d),
        },
        {
          provide: VerMiHistorial,
          inject: [ResolverMiAmbito, DIRECTORIO_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, d: DirectorioDelResidente) => new VerMiHistorial(r, d),
        },
      ],
    };
  }
}
