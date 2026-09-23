import { Documento, NombreDePersona, Placa } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { errorDominio, exito, fallo, recortarEtiqueta } from '@ncr/domain-core';
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
import { totalDeHistorial } from './puertos';
import type { LectorDeVocabulario } from './vocabulario';
import { VOCABULARIO_SIN_CONFIGURAR } from './vocabulario';

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
 * ═══════════════════════════════════════════════════════════════════════════
 * B.2 · BORRADO DEFINITIVO Y REACTIVACIÓN — el choque real con RN-19
 *
 * RN-19, CA-02 y KPI-04 prohíben el borrado físico **donde hay historial**. La
 * baja lógica cubre el caso normal: una vivienda que existió y ya no se usa
 * conserva sus eventos, que son la trazabilidad de accesos que RN-03 declara
 * inmutable.
 *
 * Lo que no cubría es el caso que el usuario encontró: **«la creé por error
 * hace un minuto»**. Una vivienda sin un solo residente, vehículo,
 * autorización ni evento no tiene historial que proteger, y obligar a
 * arrastrarla desactivada para siempre convierte una regla de trazabilidad en
 * un estorbo — y enseña a desconfiar de la regla.
 *
 * La comprobación vive en el SERVIDOR, y en dos capas: este caso de uso
 * cuenta el historial para poder DECIR qué lo impide y cuántos registros hay,
 * y el disparador de la base lo impide de verdad, también frente al dueño de
 * la tabla (migración 0032). Si sólo estuviera aquí, bastaría un `curl`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export class BorrarViviendaDefinitivamente {
  constructor(private readonly repo: RepositorioPadron) {}
  async ejecutar(
    ctx: ContextoTenant,
    viviendaId: string,
  ): Promise<Resultado<{ identificador: string }, ErrorDominio>> {
    if (!ctx.copropiedadId) return fallo(sinCopropiedad());

    const historial = await this.repo.historialDeVivienda(ctx.copropiedadId, viviendaId);
    if (historial === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Vivienda no encontrada'));
    }

    const total = totalDeHistorial(historial);
    if (total > 0) {
      // El mensaje NOMBRA lo que lo impide y CUÁNTO hay. «No se puede borrar»
      // manda a adivinar; esto manda a dar de baja los tres residentes que
      // quedan, que es lo que toca hacer.
      const partes = [
        historial.residentes > 0 ? `${String(historial.residentes)} residente(s)` : null,
        historial.vehiculos > 0 ? `${String(historial.vehiculos)} vehículo(s)` : null,
        historial.autorizaciones > 0
          ? `${String(historial.autorizaciones)} autorización(es)`
          : null,
        historial.eventos > 0 ? `${String(historial.eventos)} evento(s)` : null,
      ].filter((x): x is string => x !== null);
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          `La vivienda ${historial.identificador} tiene historial y no puede borrarse: ` +
            `${partes.join(', ')}. Dele de baja en vez de borrarla (RN-19)`,
          'RN-19',
        ),
      );
    }

    const r = await this.repo.borrarViviendaDefinitivamente(
      ctx.copropiedadId,
      viviendaId,
      ctx.usuarioId,
    );
    return r.borrada
      ? exito({ identificador: historial.identificador })
      : fallo(
          errorDominio(
            'OPERACION_NO_PERMITIDA',
            r.motivo ?? 'La base de datos rechazó el borrado',
            'RN-19',
          ),
        );
  }
}

