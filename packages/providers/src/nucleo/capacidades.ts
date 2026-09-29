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
  /**
   * F4 (15-L) · POR QUÉ no se pudo leer, en palabras («el equipo contestó
   * HTTP 400 (badParameters) a …»). Sólo con `estado === 'desconocida'`; en
   * `si` y `no` falta o es `null`. Es lo que la ficha enseña en «no se pudo
   * leer (motivo)»: sin él, `desconocida` no dice qué mirar.
   */
  readonly motivo?: string | null;
}

export interface CapacidadDeAudio {
  readonly estado: EstadoDeCapacidad;
  /** Canal de audio descubierto en el aparato. `null` hasta que se descubra. */
  readonly canal: number | null;
  /** Códec en lenguaje neutro (p. ej. `g711u`). `null` si no se conoce. */
  readonly formato: string | null;
}

/**
 * D2 · C3 (15-L) · el video, preguntado al equipo por RTSP: si lo entrega, en
 * qué códec y por qué canal. El navegador reproduce H.264; con H.265 la
 * consola lo dice en vez de quedarse en negro.
 */
export interface CapacidadDeVideo {
  readonly estado: EstadoDeCapacidad;
  /** «H.264», «H.265»… leído de lo que describe el equipo. `null` si no se sabe. */
  readonly codec: string | null;
  /** El canal preguntado (canal×100+flujo). `null` si no se preguntó. */
  readonly canal: string | null;
  /**
   * E2/C1 (15-M) · los canales que el equipo DECLARA (lista de flujos), con su
   * códec cuando lo dice. Opcional: unas capacidades guardadas antes no lo
   * traen, y un equipo que no lista sus canales tampoco. La ficha los ofrece
   * en vez de pedir el número a ciegas.
   */
  readonly canales?: readonly { readonly id: string; readonly codec: string | null }[];
}

/** ¿El navegador puede reproducirlo? Sólo H.264 se da por sí. */
export const videoReproducible = (video: CapacidadDeVideo): boolean | null =>
  video.codec === null ? null : video.codec === 'H.264';

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
  /** F4 (15-L) · por qué `gestionDePersonas` quedó `desconocida`; como `motivo` de la biblioteca. */
  readonly motivoDeGestionDePersonas?: string | null;
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
  /** D2 (15-L) · ¿Entrega video por RTSP, y en qué códec? */
  readonly video: CapacidadDeVideo;
}

/** Nombre de cada capacidad, para nombrarla en un error o en una pantalla. */
export type NombreDeCapacidad = Exclude<
  keyof CapacidadesDeEquipo,
  'origen' | 'motivoDeGestionDePersonas'
>;

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
  video: { estado: 'desconocida', codec: null, canal: null },
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
  video: { estado: 'si', codec: 'H.264', canal: '102' },
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
  const video = compuesta(objeto['video']);
  // E2/C1 · los canales declarados: sólo entradas con `id` de texto; lo demás se descarta.
  const canales = (Array.isArray(video['canales']) ? video['canales'] : []).flatMap(
    (c: unknown) => {
      const id = texto(compuesta(c)['id']);
      return id === null ? [] : [{ id, codec: texto(compuesta(c)['codec']) }];
    },
  );
  const origen = objeto['origen'];
  const estadoDeBiblioteca = estado(biblioteca['estado']);
  const personas = estado(objeto['gestionDePersonas']);
  // F4 · el motivo sólo acompaña a `desconocida`: en `si`/`no` no se arrastra.
  const motivo = (e: EstadoDeCapacidad, valor: unknown): string | null =>
    e === 'desconocida' ? texto(valor) : null;
  const motivoDeBiblioteca = motivo(estadoDeBiblioteca, biblioteca['motivo']);
  const motivoDePersonas = motivo(personas, objeto['motivoDeGestionDePersonas']);
  return {
    origen:
      origen === 'descubiertas' || origen === 'declaradas' || origen === 'sin_consultar'
        ? origen
        : 'sin_consultar',
    aperturaRemota: estado(objeto['aperturaRemota']),
    verificacionRemota: estado(objeto['verificacionRemota']),
    bibliotecaDeRostros: {
      estado: estadoDeBiblioteca,
      maximo: numero(biblioteca['maximo']),
      almacenadas: numero(biblioteca['almacenadas']),
      ...(motivoDeBiblioteca === null ? {} : { motivo: motivoDeBiblioteca }),
    },
    gestionDePersonas: personas,
    ...(motivoDePersonas === null ? {} : { motivoDeGestionDePersonas: motivoDePersonas }),
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
    // Unas capacidades guardadas antes de la 15-L no traen video: desconocida.
    video: {
      estado: estado(video['estado']),
      codec: texto(video['codec']),
      canal: texto(video['canal']),
      ...(canales.length === 0 ? {} : { canales }),
    },
  };
};
