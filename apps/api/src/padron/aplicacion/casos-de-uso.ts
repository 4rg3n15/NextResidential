import { Documento, NombreDePersona, Placa } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type {
  FiltroDeViviendas,
  PersonaEnLista,
  RepositorioPadron,
  TipoDeVehiculo,
  TotalesDePadron,
  VehiculoEnLista,
  ViviendaEnLista,
} from './puertos';

/**
 * Casos de uso del padrón. Orquestan: validan forma con el VO, delegan la
 * garantía a la base y traducen el resultado. **No deciden**: la decisión de
 * si una placa puede existir la toma el índice único, no este código.
 */
export interface EntradaRegistrarVehiculo {
  readonly viviendaId: string;
  readonly placa: string;
  readonly personaId?: string | null;
  readonly marca?: string | null;
  readonly modelo?: string | null;
  readonly color?: string | null;
  readonly tipo?: TipoDeVehiculo;
}

export class RegistrarVehiculo {
  constructor(private readonly repo: RepositorioPadron) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaRegistrarVehiculo,
  ): Promise<Resultado<{ id: string }, ErrorDominio>> {
    if (!ctx.copropiedadId) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no tiene copropiedad', 'RN-15'),
      );
    }
    // La placa se normaliza AQUÍ, antes de tocar la base. Si se normalizara
    // después, el índice único compararía formas distintas del mismo dato.
    // No se usa `encadenar`: es síncrono a propósito —el dominio no hace I/O—
    // y forzarlo a envolver una promesa mentiría sobre su contrato.
    const placaValidada = Placa.crear(entrada.placa);
    if (!placaValidada.ok) return placaValidada;
    const placa = placaValidada.valor;

    const r = await this.repo.registrarVehiculo({
      copropiedadId: ctx.copropiedadId,
      viviendaId: entrada.viviendaId,
      personaId: entrada.personaId ?? null,
      placa,
      marca: entrada.marca ?? null,
      modelo: entrada.modelo ?? null,
      color: entrada.color ?? null,
      tipo: entrada.tipo ?? 'automovil',
      actorId: ctx.usuarioId,
    });

    // El rechazo lo produjo el índice único de la base, no este código: es la
    // materialización de ADR-04 y el motivo de que KPI-03 se pueda cumplir.
    return r.tipo === 'registrado'
      ? exito({ id: r.id })
      : fallo(
          errorDominio(
            'CONFLICTO_DE_CONCURRENCIA',
            `La placa ${placa} ya está activa en esta copropiedad`,
            'RN-04',
          ),
        );
  }
}

export class DesactivarVehiculo {
  constructor(private readonly repo: RepositorioPadron) {}
  async ejecutar(
    ctx: ContextoTenant,
    vehiculoId: string,
    motivo: string,
  ): Promise<Resultado<void, ErrorDominio>> {
    if (motivo.trim().length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'La desactivación exige un motivo', 'RN-19'));
    }
    if (!ctx.copropiedadId) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no tiene copropiedad', 'RN-15'),
      );
    }
    const hecho = await this.repo.desactivarVehiculo(
      ctx.copropiedadId,
      vehiculoId,
      motivo,
      ctx.usuarioId,
    );
    return hecho
      ? exito(undefined)
      : fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Vehículo activo no encontrado'));
  }
}

export class DesactivarVivienda {
  constructor(private readonly repo: RepositorioPadron) {}
  async ejecutar(
    ctx: ContextoTenant,
    viviendaId: string,
    motivo: string,
  ): Promise<Resultado<void, ErrorDominio>> {
    if (motivo.trim().length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'La desactivación exige un motivo', 'RN-19'));
    }
    if (!ctx.copropiedadId) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no tiene copropiedad', 'RN-15'),
      );
    }
    const hecho = await this.repo.desactivarVivienda(
      ctx.copropiedadId,
      viviendaId,
      motivo,
      ctx.usuarioId,
    );
    return hecho
      ? exito(undefined)
      : fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Vivienda activa no encontrada'));
  }
}

/**
 * **La copropiedad sale del contexto, nunca de la entrada.** Se repite en los
 * cinco casos de uso de abajo y no es ceremonia: un `copropiedadId` que viaje
 * en el cuerpo es un campo con el que equivocarse, y el modo de equivocarse es
 * escribir en el tenant de otro. Aquí ese campo no existe.
 */
const sinCopropiedad = (): ErrorDominio =>
  errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no tiene copropiedad', 'RN-15');

export interface EntradaRegistrarVivienda {
  readonly identificador: string;
  readonly manzana?: string | null;
  readonly direccion?: string | null;
}

export class RegistrarVivienda {
  constructor(private readonly repo: RepositorioPadron) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaRegistrarVivienda,
  ): Promise<Resultado<{ id: string }, ErrorDominio>> {
    if (!ctx.copropiedadId) return fallo(sinCopropiedad());
    const identificador = entrada.identificador.trim();
    if (identificador.length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'El identificador no puede ir vacío', 'RN-13'));
    }
    const r = await this.repo.registrarVivienda({
      copropiedadId: ctx.copropiedadId,
      identificador,
      manzana: entrada.manzana ?? null,
      direccion: entrada.direccion ?? null,
      actorId: ctx.usuarioId,
    });
    // Igual que la placa: quien decide es el índice único parcial de la base,
    // no un `SELECT` previo de este código (ADR-04).
    return r.tipo === 'registrada'
      ? exito({ id: r.id })
      : fallo(
          errorDominio(
            'CONFLICTO_DE_CONCURRENCIA',
            `Ya hay una vivienda activa con el identificador ${identificador}`,
            'RN-13',
          ),
        );
  }
}

export interface EntradaRegistrarResidente {
  readonly viviendaId: string;
  readonly personaId: string;
  readonly esTitular?: boolean;
  readonly parentesco?: string | null;
}

