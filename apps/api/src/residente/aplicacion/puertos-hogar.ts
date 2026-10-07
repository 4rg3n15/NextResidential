/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PUERTOS DEL HOGAR DEL RESIDENTE · ETAPA 15-I (D5, D6, D7, 3.2 a 3.5)
 *
 * Cuatro preguntas de naturaleza distinta, cuatro puertos (ISP, §2.3):
 *
 *  · ALTA — con qué vivienda se vincula una cuenta nueva, y con qué código.
 *  · OCUPANTES — cuántas plazas tiene la vivienda y quién ocupa cada una.
 *  · VEHÍCULOS PROPIOS — los que registran los ocupantes, dentro del tope.
 *  · PERFIL — los datos de contacto y de identidad de la persona.
 *
 * La regla del ámbito de `puertos.ts` sigue en pie: ningún método que actúe
 * sobre la vivienda del residente recibe un `viviendaId` venido de la petición.
 * El alta es la única excepción, y lo es POR DEFINICIÓN: es el momento en que el
 * ámbito todavía no existe; por eso la vivienda se busca por su número y su
 * agrupación, y el vínculo exige código cuando ya hay alguien dentro.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import type { AmbitoDelResidente, PerfilValido, VehiculoPropioValido } from '@ncr/domain-core';

export const ALTA_DEL_RESIDENTE = Symbol('ALTA_DEL_RESIDENTE');
export const OCUPANTES_DE_LA_VIVIENDA = Symbol('OCUPANTES_DE_LA_VIVIENDA');
export const VEHICULOS_PROPIOS = Symbol('VEHICULOS_PROPIOS');
export const PERFIL_DEL_RESIDENTE = Symbol('PERFIL_DEL_RESIDENTE');
export const CODIGOS_DE_OCUPANTE = Symbol('CODIGOS_DE_OCUPANTE');
export const BITACORA_DE_RESIDENTES = Symbol('BITACORA_DE_RESIDENTES');

/** Cómo llama ESTA copropiedad a sus viviendas (0029): nunca codificado. */
export interface VocabularioDeAlta {
  readonly copropiedadNombre: string;
  readonly tipo: string | null;
  readonly etiquetaVivienda: string;
  readonly etiquetaAgrupacion: string;
  /** 15-W · el prefijo de sus códigos de invitación (D1 de la 15-I), si lo tiene. */
  readonly codigoCorto: string | null;
}

export interface EstadoDeAltaGuardado {
  /** La vivienda vinculada, si ya la tiene. */
  readonly viviendaId: string | null;
  /** Primer residente de una vivienda cuyos ocupantes aún no se declararon. */
  readonly debeDeclararOcupantes: boolean;
  /**
   * 15-W (D3) · la vivienda que la cuenta ya trae ANTES del primer ingreso: la
   * del titular, por la administración (D1), o la de su plaza (D2). `null` si
   * no tiene ninguna: «la administración debe asignarle su vivienda».
   */
  readonly viviendaAsignada: { readonly viviendaId: string; readonly comoTitular: boolean } | null;
  /** D-W10 · el tope de plazas de ESA vivienda (vinculada o asignada); `null` sin vivienda. */
  readonly topeDePlazas: number | null;
}

export interface ViviendaEncontrada {
  readonly id: string;
  readonly activa: boolean;
  /** Otra cuenta activa ya está vinculada a ella. */
  readonly tieneCuenta: boolean;
}

export interface PlazaDeOcupante {
  readonly id: string;
  readonly numero: number;
  readonly generacion: number;
  /** La cuenta que la ocupa, o `null`. Libre = sin cuenta y sin persona (15-W). */
  readonly usuarioId: string | null;
  /** 15-W (D-W2) · la persona SIN cuenta (un menor) que la ocupa, o `null`. */
  readonly personaId?: string | null;
  readonly ocupante: string | null;
}

/** 15-W · ya sólo con código: nadie se vincula como primer residente (D-W9). */
export interface ModoDeVinculo {
  readonly tipo: 'plaza';
  readonly plazaId: string;
  readonly generacion: number;
}

