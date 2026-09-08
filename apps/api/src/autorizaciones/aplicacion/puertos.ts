import type {
  Autorizacion,
  ContextoDeAcceso,
  VersionDeReglas,
  ZonaSolicitada,
} from '@ncr/domain-core';

/**
 * Puertos del módulo de autorizaciones. La aplicación los DEFINE; la
 * infraestructura los cumple (§2.2, DIP).
 *
 * `CargadorDeContexto` es el puerto que hace posible que el motor sea puro:
 * todo el I/O ocurre aquí, antes de evaluar. El motor recibe el contexto ya
 * cerrado y no puede preguntar nada más.
 */
export interface RepositorioAutorizaciones {
  guardar(copropiedadId: string, autorizacion: Autorizacion, actorId: string): Promise<void>;
  porId(copropiedadId: string, autorizacionId: string): Promise<Autorizacion | null>;
  vigentesDePersona(copropiedadId: string, personaId: string): Promise<readonly Autorizacion[]>;
}

export interface EntradaListaNegra {
  readonly id: string;
  readonly copropiedadId: string;
  readonly personaId: string | null;
  readonly placa: string | null;
  readonly motivo: string;
  readonly creadaPor: string;
  readonly levantadaPor: string | null;
  readonly levantadaEn: Date | null;
}

export interface RepositorioListaNegra {
  crear(entrada: Omit<EntradaListaNegra, 'levantadaPor' | 'levantadaEn'>): Promise<void>;
  porId(copropiedadId: string, id: string): Promise<EntradaListaNegra | null>;
  levantar(copropiedadId: string, id: string, actorId: string, ahora: Date): Promise<boolean>;
  activasDe(copropiedadId: string): Promise<readonly EntradaListaNegra[]>;
}

export interface RepositorioVersionDeReglas {
  vigenteDe(copropiedadId: string): Promise<VersionDeReglas>;
}

/** Datos de la solicitud tal como llegan del punto de acceso, ya normalizados. */
export interface SolicitudDeAcceso {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly metodo: ContextoDeAcceso['metodo'];
  readonly personaId: string | null;
  readonly placaLeida: string | null;
  readonly zonaId: string | null;
  readonly confianza: number;
}

/**
 * Reúne, con I/O, todo lo que el motor necesita. Existe como puerto propio y no
 * como método de un repositorio porque cruza varios agregados —autorizaciones,
 * lista negra, zona, consentimiento— y ninguno es su dueño.
 */
export interface CargadorDeContexto {
  cargar(solicitud: SolicitudDeAcceso, ahora: Date): Promise<ContextoDeAcceso>;
}

/**
 * Resuelve la zona que el motor necesita en el contexto — CU-05, ETAPA 07.
 *
 * Lo declara el CONSUMIDOR: el cargador de contexto necesita saber si la zona
 * abre y si está llena, y no le importa quién se lo diga. El módulo de zonas lo
 * satisface desde su repositorio, y la raíz de composición los une. Así el
 * módulo de autorizaciones no aparece en ningún `import` del de zonas ni al
 * revés (§2.2).
 */
export interface ResolutorDeZona {
  resolver(copropiedadId: string, zonaId: string, ahora: Date): Promise<ZonaSolicitada | null>;
}

export const RESOLUTOR_DE_ZONA = Symbol.for('ncr.puerto.ResolutorDeZona');

export const REPOSITORIO_AUTORIZACIONES = Symbol.for('ncr.puerto.RepositorioAutorizaciones');
export const REPOSITORIO_LISTA_NEGRA = Symbol.for('ncr.puerto.RepositorioListaNegra');
export const REPOSITORIO_VERSION_REGLAS = Symbol.for('ncr.puerto.RepositorioVersionDeReglas');
export const CARGADOR_DE_CONTEXTO = Symbol.for('ncr.puerto.CargadorDeContexto');