export class RegistrarResidente {
  constructor(private readonly repo: RepositorioPadron) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaRegistrarResidente,
  ): Promise<Resultado<{ id: string }, ErrorDominio>> {
    if (!ctx.copropiedadId) return fallo(sinCopropiedad());
    const r = await this.repo.registrarResidente({
      copropiedadId: ctx.copropiedadId,
      viviendaId: entrada.viviendaId,
      personaId: entrada.personaId,
      esTitular: entrada.esTitular ?? false,
      parentesco: entrada.parentesco ?? null,
      actorId: ctx.usuarioId,
    });
    return r === null
      ? fallo(
          errorDominio(
            'CONFLICTO_DE_CONCURRENCIA',
            'Esa persona ya consta como residente activo de la vivienda',
            'KPI-01',
          ),
        )
      : exito(r);
  }
}

/* ── Personas · identidad compartida (D-01, RN-06) ─────────────────────── */

/**
 * **D-72 · La consola no pide un UUID; pide un nombre o un documento.**
 *
 * Estos dos casos de uso existen para que el formulario de autorización pueda
 * resolver la identidad sin que nadie escriba un identificador interno. El
 * límite lo fija este caso de uso y no el cliente: una búsqueda incremental que
 * el navegador pudiera pedir sin tope descargaría el padrón entero letra a
 * letra.
 */
const LIMITE_DE_BUSQUEDA = 20;

export class BuscarPersonas {
  constructor(private readonly repo: RepositorioPadron) {}

  /**
   * No recibe `ContextoTenant`: el alcance se comprobó en el controlador con
   * `exigirAlcance`, igual que en las demás lecturas. Un parámetro de identidad
   * que este método no usa haría creer que comprueba algo.
   */
  async ejecutar(
    copropiedadId: string,
    busqueda: string,
  ): Promise<Resultado<readonly PersonaEnLista[], ErrorDominio>> {
    const texto = busqueda.trim().slice(0, 120);
    if (texto.length < 2) {
      // Con una sola letra la lista no discrimina nada y la consulta recorre
      // todo el padrón. Devolver vacío es la respuesta honesta: la consola
      // muestra «escribe al menos dos caracteres», no «sin resultados».
      return exito([]);
    }
    // La forma normalizada la produce el VO, no el adaptador: así `12.345.678`
    // encuentra a quien está guardado como `12345678` sin que la consulta SQL
    // tenga que conocer las reglas de normalización.
    const documento = Documento.normalizarNumero(texto);
    return exito(
      await this.repo.buscarPersonas(copropiedadId, texto, documento ?? '', LIMITE_DE_BUSQUEDA),
    );
  }
}

export interface EntradaRegistrarPersona {
  readonly tipoDocumento: string;
  readonly numeroDocumento: string;
  readonly nombreCompleto: string;
  readonly telefono?: string | null;
  readonly correo?: string | null;
}

/**
 * Alta de persona en el mismo paso en que se la autoriza (HU-07).
 *
 * Devuelve `yaExistia` en vez de fallar cuando el documento ya está: el
 * documento ES la identidad (RN-06), y crear una segunda fila para la misma
 * cédula sería justo la fuga que la tabla `personas` vino a cerrar.
 */
export class RegistrarPersona {
  constructor(private readonly repo: RepositorioPadron) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaRegistrarPersona,
  ): Promise<
    Resultado<
      { readonly id: string; readonly nombreCompleto: string; readonly yaExistia: boolean },
      ErrorDominio
    >
  > {
    if (!ctx.copropiedadId) return fallo(sinCopropiedad());

    const documento = Documento.crear(entrada.tipoDocumento, entrada.numeroDocumento);
    if (!documento.ok) return documento;
    const nombre = NombreDePersona.crear(entrada.nombreCompleto);
    if (!nombre.ok) return nombre;

    const r = await this.repo.registrarPersona({
      copropiedadId: ctx.copropiedadId,
      documento: documento.valor,
      nombreCompleto: nombre.valor.valor,
      telefono: entrada.telefono ?? null,
      correo: entrada.correo ?? null,
      actorId: ctx.usuarioId,
    });
    return exito({
      id: r.id,
      nombreCompleto: r.nombreCompleto,
      yaExistia: r.tipo === 'ya_existia',
    });
  }
}

/**
 * Lecturas. Están en la capa de APLICACIÓN y no en el controlador —§2.2 lo
 * exige— por una razón que se ve en cuanto llega la segunda superficie: la app
 * del residente (ETAPA 11) va a pedir lo mismo, y una consulta escrita dentro
 * de un controlador se copia en el siguiente.
 */
export class ListarViviendas {
  constructor(private readonly repo: RepositorioPadron) {}

  /**
   * No recibe `ContextoTenant`, y es deliberado: el alcance ya se comprobó en
   * el controlador con `exigirAlcance` antes de llegar aquí. Un segundo
   * parámetro de identidad que este método NO usa invitaría a creer que
   * comprueba algo, y un control que parece existir es peor que ninguno.
   */
  async ejecutar(
    copropiedadId: string,
    filtro: FiltroDeViviendas,
  ): Promise<
    Resultado<
      { readonly totales: TotalesDePadron; readonly viviendas: readonly ViviendaEnLista[] },
      ErrorDominio
    >
  > {
    return exito(await this.repo.listarViviendas(copropiedadId, filtro));
  }
}

export class ListarVehiculos {
  constructor(private readonly repo: RepositorioPadron) {}

  async ejecutar(
    copropiedadId: string,
  ): Promise<Resultado<readonly VehiculoEnLista[], ErrorDominio>> {
    return exito(await this.repo.listarVehiculos(copropiedadId));
  }
}