export interface VinculoPedido {
  readonly copropiedadId: string;
  readonly usuarioId: string;
  readonly viviendaId: string;
  readonly modo: ModoDeVinculo;
  readonly perfil: PerfilValido;
  readonly ahora: Date;
}

/** Lo que la base puede rechazar AUNQUE la decisión del dominio fuera «sí»: una carrera. */
export type VinculoEscrito =
  | { readonly ok: true; readonly residenteId: string }
  | { readonly ok: false; readonly motivo: 'DOCUMENTO_EN_USO' | 'CODIGO_INCORRECTO' };

export interface AltaDelResidente {
  vocabulario(copropiedadId: string): Promise<VocabularioDeAlta | null>;
  estado(copropiedadId: string, usuarioId: string): Promise<EstadoDeAltaGuardado>;
  /** Por número y, si se da, agrupación. Varias si el número se repite sin agrupación. */
  buscarVivienda(
    copropiedadId: string,
    usuarioId: string,
    identificador: string,
    agrupacion: string | null,
  ): Promise<readonly ViviendaEncontrada[]>;
  codigosIncorrectosDesde(copropiedadId: string, usuarioId: string, desde: Date): Promise<number>;
  plazasLibres(copropiedadId: string, viviendaId: string): Promise<readonly PlazaDeOcupante[]>;
  /**
   * El cambio de vivienda (3.5), TODO en una transacción y bajo un bloqueo por
   * vivienda: la plaza ocupada, la persona (la del documento, si existe y está
   * libre), el residente, el vínculo de la cuenta, la baja del vínculo anterior
   * y su fila en la bitácora, como el rastro de la 0028.
   */
  vincular(pedido: VinculoPedido): Promise<VinculoEscrito>;
}

export interface OcupantesDeLaVivienda {
  plazas(copropiedadId: string, viviendaId: string): Promise<readonly PlazaDeOcupante[]>;
  /** ¿Es esta cuenta el titular, ya se declaró, cuál es el tope y el prefijo de los códigos? */
  declaracion(
    copropiedadId: string,
    viviendaId: string,
    usuarioId: string,
  ): Promise<{
    readonly esPrimerResidente: boolean;
    readonly declarada: boolean;
    readonly tope: number;
    readonly codigoCorto: string | null;
  }>;
  /** Crea N plazas (la 1, ocupada por quien declara) y sella la declaración. `false` si otro ganó. */
  declarar(
    copropiedadId: string,
    viviendaId: string,
    usuarioId: string,
    numero: number,
  ): Promise<boolean>;
  /** Superadministrador: `cantidad` plazas más. `null` si la vivienda no es de ahí; 20 es la cota. */
  anadir(
    copropiedadId: string,
    viviendaId: string,
    cantidad: number,
    actorId: string,
  ): Promise<readonly PlazaDeOcupante[] | null | 'COTA_DE_LA_PLATAFORMA'>;
  /** Superadministrador: retira una plaza; si estaba ocupada, da de baja ese vínculo. */
  retirar(
    copropiedadId: string,
    viviendaId: string,
    plazaId: string,
    motivo: string,
    actorId: string,
  ): Promise<boolean>;
}

export interface VehiculoPropioGuardado {
  readonly id: string;
  readonly viviendaId: string;
  readonly vivienda: string;
  readonly placa: string;
  readonly color: string | null;
  readonly modelo: string | null;
  readonly marca: string | null;
  readonly tipo: string;
  readonly registradoEn: string;
  readonly registradoPor: string | null;
  readonly ocupantes: readonly string[];
  readonly activo: boolean;
}

export type AltaDeVehiculo =
  | { readonly ok: true; readonly id: string }
  | {
      readonly ok: false;
      readonly motivo: 'TOPE_ALCANZADO' | 'PLACA_DUPLICADA' | 'OCUPANTE_AJENO';
    };

