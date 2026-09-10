import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { GeneradorDeId, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { IngestaController } from './presentacion/ingesta.controller';
import { GuardiaDeFirmaDeIngesta } from './presentacion/guardia-firma';
import { AutorizacionesController } from './presentacion/autorizaciones.controller';
import { CONSULTA_AUTORIZACIONES, REPOSITORIO_AUTORIZACIONES } from './aplicacion/puertos';
import type { RepositorioAutorizaciones } from './aplicacion/puertos';
import { RepositorioAutorizacionesPg } from './infraestructura/repositorio-autorizaciones-pg';
import {
  AgregarAcompanante,
  CrearAutorizacion,
  RevocarAutorizacion,
} from './aplicacion/casos-de-uso';

/**
 * Módulo de autorizaciones. Expone la ingesta firmada, que desde la ETAPA 06
 * decide y registra el evento: los casos de uso que necesita —`RegistrarAcceso`
 * y el repositorio de dispositivos— los aporta `EventosModule`, que es
 * `@Global`, así que aquí no hay que importarlo ni conocer su cableado.
 *
 * **La ETAPA 09-B añade la persistencia del agregado.** Hasta ahora el
 * agregado y el motor de reglas eran puros y nadie los guardaba: se probaban
 * sin base porque no la necesitan. La pantalla de visitantes es el primer
 * consumidor real, y con ella entra `RepositorioAutorizacionesPg` — el mismo
 * `Pool` y el mismo patrón de contexto RLS que el padrón, que ya se conecta de
 * verdad. No se elige memoria aquí: los visitantes de ayer tienen que seguir
 * estando mañana, y un adaptador en memoria los pierde al reiniciar.
 */
@Module({})
export class AutorizacionesModule {
  static registrar(): DynamicModule {
    return {
      module: AutorizacionesModule,
      controllers: [IngestaController, AutorizacionesController],
      providers: [
        GuardiaDeFirmaDeIngesta,
        {
          provide: Pool,
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion) =>
            new Pool({ connectionString: c.DATABASE_POOLER_URL, max: 10 }),
        },
        {
          provide: RepositorioAutorizacionesPg,
          inject: [Pool],
          useFactory: (pool: Pool) => new RepositorioAutorizacionesPg(pool),
        },
        { provide: REPOSITORIO_AUTORIZACIONES, useExisting: RepositorioAutorizacionesPg },
        { provide: CONSULTA_AUTORIZACIONES, useExisting: RepositorioAutorizacionesPg },
        {
          provide: CrearAutorizacion,
          inject: [REPOSITORIO_AUTORIZACIONES, RELOJ, GENERADOR_DE_ID],
          useFactory: (repo: RepositorioAutorizaciones, reloj: Reloj, ids: GeneradorDeId) =>
            new CrearAutorizacion(repo, reloj, ids),
        },
        {
          provide: RevocarAutorizacion,
          inject: [REPOSITORIO_AUTORIZACIONES, RELOJ],
          useFactory: (repo: RepositorioAutorizaciones, reloj: Reloj) =>
            new RevocarAutorizacion(repo, reloj),
        },
        {
          provide: AgregarAcompanante,
          inject: [REPOSITORIO_AUTORIZACIONES, RELOJ],
          useFactory: (repo: RepositorioAutorizaciones, reloj: Reloj) =>
            new AgregarAcompanante(repo, reloj),
        },
      ],
      exports: [REPOSITORIO_AUTORIZACIONES, CONSULTA_AUTORIZACIONES],
    };
  }
}
