import { Placa, errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import type { RepositorioPadron, TipoDeVehiculo } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EDITAR Y BORRAR UN VEHÍCULO · LA LÓGICA DE O3, COMPARTIDA (RONDA 15-W, D5)
 *
 * Antes vivía dentro de `EditarVehiculo` y `BorrarVehiculoDefinitivamente`
 * (`casos-de-uso.ts`). La 15-W la necesita también para los vehículos PROPIOS
 * del residente, y el encargo pide reutilizarla, no copiarla: sale aquí, sin
 * cambiar una regla, y los dos casos de uso del padrón la llaman.
 *
 * Lo que cambia de un llamador a otro es SÓLO el repositorio: el del padrón
 * opera sobre la copropiedad; el del residente, sobre los vehículos propios de
 * SU vivienda. Por eso las funciones reciben la porción estrecha del puerto
 * que usan (ISP), no el repositorio entero.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface EntradaEditarVehiculo {
  readonly placa?: string;
  readonly personaId?: string | null;
  readonly marca?: string | null;
  readonly modelo?: string | null;
  readonly color?: string | null;
  readonly tipo?: TipoDeVehiculo;
}

/** Con historial, una placa nueva es otro vehículo (15-W, D5). */
export const MENSAJE_PLACA_CON_HISTORIAL = 'Dé de baja este vehículo y registre el nuevo';

export type PuertoDeEdicionDeVehiculo = Pick<RepositorioPadron, 'editarVehiculo'>;
export type PuertoDeBorradoDeVehiculo = Pick<
  RepositorioPadron,
  'historialDeVehiculo' | 'borrarVehiculoDefinitivamente'
>;

/** HU-04 · la placa pasa por el VO, como al registrar; la unicidad la decide el índice. */
export const editarVehiculoCon = async (
  repo: PuertoDeEdicionDeVehiculo,
  copropiedadId: string,
  vehiculoId: string,
  entrada: EntradaEditarVehiculo,
  actorId: string,
): Promise<Resultado<void, ErrorDominio>> => {
  let placa: Placa | undefined;
  if (entrada.placa !== undefined) {
    const validada = Placa.crear(entrada.placa);
    if (!validada.ok) return validada;
    placa = validada.valor;
  }
  const r = await repo.editarVehiculo({
    copropiedadId,
    vehiculoId,
    ...(placa === undefined ? {} : { placa }),
    ...(entrada.personaId === undefined ? {} : { personaId: entrada.personaId }),
    ...(entrada.marca === undefined ? {} : { marca: entrada.marca }),
    ...(entrada.modelo === undefined ? {} : { modelo: entrada.modelo }),
    ...(entrada.color === undefined ? {} : { color: entrada.color }),
    ...(entrada.tipo === undefined ? {} : { tipo: entrada.tipo }),
    actorId,
  });
  switch (r.tipo) {
    case 'editado':
      return exito(undefined);
    case 'no_encontrado':
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Vehículo no encontrado'));
    case 'placa_con_historial':
      return fallo(errorDominio('CONFLICTO_DE_CONCURRENCIA', MENSAJE_PLACA_CON_HISTORIAL, 'RN-19'));
    default:
      return fallo(
        errorDominio(
          'CONFLICTO_DE_CONCURRENCIA',
          `La placa ${placa?.valor ?? ''} ya está activa en esta copropiedad`,
          'RN-04',
        ),
      );
  }
};

/**
 * O3 · el caso «lo registré mal hace un minuto». **Sólo sin historial** —ni un
 * evento con esa placa ni una autorización—, y quien lo garantiza es el
 * disparador de la base (migración 0034), también frente al dueño de la tabla.
 */
export const borrarVehiculoSinHistorial = async (
  repo: PuertoDeBorradoDeVehiculo,
  copropiedadId: string,
  vehiculoId: string,
  actorId: string,
): Promise<Resultado<{ placa: string }, ErrorDominio>> => {
  const historial = await repo.historialDeVehiculo(copropiedadId, vehiculoId);
  if (historial === null) {
    return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Vehículo no encontrado'));
  }
  if (historial.eventos + historial.autorizaciones > 0) {
    const partes = [
      historial.eventos > 0 ? `${String(historial.eventos)} evento(s)` : null,
      historial.autorizaciones > 0 ? `${String(historial.autorizaciones)} autorización(es)` : null,
    ].filter((x): x is string => x !== null);
    return fallo(
      errorDominio(
        'OPERACION_NO_PERMITIDA',
        `El vehículo ${historial.placa} tiene historial y no puede borrarse: ${partes.join(', ')}. ` +
          'Dele de baja en vez de borrarlo (RN-19)',
        'RN-19',
      ),
    );
  }
  const r = await repo.borrarVehiculoDefinitivamente(copropiedadId, vehiculoId, actorId);
  return r.borrado
    ? exito({ placa: historial.placa })
    : fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          r.motivo ?? 'La base no admitió el borrado',
          'RN-19',
        ),
      );
};
