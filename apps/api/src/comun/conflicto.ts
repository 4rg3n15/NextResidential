import { ConflictException } from '@nestjs/common';
import type { CodigoDeConflicto } from '@ncr/domain-core';

/**
 * 15-Z2 · DT-15W-01 · DT-15X-09 · EL ÚNICO 409 DE LA API.
 *
 * Todo conflicto de negocio sale por aquí con su `codigo` del dominio además
 * del texto: `{ message, codigo }`, que el filtro global envuelve en
 * `mensaje`. La consola lo lee como `ErrorDeApi.causa` y la app como
 * `Fallo.codigo`, y deciden por él. `conflicto.test.ts` comprueba que ningún
 * otro fichero construya `ConflictException` a mano.
 */
export const conflicto = (codigo: CodigoDeConflicto, mensaje: string): ConflictException =>
  new ConflictException({ message: mensaje, codigo });