export interface VehiculosPropios {
  /** El tope vigente de la copropiedad y los propios activos de ESA vivienda. */
  cupo(ambito: AmbitoDelResidente): Promise<{ readonly tope: number; readonly ocupados: number }>;
  /** Los `residenteId` activos de la vivienda: los únicos vinculables. */
  ocupantes(ambito: AmbitoDelResidente): Promise<readonly string[]>;
  registrar(
    ambito: AmbitoDelResidente,
    actorId: string,
    vehiculo: VehiculoPropioValido,
  ): Promise<AltaDeVehiculo>;
  /** Sólo los registrados por residentes de ESA vivienda; `false` si no es uno de ellos. */
  desactivar(ambito: AmbitoDelResidente, vehiculoId: string, actorId: string): Promise<boolean>;
  /** Superadministrador: la vista de contrapeso (D5 a). */
  registradosPorResidentes(copropiedadId: string): Promise<readonly VehiculoPropioGuardado[]>;
}

export interface PerfilGuardado {
  readonly nombres: string | null;
  readonly apellidos: string | null;
  readonly nombreCompleto: string;
  readonly fechaNacimiento: string | null;
  readonly tipoDocumento: string | null;
  /** Sólo sale hacia el propio titular; nunca a un registro. */
  readonly numeroDocumento: string | null;
  readonly correo: string | null;
  readonly telefono: string | null;
  readonly copropiedadNombre: string;
  readonly copropiedadDireccion: string | null;
  readonly telefonoPorteria: string | null;
}

export interface PerfilDelResidente {
  /** Sólo de una cuenta ACTIVA con rol de residente en esa copropiedad. */
  perfil(copropiedadId: string, usuarioId: string): Promise<PerfilGuardado | null>;
  /**
   * `false` si el documento ya es de otra persona de la copropiedad. `actorId`
   * es quien escribe —el propio residente, o el superadministrador (G, 15-L)—
   * y firma la fila; por omisión, el residente.
   */
  guardar(
    copropiedadId: string,
    usuarioId: string,
    perfil: PerfilValido,
    actorId?: string,
  ): Promise<'guardado' | 'DOCUMENTO_EN_USO' | 'SIN_VINCULO'>;
}

/** ADR-025 · el código de una plaza: se deriva, no se guarda. */
export interface CodigosDeOcupante {
  codigoDe(copropiedadId: string, plazaId: string, generacion: number): string;
  /** La plaza cuyo código es ése, comparando en tiempo constante y sin salir antes. */
  plazaDelCodigo(
    copropiedadId: string,
    plazas: readonly PlazaDeOcupante[],
    codigo: string,
  ): PlazaDeOcupante | null;
}

export const CUENTAS_DE_RESIDENTES = Symbol('CUENTAS_DE_RESIDENTES');

/** Lo que el superadministrador ve de cada cuenta de residente: nunca su correo. */
export interface CuentaDeResidente {
  readonly usuarioId: string;
  readonly usuario: string | null;
  readonly nombre: string;
  readonly vivienda: string | null;
  readonly activa: boolean;
  readonly debeCambiarContrasena: boolean;
  readonly creadaEn: string;
  /** 15-W · la dio la administración (el titular) o la creó el residente con su código. */
  readonly origen: 'administracion' | 'autorregistro';
}

/** C9 (15-M) · lo que la baja necesita saber después: la persona, para sus plantillas. */
export interface CuentaDadaDeBaja {
  readonly usuarioId: string;
  readonly personaId: string | null;
}

export interface CuentasDeResidentes {
  listar(copropiedadId: string): Promise<readonly CuentaDeResidente[]>;
  /**
   * C9 (15-M) · baja lógica con motivo (RN-19, CA-02): la cuenta, su rol de
   * residente y sus vínculos de vivienda pasan a `inactivo` en una sola
   * transacción, con constancia en `auditoria_seguridad`. `null` si no hay
   * una cuenta de residente ACTIVA con ese identificador en la copropiedad.
   */
  darDeBaja(
    copropiedadId: string,
    usuarioId: string,
    motivo: string,
    actorId: string,
  ): Promise<CuentaDadaDeBaja | null>;
}

// 15-W · los tipos de hecho de la bitácora viven en su fichero (el de la 0055
// es más largo que el de la 0038); se reexportan para no mover a nadie.
export type {
  BitacoraDeResidentes,
  HechoDeResidente,
  TipoDeHechoDeResidente,
} from './tipos-de-hecho';