export class ReactivarVivienda {
  constructor(private readonly repo: RepositorioPadron) {}
  async ejecutar(ctx: ContextoTenant, viviendaId: string): Promise<Resultado<void, ErrorDominio>> {
    if (!ctx.copropiedadId) return fallo(sinCopropiedad());
    const hecho = await this.repo.reactivarVivienda(ctx.copropiedadId, viviendaId, ctx.usuarioId);
    return hecho
      ? exito(undefined)
      : fallo(
          errorDominio(
            'ENTIDAD_NO_ENCONTRADA',
            'No hay una vivienda inactiva con ese identificador en esta copropiedad',
          ),
        );
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
  readonly agrupacion?: string | null;
}

export class RegistrarVivienda {
  constructor(
    private readonly repo: RepositorioPadron,
    private readonly vocabulario: LectorDeVocabulario,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaRegistrarVivienda,
  ): Promise<Resultado<{ id: string }, ErrorDominio>> {
    if (!ctx.copropiedadId) return fallo(sinCopropiedad());
    /**
     * ═════════════════════════════════════════════════════════════════════
     * NFC · H-13-16, la misma lección que ya estaba escrita para `Placa`
     *
     * `identificador` y `agrupacion` son los dos únicos campos de identidad del
     * padrón SIN objeto de valor, y por eso se quedaron sin normalizar. El
     * índice único parcial `(copropiedad_id, coalesce(agrupacion,''),
     * identificador)` compara BYTES, así que «Mañana» con `ñ` precompuesta y
     * «Mañana» con `n` + combinante son dos filas para PostgreSQL y una sola
     * vivienda para el portero. Medido:
     *
     *   alta 1 (NFC): U+004D U+0061 U+00F1 U+0061 …           -> registrada
     *   alta 2 (NFD): U+004D U+0061 U+006E U+0303 U+0061 …    -> registrada
     *   filas ACTIVAS que el usuario ve como la misma vivienda: 2
     *
     * Es literalmente el argumento que `persona.ts` escribe para el documento
     * —«12.345.678, 12345678 y 12 345 678 son tres filas para PostgreSQL y una
     * sola persona para el portero»— aplicado donde faltaba. NFC y no NFKC, por
     * el mismo motivo que allí: NFKC colapsa caracteres que aquí distinguen.
     * ═════════════════════════════════════════════════════════════════════
     */
    const identificador = entrada.identificador.normalize('NFC').trim();
    if (identificador.length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'El identificador no puede ir vacío', 'RN-13'));
    }

    const vocabulario =
      (await this.vocabulario.leer(ctx, ctx.copropiedadId)) ?? VOCABULARIO_SIN_CONFIGURAR;

    /**
     * **Control de H-3: la palabra no entra en el dato.**
     *
     * Aquí se RECHAZA, y en la importación se recorta. No es incoherencia: allí
     * el archivo es el que el administrador ya tenía y rechazarlo entero
     * convertiría la vía rápida en la lenta; aquí hay una persona escribiendo y
     * decírselo una vez evita que lo repita trescientas.
     *
     * Sin este control, el primero que teclee «Casa 42» reintroduce el problema
     * que todo el rediseño elimina: el día que el conjunto cambie «Casa» por
     * «Apartamento», esa vivienda se queda mintiendo.
     */
    const sinPalabra = recortarEtiqueta(identificador, vocabulario.etiquetaVivienda);
    if (sinPalabra !== null) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          `Escriba solo el número: la palabra «${vocabulario.etiquetaVivienda}» la pone el ` +
            `sistema. Para esta vivienda, «${sinPalabra}»`,
          'HU-01',
        ),
      );
    }

    // Misma normalización que el identificador (H-13-16): la agrupación forma
    // parte de la clave única, así que su forma Unicode decide si dos altas son
    // la misma vivienda o dos.
    const agrupacion = entrada.agrupacion?.normalize('NFC').trim();
    const r = await this.repo.registrarVivienda({
      copropiedadId: ctx.copropiedadId,
      identificador,
      agrupacion: agrupacion === undefined || agrupacion === '' ? null : agrupacion,
      actorId: ctx.usuarioId,
    });
    // Igual que la placa: quien decide es el índice único parcial de la base,
    // no un `SELECT` previo de este código (ADR-04). Desde la 0029 la clave es
    // el PAR (agrupación, identificador).
    return r.tipo === 'registrada'
      ? exito({ id: r.id })
      : fallo(
          errorDominio(
            'CONFLICTO_DE_CONCURRENCIA',
            `Ya hay una vivienda activa con el identificador ${identificador}` +
              (agrupacion === undefined || agrupacion === ''
                ? ''
                : ` en ${vocabulario.etiquetaAgrupacion} ${agrupacion}`),
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
