import type { Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { ProveedorDeEquipos } from '@ncr/providers';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import { PROVEEDOR_DE_EQUIPOS } from '../../proveedores';
import { ALERTAS_DE_EQUIPO } from '../../eventos';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import {
  ACCIONADOR_DE_MODO,
  AJUSTES_DE_PUERTAS,
  REGISTRO_DE_MODOS,
} from '../aplicacion/modo-de-puerta';
import type {
  AccionadorDeModo,
  AjustesDePuertas,
  RegistroDeModosDePuerta,
} from '../aplicacion/modo-de-puerta';
import { FijarModoDePuerta } from '../aplicacion/fijar-modo-de-puerta';
import { BarrerReversionesDePuertas } from '../aplicacion/reversion-de-puertas';
import type { AlertaDeReversion } from '../aplicacion/reversion-de-puertas';
import { AccionadorDeModoPorProveedor } from './accionador-de-modo';
import { AjustesDePuertasPg, RegistroDeModosDePuertaPg } from './modos-de-puerta-pg';
import {
  AjustesDePuertasEnMemoria,
  RegistroDeModosDePuertaEnMemoria,
} from './modos-de-puerta-en-memoria';
import { CicloDeReversionDePuertas } from './ciclo-de-reversion';

const enBase = (c: Configuracion): boolean => c.PERSISTENCIA_DE_EVENTOS === 'postgres';

/**
 * 15-R · P-25 · las piezas de la puerta libre o bloqueada, fuera de
 * `guardia.module.ts` para que el módulo no crezca. Con base, las órdenes y
 * los ajustes viven en PostgreSQL (0053); sin ella, en memoria, y el arranque
 * lo dice: en memoria un reinicio olvida qué puerta hay que revertir.
 */
export const PROVEEDORES_DE_MODOS_DE_PUERTA: Provider[] = [
  {
    provide: REGISTRO_DE_MODOS,
    inject: [CONFIGURACION, Pool, BITACORA],
    useFactory: (c: Configuracion, pool: Pool, bitacora: Bitacora): RegistroDeModosDePuerta => {
      bitacora.registrar(enBase(c) ? 'info' : 'aviso', 'órdenes de modo de puerta', {
        persistencia: c.PERSISTENCIA_DE_EVENTOS,
        consecuencia: enBase(c)
          ? 'cada orden y su reversión pendiente sobreviven al reinicio'
          : 'un reinicio olvida qué puerta libre o bloqueada hay que revertir',
      });
      return enBase(c)
        ? new RegistroDeModosDePuertaPg(pool)
        : new RegistroDeModosDePuertaEnMemoria();
    },
  },
  {
    provide: AJUSTES_DE_PUERTAS,
    inject: [CONFIGURACION, Pool],
    useFactory: (c: Configuracion, pool: Pool): AjustesDePuertas =>
      enBase(c) ? new AjustesDePuertasPg(pool) : new AjustesDePuertasEnMemoria(),
  },
  {
    provide: ACCIONADOR_DE_MODO,
    inject: [PROVEEDOR_DE_EQUIPOS, BITACORA],
    useFactory: (p: ProveedorDeEquipos, b: Bitacora): AccionadorDeModo =>
      new AccionadorDeModoPorProveedor(p, b),
  },
  {
    provide: FijarModoDePuerta,
    inject: [REGISTRO_DE_MODOS, AJUSTES_DE_PUERTAS, ACCIONADOR_DE_MODO, RELOJ, BITACORA],
    useFactory: (
      r: RegistroDeModosDePuerta,
      a: AjustesDePuertas,
      accionador: AccionadorDeModo,
      reloj: Reloj,
      b: Bitacora,
    ) => new FijarModoDePuerta(r, a, accionador, reloj, b),
  },
  {
    provide: BarrerReversionesDePuertas,
    inject: [REGISTRO_DE_MODOS, FijarModoDePuerta, ALERTAS_DE_EQUIPO, RELOJ],
    useFactory: (
      r: RegistroDeModosDePuerta,
      f: FijarModoDePuerta,
      alertas: AlertaDeReversion,
      reloj: Reloj,
    ) => new BarrerReversionesDePuertas(r, f, alertas, reloj, ACTOR_INGESTA),
  },
  CicloDeReversionDePuertas,
];
