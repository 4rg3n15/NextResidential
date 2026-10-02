import type { Pool } from 'pg';
import type { Bitacora } from '@ncr/domain-core';
import type { Configuracion } from '../../configuracion/esquema';
import { CREDENCIALES_EN_EL_EDGE } from '../../comun/credenciales-en-el-edge';
import type { CredencialesEnElEdge } from '../../comun/credenciales-en-el-edge';
import type { CorrectorDeEquipo, RepositorioDeEquipos, SondaDeEquipo } from '../aplicacion/puertos';
import {
  SecretosDeAlarmServerEnMemoria,
  type SecretosDeAlarmServer,
} from '../aplicacion/secretos-de-alarm-server';
import { CorrectorPorProveedor } from './corrector-por-proveedor';
import { RepositorioConCredencialEnElEdge, SecretosConEdge } from './credencial-en-el-edge';
import { CorrectorPorElEdge, SondaPorElEdge } from './por-el-edge';
import { RepositorioDeEquiposPg } from './repositorio-equipos-pg';
import { SecretosDeAlarmServerPg } from './secretos-de-alarm-server-pg';
import { SondaPorProveedor } from './sonda-por-proveedor';

/**
 * 15-Q2 · las fábricas de lo que en `equipos` toca la credencial de un equipo
 * o habla con él sin pasar por el puerto. Sin `CREDENCIALES_EN_EL_EDGE` (sin
 * base, o un banco que monta el módulo a solas) construyen EXACTAMENTE lo de
 * siempre (R1); con él, lo envuelven para que, con puente, vaya por el Edge.
 */
export const CON_EDGE = { token: CREDENCIALES_EN_EL_EDGE, optional: true };
type Edge = CredencialesEnElEdge | null | undefined;

const envolver = <T>(base: T, edge: Edge, conEdge: (b: T, e: CredencialesEnElEdge) => T): T =>
  edge === null || edge === undefined ? base : conEdge(base, edge);

export const repositorioDeEquipos = (
  pool: Pool,
  c: Configuracion,
  edge: Edge,
): RepositorioDeEquipos =>
  envolver<RepositorioDeEquipos>(
    new RepositorioDeEquiposPg(pool, c.EQUIPOS_LLAVE, c.EQUIPOS_LLAVE_REF),
    edge,
    (b, e) => new RepositorioConCredencialEnElEdge(b, e),
  );

export const secretosDeAlarmServer = (
  pool: Pool,
  c: Configuracion,
  edge: Edge,
): SecretosDeAlarmServer =>
  c.PERSISTENCIA_DE_EVENTOS === 'postgres'
    ? envolver<SecretosDeAlarmServer>(
        new SecretosDeAlarmServerPg(pool, c.EQUIPOS_LLAVE),
        edge,
        (b, e) => new SecretosConEdge(b, e),
      )
    : new SecretosDeAlarmServerEnMemoria();

/** D2 · C3 (15-L) · «Probar conexión» pregunta también el video (RTSP). */
export const sondaDeEquipo = (bitacora: Bitacora, c: Configuracion, edge: Edge): SondaDeEquipo => {
  const sonda = (diagnosticar?: ConstructorParameters<typeof SondaPorProveedor>[4]) =>
    new SondaPorProveedor(
      undefined,
      bitacora,
      c.VIDEO_PUERTO_RTSP,
      c.EQUIPOS_DESVIO_DE_RELOJ_S,
      diagnosticar,
    );
  return envolver<SondaDeEquipo>(sonda(), edge, (b, e) => new SondaPorElEdge(b, sonda, e));
};

/** 15-L · la apertura sin plataforma y el plazo, del `.env`: nunca del código. */
export const correctorDeEquipo = (c: Configuracion, edge: Edge): CorrectorDeEquipo => {
  const ajustes = {
    abrirSinPlataforma: c.TERMINAL_ABRE_SIN_PLATAFORMA,
    ...(c.TERMINAL_PLAZO_DE_VERIFICACION_S === undefined
      ? {}
      : { plazoS: c.TERMINAL_PLAZO_DE_VERIFICACION_S }),
  };
  const corrector = (aplicar?: ConstructorParameters<typeof CorrectorPorProveedor>[2]) =>
    new CorrectorPorProveedor(undefined, ajustes, aplicar);
  return envolver<CorrectorDeEquipo>(
    corrector(),
    edge,
    (b, e) => new CorrectorPorElEdge(b, corrector, e),
  );
};
