import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { GuardiaController } from './presentacion/guardia.controller';
import { crearControlDeBarreraDesdeEntorno } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import { PROVEEDOR_DE_EQUIPOS } from '../proveedores';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
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
  BitacoraDeOrdenesEnMemoria,
  RegistroDeBloqueosEnMemoria,
} from './infraestructura/adaptadores-en-memoria';
import { AccionadorPorProveedor } from './infraestructura/accionador-por-proveedor';
import { CanalIntercomConTransporte } from './infraestructura/canal-intercom-con-transporte';
import { anunciarAccionador } from './infraestructura/aviso-de-arranque-del-accionador';

/**
 * Consolas operativas — ETAPA 10.
 *
 * **Va después de `EventosModule`**, que es `@Global` y aporta el repositorio
 * de eventos y el escalamiento de alertas. La cola de atención lee de ahí en
 * vez de mantener su propia lista: dos listas de lo mismo se separan, y la que
 * decide qué ve el operador no puede ser la que envejece.
 *
 * Desde la 15-E los dos puertos de hardware de esta consola —accionar y
 * hablar— van por el PROVEEDOR DE EQUIPOS (A1): la apertura de cualquier
 * dispositivo resuelve por `AccessPointProvider` contra el registro y por
 * capacidades, y el canal de intercom abre el del aparato por
 * `IntercomProvider` cuando el turno se concede. Con `PROVEEDOR_DE_EQUIPOS=
 * simulado` el comportamiento observable es el de siempre (ADR-03); con el
 * real, las mismas líneas hablan con los equipos dados de alta en la consola.
 * La exclusividad sigue en la máquina de estados del dominio: lo que cambia es
 * el transporte, no las reglas.
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
           * A1 · la apertura de CUALQUIER dispositivo pasa por el proveedor
           * de equipos, resuelto por dispositivo contra el registro y decidido
           * por capacidades. `BARRERA_*` sigue como COMPATIBILIDAD DECLARADA:
           * es el único control VERIFICADO contra el equipo, y si nombra un
           * dispositivo, ese va por él. Los dos caminos se anuncian al arrancar
           * y cada orden anota cuál la atendió (O5).
           *
           * Quién construye el control de barrera es el paquete de
           * proveedores, no este módulo, y es deliberado: si la API leyera la
           * dirección del equipo tendría que nombrarla, y el vocabulario del
           * fabricante no sale de `packages/providers` (KPI-11).
           */
          provide: ACCIONADOR_DE_PUERTA,
          inject: [BITACORA, PROVEEDOR_DE_EQUIPOS, CONFIGURACION],
          useFactory: (
            bitacora: Bitacora,
            proveedor: ProveedorDeEquipos,
            configuracion: Configuracion,
          ) => {
            const control = crearControlDeBarreraDesdeEntorno();
            const dispositivoDeEntorno = (process.env['BARRERA_DISPOSITIVO_ID'] ?? '').trim();
            anunciarAccionador(bitacora, {
              clase: configuracion.PROVEEDOR_DE_EQUIPOS,
              hayControlDeEntorno: control !== null,
              dispositivoDeEntorno,
            });
            return new AccionadorPorProveedor(
              proveedor,
              configuracion.PROVEEDOR_DE_EQUIPOS,
              bitacora,
              control !== null && dispositivoDeEntorno !== ''
                ? { control, dispositivoId: dispositivoDeEntorno }
                : null,
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
          /**
           * A1 · el canal de intercom reparte turnos EN PROCESO (la máquina de
           * estados del dominio) y, cuando concede uno, abre el canal del
           * aparato por `INTERCOM_PROVIDER`. El transporte lo decide la
           * capacidad `audioBidireccional` del equipo, no la clase del
           * proveedor (ADR-019): el simulado con un identificador que no
           * conoce sigue repartiendo turnos sin audio, y lo dice.
           */
          provide: CANAL_DE_INTERCOM,
          inject: [RELOJ, PROVEEDOR_DE_EQUIPOS, BITACORA],
          useFactory: (reloj: Reloj, proveedor: ProveedorDeEquipos, bitacora: Bitacora) =>
            new CanalIntercomConTransporte(new CanalIntercomEnProceso(reloj), proveedor, bitacora),
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
