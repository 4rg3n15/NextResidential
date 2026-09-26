import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { ALMACEN_EVIDENCIA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { AlmacenEvidencia, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { IngestaController } from './presentacion/ingesta.controller';
import { GuardiaDeFirmaDeIngesta } from './presentacion/guardia-firma';
import { AutorizacionesController } from './presentacion/autorizaciones.controller';
import { ListasNegrasController } from './presentacion/listas-negras.controller';
import {
  CONSULTA_AUTORIZACIONES,
  CONSULTA_LISTA_NEGRA,
  REPOSITORIO_AUTORIZACIONES,
  REPOSITORIO_LISTA_NEGRA,
} from './aplicacion/puertos';
import type { RepositorioAutorizaciones, RepositorioListaNegra } from './aplicacion/puertos';
import { LevantarListaNegra, VetarEnListaNegra } from './aplicacion/listas-negras';
import { ConsultaDeListaNegraPg } from './infraestructura/consulta-lista-negra-pg';
import { RepositorioAutorizacionesPg } from './infraestructura/repositorio-autorizaciones-pg';
import { RepositorioListaNegraPg } from './infraestructura/repositorio-lista-negra-pg';
import {
  AgregarAcompanante,
  CrearAutorizacion,
  ModificarAutorizacion,
  RevocarAutorizacion,
} from './aplicacion/casos-de-uso';
import {
  AdjuntarFotografiaDeVisitante,
  UrlDeFotografiaDeVisitante,
} from './aplicacion/fotografia-de-visitante';

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
/**
 * `@Global` desde la 15-D, por la misma razón que zonas y padrón: el módulo de
 * eventos compone el cargador de contexto del motor y necesita el repositorio
 * de autorizaciones. Sin el global, el orden de registro decidía si el motor
 * tenía o no de dónde leer, y eso es exactamente lo que D-25 no puede volver a
 * depender de nadie.
 */
@Global()
@Module({})
export class AutorizacionesModule {
  static registrar(): DynamicModule {
    return {
      module: AutorizacionesModule,
      controllers: [IngestaController, AutorizacionesController, ListasNegrasController],
      providers: [
        GuardiaDeFirmaDeIngesta,
        {
          provide: RepositorioAutorizacionesPg,
          inject: [Pool, CONFIGURACION, RELOJ],
          // El nombre del bucket va a `evidencias.bucket` (D-19): el real cuando
          // está declarado, y el del almacén provisional cuando no. El reloj es
          // el MISMO que usa el motor: con él se resuelve la zona horaria del
          // patrón (H-15I-05).
          useFactory: (pool: Pool, c: Configuracion, reloj: Reloj) =>
            new RepositorioAutorizacionesPg(pool, {}, c.EVIDENCIA_BUCKET ?? 'en-memoria', reloj),
        },
        { provide: REPOSITORIO_AUTORIZACIONES, useExisting: RepositorioAutorizacionesPg },
        { provide: CONSULTA_AUTORIZACIONES, useExisting: RepositorioAutorizacionesPg },
        /**
         * ETAPA 09-B · el puerto llevaba desde la 05 declarado y **sin nadie
         * detrás**: los casos de uso existían, nadie podía invocarlos, y el
         * motor recibía la lista negra vacía. RN-06 le da precedencia absoluta
         * sobre cualquier autorización vigente, así que un puerto sin adaptador
         * no era una funcionalidad pendiente: era la regla de mayor prioridad
         * del sistema leyendo de la nada.
         */
        {
          provide: REPOSITORIO_LISTA_NEGRA,
          inject: [Pool],
          useFactory: (pool: Pool) => new RepositorioListaNegraPg(pool),
        },
        /** 15-I · HU-35 · la lista negra desde la consola: vetar y levantar. */
        {
          provide: CONSULTA_LISTA_NEGRA,
          inject: [Pool],
          useFactory: (pool: Pool) => new ConsultaDeListaNegraPg(pool),
        },
        {
          provide: VetarEnListaNegra,
          inject: [REPOSITORIO_LISTA_NEGRA, GENERADOR_DE_ID],
          useFactory: (repo: RepositorioListaNegra, ids: GeneradorDeId) =>
            new VetarEnListaNegra(repo, ids),
        },
        {
          provide: LevantarListaNegra,
          inject: [REPOSITORIO_LISTA_NEGRA, RELOJ],
          useFactory: (repo: RepositorioListaNegra, reloj: Reloj) =>
            new LevantarListaNegra(repo, reloj),
        },
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
        {
          provide: ModificarAutorizacion,
          inject: [REPOSITORIO_AUTORIZACIONES, RELOJ],
          useFactory: (repo: RepositorioAutorizaciones, reloj: Reloj) =>
            new ModificarAutorizacion(repo, reloj),
        },
        /**
         * ETAPA 15-D (O3) · la fotografía del visitante usa el MISMO almacén de
         * evidencia que los eventos (RN-21): `EventosModule` es global y lo
         * exporta, así que aquí no se elige bucket ni adaptador.
         */
        {
          provide: AdjuntarFotografiaDeVisitante,
          inject: [REPOSITORIO_AUTORIZACIONES, RELOJ, ALMACEN_EVIDENCIA, GENERADOR_DE_ID],
          useFactory: (
            repo: RepositorioAutorizaciones,
            reloj: Reloj,
            almacen: AlmacenEvidencia,
            ids: GeneradorDeId,
          ) => new AdjuntarFotografiaDeVisitante(repo, reloj, almacen, ids),
        },
        {
          provide: UrlDeFotografiaDeVisitante,
          inject: [REPOSITORIO_AUTORIZACIONES, RELOJ, ALMACEN_EVIDENCIA],
          useFactory: (repo: RepositorioAutorizaciones, reloj: Reloj, almacen: AlmacenEvidencia) =>
            new UrlDeFotografiaDeVisitante(repo, reloj, almacen),
        },
      ],
      exports: [REPOSITORIO_AUTORIZACIONES, CONSULTA_AUTORIZACIONES, REPOSITORIO_LISTA_NEGRA],
    };
  }
}
