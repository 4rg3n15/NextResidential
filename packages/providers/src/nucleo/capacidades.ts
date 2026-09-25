/**
 * CAPACIDADES DE UN EQUIPO, EN LENGUAJE NEUTRO · ETAPA 15-D (O2).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE ESTE FICHERO, Y QUÉ PROHÍBE
 *
 * Hasta la 15-C el proveedor decidía por **tipo declarado** —«si es cámara,
 * exige veredicto; si es terminal, sincroniza»— y el tipo declarado es una
 * palabra que alguien escribe en un formulario. El aparato de verdad puede no
 * tener lo que el tipo promete: el videoportero real del proyecto declara
 * `isSupportCallSignal=false`, y una consola que le pidiera contestar una
 * llamada obtendría un error del fabricante que nadie sabría traducir.
 *
 * Aquí se declara **lo que un equipo puede hacer**, sin nombrar marca ni modelo,
 * y a partir de ahora la decisión de «¿le pido esto?» se toma mirando esta
 * estructura y no un `tipo === '…'`. Es la regla de O2: *decidir por
 * capacidades declaradas o descubiertas, nunca por nombre de marca o modelo*.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TRES ESTADOS, NO DOS · `desconocida` NO ES `si`
 *
 * Un equipo que no contestó a la consulta de capacidades no «no soporta» y
 * tampoco «soporta»: **no se sabe**. Un `boolean` obligaría a elegir, y las dos
 * elecciones son malas: `false` niega un equipo que funciona, `true` afirma lo
 * que nadie comprobó. La dirección segura de este proyecto es la misma en todas
 * partes —negar por defecto— y por eso el consumidor trata `desconocida` como
 * `no` **y lo dice** en el motivo del error.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ NO HAY AQUÍ, A PROPÓSITO
 *
 * Ni un nombre de campo del fabricante, ni una ruta, ni un código. Quien
 * traduce `isSupportRemoteOpenDoor` a `apertura_remota` es el adaptador de esa
 * marca, dentro de su carpeta. Este fichero lo importan el adaptador ficticio,
 * el simulado y el real, y no sabe cuál de los tres lo está leyendo.
 */

/** Lo que se sabe de una capacidad: sí, no, o nadie lo ha comprobado. */
export type EstadoDeCapacidad = 'si' | 'no' | 'desconocida';

/** De dónde salió la declaración. Sin origen, una capacidad no vale nada. */
export type OrigenDeCapacidades =
  /** El aparato lo contestó a una consulta de capacidades. */
  | 'descubiertas'
  /** Las escribió una persona al dar de alta el equipo. */
  | 'declaradas'
  /** Nadie las consultó ni las declaró: todo `desconocida`. */
  | 'sin_consultar';

export interface CapacidadDeBiblioteca {
  readonly estado: EstadoDeCapacidad;
  /** Cuántas plantillas caben. `null` si el equipo no lo dice. */
  readonly maximo: number | null;
  /** Cuántas hay ahora. `null` si no se consultó. */
  readonly almacenadas: number | null;
}

export interface CapacidadDeAudio {
  readonly estado: EstadoDeCapacidad;
  /** Canal de audio descubierto en el aparato. `null` hasta que se descubra. */
  readonly canal: number | null;
  /** Códec en lenguaje neutro (p. ej. `g711u`). `null` si no se conoce. */
  readonly formato: string | null;
}

/**
 * Las capacidades que el sistema consulta antes de pedir algo a un equipo.
 * Cada una responde a una pregunta que algún caso de uso hace de verdad.
 */
export interface CapacidadesDeEquipo {
  readonly origen: OrigenDeCapacidades;
  /** ¿Puede la plataforma abrir el relé/puerta desde fuera? (apertura remota) */
  readonly aperturaRemota: EstadoDeCapacidad;
  /**
   * ¿Puede el equipo REPORTAR sin accionar, esperando el veredicto de la
   * plataforma? Es la capacidad que sostiene el principio rector en la
   * terminal facial: sin ella, el equipo decide y el motor se entera después.
   */
  readonly verificacionRemota: EstadoDeCapacidad;
  /** ¿Tiene biblioteca de rostros donde cargar y suprimir plantillas? */
  readonly bibliotecaDeRostros: CapacidadDeBiblioteca;
  /** ¿Gestiona personas (alta/baja) a las que asignar una plantilla? */
  readonly gestionDePersonas: EstadoDeCapacidad;
  /** ¿Audio bidireccional (ADR-01)? */
  readonly audioBidireccional: CapacidadDeAudio;
  /** ¿Señaliza llamadas (timbre) hacia la plataforma y admite contestarlas? */
  readonly senalizacionDeLlamada: EstadoDeCapacidad;
  /** ¿Admite que la plataforma se suscriba a sus eventos (transporte armado)? */
  readonly suscripcionDeEventos: EstadoDeCapacidad;
  /** ¿Reconoce matrículas? */
  readonly reconocimientoDePlacas: EstadoDeCapacidad;
  /** ¿Informa de la posición del brazo de la barrera? */
  readonly estadoDeBarrera: EstadoDeCapacidad;
  /**
   * ¿Admite dejar el acceso BLOQUEADO como estado persistente (H-3)? Bloquear
   * no es cerrar: es un estado que manda sobre toda decisión posterior, y sólo
   * lo declara quien lo ejecuta de verdad —la barrera vehicular, hoy—. Un
   * equipo que sólo abre por orden declara `no`, y la consola lo ve así.
   */
  readonly bloqueoDeAcceso: EstadoDeCapacidad;
}

