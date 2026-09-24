import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { GuardiaController } from './presentacion/guardia.controller';
import { crearControlDeBarreraDesdeEntorno } from '@ncr/providers';
import {
  AccionarPuertaAMano,
  ACCIONADOR_DE_PUERTA,
  BITACORA_DE_ORDENES,
  BLOQUEO_DE_ACCESO,
} from './aplicacion/apertura-manual';
import type {
  AccionadorDePuerta,
  BitacoraDeOrdenes,
  BloqueoDeAcceso,
} from './aplicacion/apertura-manual';
import { FijarBloqueoDeAcceso, REGISTRO_DE_BLOQUEOS } from './aplicacion/bloqueo-de-acceso';
import type { RegistroDeBloqueos } from './aplicacion/bloqueo-de-acceso';
import { CANAL_DE_INTERCOM } from './aplicacion/puertos';
import { CanalIntercomEnProceso } from './infraestructura/canal-intercom-en-proceso';
import {
  AccionadorSimulado,
  BitacoraDeOrdenesEnMemoria,
  RegistroDeBloqueosEnMemoria,
} from './infraestructura/adaptadores-en-memoria';
import { AccionadorSegunDispositivo } from './infraestructura/accionador-segun-dispositivo';
import { anunciarAccionador } from './infraestructura/aviso-de-arranque-del-accionador';

/**
 * Consolas operativas — ETAPA 10.
 *
 * **Va después de `EventosModule`**, que es `@Global` y aporta el repositorio
 * de eventos y el escalamiento de alertas. La cola de atención lee de ahí en
 * vez de mantener su propia lista: dos listas de lo mismo se separan, y la que
 * decide qué ve el operador no puede ser la que envejece.
 *
 * Los dos adaptadores de hardware son **simulados y lo dicen** (ADR-03): el
 * relé registra en la bitácora que es simulado, y el canal de audio aplica la
 * exclusividad de verdad con la máquina de estados del dominio. Lo que la
 * ETAPA 15 sustituye es el transporte, no las reglas.
 */
@Module({})
export class GuardiaModule {
  static registrar(): DynamicModule {
    return {
      module: GuardiaModule,
      controllers: [GuardiaController],
      providers: [
        {
          /**
           * **El simulado sigue siendo el de por omisión.** El control real se
           * activa solo si el entorno lo configura, y su ausencia no rompe el
           * arranque ni las pruebas: `crearControlDeBarreraDesdeEntorno`
           * devuelve `null` cuando no hay nada configurado.
           *
           * Quién construye el control real es el paquete de proveedores, no
           * este módulo, y es deliberado: si la API leyera la dirección del
           * equipo tendría que nombrarla, y el vocabulario del fabricante no
           * sale de `packages/providers` (KPI-11). Aquí solo se pregunta si
           * hay uno y a qué dispositivo atiende.
           */
          provide: ACCIONADOR_DE_PUERTA,
          inject: [BITACORA],
          useFactory: (bitacora: Bitacora) => {
            const real = crearControlDeBarreraDesdeEntorno();
            const dispositivoReal = (process.env['BARRERA_DISPOSITIVO_ID'] ?? '').trim();
            // O5 · qué accionador quedó activo se DICE al arrancar, con su
            // consecuencia: un simulado que entra en silencio abre «con éxito»
            // en la bitácora y no mueve ningún brazo.
            anunciarAccionador(bitacora, { hayControlReal: real !== null, dispositivoReal });
            return new AccionadorSegunDispositivo(
              new AccionadorSimulado(bitacora),
              bitacora,
              real,
              dispositivoReal,
            );
          },
        },
        {
          // El mismo objeto atiende los dos puertos: es un aparato, no dos.
          provide: BLOQUEO_DE_ACCESO,
          inject: [ACCIONADOR_DE_PUERTA],
          useFactory: (accionador: AccionadorDePuerta & BloqueoDeAcceso) => accionador,
        },
        { provide: BITACORA_DE_ORDENES, useClass: BitacoraDeOrdenesEnMemoria },
        { provide: REGISTRO_DE_BLOQUEOS, useClass: RegistroDeBloqueosEnMemoria },
        {
          provide: FijarBloqueoDeAcceso,
          inject: [BLOQUEO_DE_ACCESO, REGISTRO_DE_BLOQUEOS, RELOJ],
          useFactory: (barrera: BloqueoDeAcceso, registro: RegistroDeBloqueos, reloj: Reloj) =>
            new FijarBloqueoDeAcceso(barrera, registro, reloj),
        },
        {
          provide: CANAL_DE_INTERCOM,
          inject: [RELOJ],
          useFactory: (reloj: Reloj) => new CanalIntercomEnProceso(reloj),
        },
        {
          provide: AccionarPuertaAMano,
          inject: [ACCIONADOR_DE_PUERTA, BITACORA_DE_ORDENES, RELOJ, GENERADOR_DE_ID],
          useFactory: (
            accionador: AccionadorDePuerta,
            ordenes: BitacoraDeOrdenes,
            reloj: Reloj,
            ids: GeneradorDeId,
          ) => new AccionarPuertaAMano(accionador, ordenes, reloj, ids),
        },
      ],
      exports: [CANAL_DE_INTERCOM, BITACORA_DE_ORDENES, REGISTRO_DE_BLOQUEOS],
    };
  }
}
