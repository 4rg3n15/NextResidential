import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';
import type { Placa } from './placa';

export type EstadoRegistro = 'activo' | 'inactivo';
export type EstadoAdministrativo = 'al_dia' | 'en_mora' | 'suspendido';

export interface Residente {
  readonly id: string;
  readonly personaId: string;
  readonly esTitular: boolean;
  estado: EstadoRegistro;
}

export interface Vehiculo {
  readonly id: string;
  readonly placa: Placa;
  readonly personaId: string | null;
  estado: EstadoRegistro;
}

/**
 * Agregado raíz `Vivienda` (§2.2). Su frontera de consistencia son sus
 * residentes y sus vehículos: nadie los modifica por fuera.
 *
 * Cambia por **métodos de intención** (§2.4), nunca por asignación. La
 * diferencia no es estética: `vivienda.estado = 'inactivo'` no puede exigir un
 * motivo ni registrar quién lo hizo, y RN-19 depende exactamente de eso.
 */
export class Vivienda {
  private constructor(
    readonly id: string,
    readonly copropiedadId: string,
    readonly identificador: string,
    private _estado: EstadoRegistro,
    private _estadoAdministrativo: EstadoAdministrativo,
    private readonly _residentes: Residente[],
    private readonly _vehiculos: Vehiculo[],
  ) {}

  static reconstituir(datos: {
    id: string;
    copropiedadId: string;
    identificador: string;
    estado: EstadoRegistro;
    estadoAdministrativo: EstadoAdministrativo;
    residentes?: Residente[];
    vehiculos?: Vehiculo[];
  }): Vivienda {
    return new Vivienda(
      datos.id,
      datos.copropiedadId,
      datos.identificador,
      datos.estado,
      datos.estadoAdministrativo,
      datos.residentes ?? [],
      datos.vehiculos ?? [],
    );
  }

  get estado(): EstadoRegistro {
    return this._estado;
  }
  get estadoAdministrativo(): EstadoAdministrativo {
    return this._estadoAdministrativo;
  }
  get residentes(): readonly Residente[] {
    return this._residentes;
  }
  get vehiculos(): readonly Vehiculo[] {
    return this._vehiculos;
  }
  get activa(): boolean {
    return this._estado === 'activo';
  }

  /**
   * RN-19 / CA-02: **baja lógica, nunca borrado**. El motivo es obligatorio
   * porque una desactivación sin motivo es indistinguible de un error, y a los
   * seis meses nadie sabe si aquella vivienda se dio de baja o se perdió.
   */
  desactivar(motivo: string): Resultado<void, ErrorDominio> {
    if (!this.activa) {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'La vivienda ya está inactiva', 'RN-19'));
    }
    if (motivo.trim().length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'La desactivación exige un motivo', 'RN-19'));
    }
    this._estado = 'inactivo';
    return exito(undefined);
  }

  /**
   * RN-13, y es la regla menos intuitiva del padrón: una vivienda inactiva
   * **no genera autorizaciones nuevas, pero conserva las vigentes**. Se expone
   * como pregunta del agregado y no como un `if` en el motor de reglas, para
   * que la ETAPA 05 no tenga que volver a razonarla.
   */
  puedeGenerarAutorizaciones(): boolean {
    return this.activa;
  }

  agregarResidente(residente: Residente): Resultado<void, ErrorDominio> {
    if (!this.activa) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          'No se registran residentes en una vivienda inactiva',
          'RN-13',
        ),
      );
    }
    if (
      this._residentes.some((r) => r.personaId === residente.personaId && r.estado === 'activo')
    ) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'La persona ya es residente activo de esta vivienda',
          'KPI-01',
        ),
      );
    }
    // Un solo titular activo: dos titulares hacen ambigua la notificación de
    // CU-01 («¿a quién se le pregunta?»).
    if (residente.esTitular && this._residentes.some((r) => r.esTitular && r.estado === 'activo')) {
      return fallo(
        errorDominio('INVARIANTE_VIOLADA', 'La vivienda ya tiene un titular activo', 'RN-05'),
      );
    }
    this._residentes.push(residente);
    return exito(undefined);
  }

  /**
   * Registra un vehículo. La comprobación de placa repetida que hay aquí es
   * **conveniencia, no garantía**: solo ve los vehículos de ESTA vivienda ya
   * cargados en memoria, y dos peticiones simultáneas la superan las dos. La
   * garantía real es el índice único parcial de la base (ADR-04, KPI-03); esto
   * solo evita un viaje a la base en el caso obvio y devuelve un error legible.
   */
  registrarVehiculo(vehiculo: Vehiculo): Resultado<void, ErrorDominio> {
    if (!this.activa) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          'No se registran vehículos en una vivienda inactiva',
          'RN-13',
        ),
      );
    }
    if (this._vehiculos.some((v) => v.estado === 'activo' && v.placa.equivale(vehiculo.placa))) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          `La placa ${vehiculo.placa} ya está activa en esta vivienda`,
          'RN-04',
        ),
      );
    }
    this._vehiculos.push(vehiculo);
    return exito(undefined);
  }

  desactivarVehiculo(vehiculoId: string, motivo: string): Resultado<void, ErrorDominio> {
    const vehiculo = this._vehiculos.find((v) => v.id === vehiculoId);
    if (!vehiculo) {
      return fallo(
        errorDominio('ENTIDAD_NO_ENCONTRADA', 'Vehículo no encontrado en esta vivienda'),
      );
    }
    if (vehiculo.estado === 'inactivo') {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'El vehículo ya está inactivo', 'RN-19'));
    }
    if (motivo.trim().length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'La desactivación exige un motivo', 'RN-19'));
    }
    vehiculo.estado = 'inactivo';
    return exito(undefined);
  }

  desactivarResidente(residenteId: string, motivo: string): Resultado<void, ErrorDominio> {
    const residente = this._residentes.find((r) => r.id === residenteId);
    if (!residente) {
      return fallo(
        errorDominio('ENTIDAD_NO_ENCONTRADA', 'Residente no encontrado en esta vivienda'),
      );
    }
    if (residente.estado === 'inactivo') {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'El residente ya está inactivo', 'RN-19'),
      );
    }
    if (motivo.trim().length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'La desactivación exige un motivo', 'RN-19'));
    }
    residente.estado = 'inactivo';
    return exito(undefined);
  }
}