/** Nombre de cada capacidad, para nombrarla en un error o en una pantalla. */
export type NombreDeCapacidad = Exclude<keyof CapacidadesDeEquipo, 'origen'>;

/** Todo `desconocida`: lo que se sabe de un equipo del que nadie preguntó. */
export const CAPACIDADES_SIN_CONSULTAR: CapacidadesDeEquipo = Object.freeze<CapacidadesDeEquipo>({
  origen: 'sin_consultar',
  aperturaRemota: 'desconocida',
  verificacionRemota: 'desconocida',
  bibliotecaDeRostros: { estado: 'desconocida', maximo: null, almacenadas: null },
  gestionDePersonas: 'desconocida',
  audioBidireccional: { estado: 'desconocida', canal: null, formato: null },
  senalizacionDeLlamada: 'desconocida',
  suscripcionDeEventos: 'desconocida',
  reconocimientoDePlacas: 'desconocida',
  estadoDeBarrera: 'desconocida',
  bloqueoDeAcceso: 'desconocida',
});

/** El estado de una capacidad, sea simple o compuesta. */
export const estadoDe = (
  capacidades: CapacidadesDeEquipo,
  nombre: NombreDeCapacidad,
): EstadoDeCapacidad => {
  const valor = capacidades[nombre];
  return typeof valor === 'string' ? valor : valor.estado;
};

/**
 * `true` sólo con `si`. **`desconocida` cuenta como no**: es la dirección
 * segura, y quien la niegue tiene que decir en el motivo que fue por no saber.
 */
export const soporta = (capacidades: CapacidadesDeEquipo, nombre: NombreDeCapacidad): boolean =>
  estadoDe(capacidades, nombre) === 'si';

/**
 * Construye unas capacidades DECLARADAS a partir de un subconjunto: lo que no
 * se declara queda `desconocida`, nunca `si`. Es lo que usa un alta manual y
 * lo que usa el adaptador ficticio para describirse.
 */
export const capacidadesDeclaradas = (
  parciales: Partial<Omit<CapacidadesDeEquipo, 'origen'>>,
): CapacidadesDeEquipo => ({
  ...CAPACIDADES_SIN_CONSULTAR,
  ...parciales,
  origen: 'declaradas',
});

/** Las mismas, pero descubiertas en el aparato. */
export const capacidadesDescubiertas = (
  parciales: Partial<Omit<CapacidadesDeEquipo, 'origen'>>,
): CapacidadesDeEquipo => ({
  ...CAPACIDADES_SIN_CONSULTAR,
  ...parciales,
  origen: 'descubiertas',
});

/** Todo `si`, para un simulado que finge un equipo completo. */
export const CAPACIDADES_COMPLETAS: CapacidadesDeEquipo = Object.freeze<CapacidadesDeEquipo>({
  origen: 'declaradas',
  aperturaRemota: 'si',
  verificacionRemota: 'si',
  bibliotecaDeRostros: { estado: 'si', maximo: null, almacenadas: null },
  gestionDePersonas: 'si',
  audioBidireccional: { estado: 'si', canal: 1, formato: 'g711u' },
  senalizacionDeLlamada: 'si',
  suscripcionDeEventos: 'si',
  reconocimientoDePlacas: 'si',
  estadoDeBarrera: 'si',
  bloqueoDeAcceso: 'si',
});

/**
 * Lee unas capacidades PERSISTIDAS (p. ej. una columna `jsonb`) sin confiar en
 * su forma: cualquier campo ausente o con un valor que no es uno de los tres
 * estados vuelve a `desconocida`. Un JSON corrupto nunca produce un `si`.
 */
export const capacidadesDesdeJson = (crudo: unknown): CapacidadesDeEquipo => {
  if (typeof crudo !== 'object' || crudo === null) return CAPACIDADES_SIN_CONSULTAR;
  const objeto = crudo as Record<string, unknown>;
  const estado = (valor: unknown): EstadoDeCapacidad =>
    valor === 'si' || valor === 'no' ? valor : 'desconocida';
  const numero = (valor: unknown): number | null =>
    typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
  const texto = (valor: unknown): string | null =>
    typeof valor === 'string' && valor.trim() !== '' ? valor : null;
  const compuesta = (valor: unknown): Record<string, unknown> =>
    typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : {};
  const biblioteca = compuesta(objeto['bibliotecaDeRostros']);
  const audio = compuesta(objeto['audioBidireccional']);
  const origen = objeto['origen'];
  return {
    origen:
      origen === 'descubiertas' || origen === 'declaradas' || origen === 'sin_consultar'
        ? origen
        : 'sin_consultar',
    aperturaRemota: estado(objeto['aperturaRemota']),
    verificacionRemota: estado(objeto['verificacionRemota']),
    bibliotecaDeRostros: {
      estado: estado(biblioteca['estado']),
      maximo: numero(biblioteca['maximo']),
      almacenadas: numero(biblioteca['almacenadas']),
    },
    gestionDePersonas: estado(objeto['gestionDePersonas']),
    audioBidireccional: {
      estado: estado(audio['estado']),
      canal: numero(audio['canal']),
      formato: texto(audio['formato']),
    },
    senalizacionDeLlamada: estado(objeto['senalizacionDeLlamada']),
    suscripcionDeEventos: estado(objeto['suscripcionDeEventos']),
    reconocimientoDePlacas: estado(objeto['reconocimientoDePlacas']),
    estadoDeBarrera: estado(objeto['estadoDeBarrera']),
    bloqueoDeAcceso: estado(objeto['bloqueoDeAcceso']),
  };
};
