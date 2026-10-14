import type { Provider } from '@nestjs/common';
import { BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import { EQUIPOS_ACTIVOS } from '../../equipos';
import type { EquipoQueEmite } from '../../equipos';
import { EscalarAlerta } from '../aplicacion/escalamiento';
import {
  CANAL_TIEMPO_REAL,
  MOTOR_DE_DECISION,
  NOTIFICADOR_PUSH,
  REPOSITORIO_ALERTAS,
  REPOSITORIO_EVENTOS,
} from '../aplicacion/puertos';
import type {
  CanalTiempoReal,
  MotorDeDecision,
  NotificadorPush,
  RepositorioAlertas,
  RepositorioEventos,
} from '../aplicacion/puertos';
import { RegistrarAcceso } from '../aplicacion/registrar-acceso';
import { NombreDeEquipoPorActivos } from './nombre-de-equipo-por-activos';

/**
 * 15-Z2 · la composición de `RegistrarAcceso`, fuera de `eventos.module.ts`
 * (546 líneas, que no debe crecer): el aviso al residente nombra el equipo por
 * el puerto `EQUIPOS_ACTIVOS` del módulo de equipos (DT-15R-08).
 */
export const PROVEEDOR_DE_REGISTRAR_ACCESO: Provider = {
  provide: RegistrarAcceso,
  inject: [
    MOTOR_DE_DECISION,
    REPOSITORIO_EVENTOS,
    REPOSITORIO_ALERTAS,
    CANAL_TIEMPO_REAL,
    EscalarAlerta,
    RELOJ,
    GENERADOR_DE_ID,
    BITACORA,
    NOTIFICADOR_PUSH,
    CONFIGURACION,
    EQUIPOS_ACTIVOS,
  ],
  useFactory: (
    motor: MotorDeDecision,
    eventos: RepositorioEventos,
    alertas: RepositorioAlertas,
    canal: CanalTiempoReal,
    escalador: EscalarAlerta,
    reloj: Reloj,
    ids: GeneradorDeId,
    bitacora: Bitacora,
    push: NotificadorPush,
    config: Configuracion,
    equipos: { activos(): Promise<readonly EquipoQueEmite[]> },
  ) =>
    new RegistrarAcceso(motor, eventos, alertas, canal, escalador, reloj, ids, bitacora, push, {
      // E5 (15-M) · una alerta por (equipo, tipo) y ventana.
      ventanaDeDuplicadosMs: config.ALERTAS_VENTANA_DEDUP_S * 1000,
      nombreDeEquipo: new NombreDeEquipoPorActivos(equipos),
    }),
};
