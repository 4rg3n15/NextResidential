import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { REPOSITORIO_DE_EQUIPOS, SONDA_DE_EQUIPO } from './aplicacion/puertos';
import { RepositorioDeEquiposPg } from './infraestructura/repositorio-equipos-pg';
import { SondaPorProveedor } from './infraestructura/sonda-por-proveedor';
import { EquiposController } from './presentacion/equipos.controller';

/**
 * Raíz de composición del aprovisionamiento de equipos.
 *
 * La sonda es un PUERTO y no una llamada directa: es lo que permite que la
 * suite pruebe los cuatro resultados —alcanzado, decide por su cuenta,
 * credencial rechazada, inalcanzable— **sin un solo equipo y sin red** (ADR-03),
 * y lo que permitirá mañana sondear un fabricante distinto sin tocar el
 * controlador.
 */
@Module({})
export class EquiposModule {
  static registrar(): DynamicModule {
    return {
      module: EquiposModule,
      controllers: [EquiposController],
      providers: [
        { provide: SONDA_DE_EQUIPO, useFactory: () => new SondaPorProveedor() },
        {
          provide: REPOSITORIO_DE_EQUIPOS,
          inject: [Pool, CONFIGURACION],
          useFactory: (pool: Pool, c: Configuracion) =>
            new RepositorioDeEquiposPg(pool, c.EQUIPOS_LLAVE, c.EQUIPOS_LLAVE_REF),
        },
      ],
      exports: [REPOSITORIO_DE_EQUIPOS],
    };
  }
}
