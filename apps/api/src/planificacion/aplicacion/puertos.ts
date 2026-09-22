/**
 * Puertos de planificación (§2.2, DIP). La aplicación declara QUÉ hay que
 * ejecutar y cada cuánto; la infraestructura decide con qué —pg-boss sobre el
 * mismo PostgreSQL, §2.6—.
 */
export const PLANIFICADOR = Symbol.for('ncr.puerto.Planificador');

export interface TrabajoProgramado {
  /** Nombre estable: es la CLAVE de la cola. Cambiarlo crea una cola nueva. */
  readonly nombre: string;
  /** Expresión cron de cinco campos, en UTC. */
  readonly cron: string;
  /** Qué hace y por qué necesita un planificador. Sale en el registro. */
  readonly descripcion: string;
  /**
   * La operación. **Tiene que ser idempotente**: pg-boss puede reintentar, dos
   * instancias de API pueden encolar el mismo instante, y un trabajo que no se
   * pueda repetir sin consecuencias acabaría duplicando alertas o supresiones.
   */
  ejecutar(): Promise<Readonly<Record<string, number>>>;
}

export interface Planificador {
  /** Registra el trabajo y su horario. No lo ejecuta. */
  programar(trabajo: TrabajoProgramado): void;
  /** Arranca el motor y da de alta los horarios. Idempotente. */
  arrancar(): Promise<void>;
  detener(): Promise<void>;
  /** Trabajos dados de alta, para el informe de salud y las pruebas. */
  readonly programados: readonly TrabajoProgramado[];
}

export const CATALOGO_DE_COPROPIEDADES = Symbol.for('ncr.puerto.CatalogoDeCopropiedades');

/**
 * Las copropiedades ACTIVAS, para los trabajos que barren todo el sistema.
 *
 * Es un puerto propio y no `RepositorioCopropiedades.listarParaElAlcance`, que
 * responde al alcance de un token: un trabajo programado no tiene token. Y el
 * matiz importa por §2.7.6 —los workers usan la llave secreta, que **omite la
 * RLS**—: al obligarlos a recorrer una lista explícita de identificadores, cada
 * caso de uso sigue recibiendo su `copropiedadId` y la validación de
 * aislamiento ocurre en la capa de aplicación, como exige esa regla. Un trabajo
 * que consultara «todas las filas» de una tabla operativa se saltaría esa
 * barrera sin que nada lo dijera.
 */
export interface CatalogoDeCopropiedades {
  activas(): Promise<readonly string[]>;
}
