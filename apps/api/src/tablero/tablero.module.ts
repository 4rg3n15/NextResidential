import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { REPOSITORIO_ALERTAS, REPOSITORIO_EVENTOS } from '../eventos';
import type { RepositorioAlertas, RepositorioEventos } from '../eventos';
import {
  ConsultarAccesosPorHora,
  ConsultarDispositivos,
  ConsultarIndicadores,
} from './aplicacion/casos-de-uso';
import { REPOSITORIO_TABLERO } from './aplicacion/puertos';
import type { RepositorioTablero } from './aplicacion/puertos';
import { RepositorioTableroEnMemoria } from './infraestructura/repositorio-tablero-en-memoria';
import { TableroController } from './presentacion/tablero.controller';

/**
 * Raíz de composición del tablero.
 *
 * Entra al módulo de eventos **por su barril** (§2.2) y solo para tomar dos
 * puertos ya publicados: el adaptador en memoria del tablero se apoya en los
 * repositorios que ya tienen los datos, en vez de duplicar su estado. Cuando
 * llegue la contraseña de PostgreSQL (D-17) se cambia esta fábrica por
 * `RepositorioTableroPg` y no se toca nada más.
 */
@Module({})
export class TableroModule {
  static registrar(): DynamicModule {
    return {
      module: TableroModule,
      controllers: [TableroController],
      providers: [
        {
          provide: REPOSITORIO_TABLERO,
          inject: [REPOSITORIO_EVENTOS, REPOSITORIO_ALERTAS],
          useFactory: (eventos: RepositorioEventos, alertas: RepositorioAlertas) =>
            new RepositorioTableroEnMemoria(eventos, alertas),
        },
        {
          provide: ConsultarIndicadores,
          inject: [REPOSITORIO_TABLERO, RELOJ],
          useFactory: (repo: RepositorioTablero, reloj: Reloj) =>
            new ConsultarIndicadores(repo, reloj),
        },
        {
          provide: ConsultarAccesosPorHora,
          inject: [REPOSITORIO_TABLERO, RELOJ],
          useFactory: (repo: RepositorioTablero, reloj: Reloj) =>
            new ConsultarAccesosPorHora(repo, reloj),
        },
        {
          provide: ConsultarDispositivos,
          inject: [REPOSITORIO_TABLERO, RELOJ],
          useFactory: (repo: RepositorioTablero, reloj: Reloj) =>
            new ConsultarDispositivos(repo, reloj),
        },
      ],
      exports: [REPOSITORIO_TABLERO],
    };
  }
}
