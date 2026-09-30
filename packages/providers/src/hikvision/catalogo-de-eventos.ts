/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL CATÁLOGO DE LO QUE UN EQUIPO EMITE · ETAPA 15-L (Bloque B)
 *
 * El evento de control de acceso de la serie trae `majorEventType` y
 * `subEventType`: el primero dice la familia (1 alarma · 2 excepción ·
 * 3 operación · 5 evento), el segundo qué pasó. Los números salen de la tabla
 * «Access Control Event Types» de la guía de la serie; los subtipos vuelven a
 * empezar en cada familia, así que el par manda, nunca el subtipo solo.
 *
 * Aquí se traducen a un TIPO NORMALIZADO y a un título en español. No es la
 * tabla entera —cientos de códigos de cerraduras inteligentes, discos, iris—
 * sino los que una copropiedad ve pasar. Un código que no está aquí NO se
 * pierde: se guarda como `desconocido` con sus dos números, «Evento del
 * equipo (código 5/0x4d)», y quien lo vea en la consola puede buscarlo en la
 * guía. Añadirlo después es una línea en este fichero.
 *
 * DOCUMENTADO, NO VERIFICADO en estos modelos: la tabla es de la serie, no de
 * una captura de sitio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const TIPOS_DE_EVENTO_DE_EQUIPO = [
  'rostro_reconocido',
  'rostro_no_reconocido',
  'rostro_capturado_para_verificacion',
  'tarjeta_valida',
  'tarjeta_rechazada',
  // R2 (15-N) · la negación que decide el propio equipo, con su motivo.
  'acceso_negado_por_el_equipo',
  'lista_negra',
  'timbre',
  'llamada',
  'llamada_cancelada',
  'llamada_contestada',
  'llamada_rechazada',
  'llamada_sin_respuesta',
  'llamada_colgada',
  'llamada_en_curso',
  'puerta_desbloqueada',
  'puerta_bloqueada',
  'puerta_abierta',
  'puerta_cerrada',
  'puerta_forzada',
  'puerta_abierta_demasiado_tiempo',
  'boton_de_salida',
  'boton_de_salida_soltado',
  'apertura_remota',
  'cierre_remoto',
  'abierta_permanente',
  'cerrada_permanente',
  'sabotaje',
  'sabotaje_restablecido',
  'coaccion',
  'equipo_en_linea',
  'equipo_fuera_de_linea',
  'resultado_de_verificacion',
  'lectura_de_placa',
  // Lo que hace o sabe la PLATAFORMA, no el equipo (A1, A4).
  'apertura_ordenada',
  'negacion_ordenada',
  'la_camara_decidio',
  'desconocido',
] as const;
export type TipoDeEventoDeEquipo = (typeof TIPOS_DE_EVENTO_DE_EQUIPO)[number];

/**
 * R2 (15-N) · el motivo del DOMINIO con que el equipo negó, cuando lo dice.
 * Es un subconjunto literal de `MotivoAcceso` (`@ncr/domain-core`): aquí no se
 * importa el dominio, y el tipo lo comprueba quien lo consume.
 */
export type MotivoDelEquipo = 'VIGENCIA_EXPIRADA' | 'FUERA_DE_HORARIO' | 'ZONA_NO_AUTORIZADA';

interface Entrada {
  readonly tipo: TipoDeEventoDeEquipo;
  readonly titulo: string;
  readonly motivo?: MotivoDelEquipo;
}

const e = (tipo: TipoDeEventoDeEquipo, titulo: string, motivo?: MotivoDelEquipo): Entrada =>
  motivo === undefined ? { tipo, titulo } : { tipo, titulo, motivo };

/** `mayor/menor` → tipo y título. El menor en decimal, como llega en el JSON. */
const POR_CODIGO: Readonly<Record<string, Entrada>> = {
  // 5 · eventos de control de acceso
  '5/1': e('tarjeta_valida', 'Tarjeta válida'),
  /**
   * R2 (15-N) · 0x06 «No Permission», 0x07 «Invalid Card Swiping Time
   * Period», 0x08 «Expired Card» (Access_Control_Event_Types…, Other Events
   * 0x5). La serie los usa para la PERSONA —rostro o tarjeta—: el 29/09 el
   * videoportero reconoció la cara y negó por «permiso vencido». Se dicen con
   * el motivo del dominio, nunca como «fallo técnico».
   */
  '5/6': e(
    'acceso_negado_por_el_equipo',
    'El equipo negó el acceso: sin permiso en esta puerta',
    'ZONA_NO_AUTORIZADA',
  ),
  '5/7': e(
    'acceso_negado_por_el_equipo',
    'El equipo negó el acceso: fuera de su periodo',
    'FUERA_DE_HORARIO',
  ),
  '5/8': e(
    'acceso_negado_por_el_equipo',
    'El equipo negó el acceso: permiso vencido',
    'VIGENCIA_EXPIRADA',
  ),
  '5/9': e('tarjeta_rechazada', 'Tarjeta no registrada'),
  '5/21': e('puerta_desbloqueada', 'Cerradura liberada'),
  '5/22': e('puerta_bloqueada', 'Cerradura asegurada'),
  '5/23': e('boton_de_salida', 'Botón de salida pulsado'),
  '5/24': e('boton_de_salida_soltado', 'Botón de salida soltado'),
  '5/25': e('puerta_abierta', 'Puerta abierta'),
  '5/26': e('puerta_cerrada', 'Puerta cerrada'),
  '5/27': e('puerta_forzada', 'Puerta forzada'),
  '5/28': e('puerta_abierta_demasiado_tiempo', 'Puerta abierta demasiado tiempo'),
  '5/37': e('timbre', 'Timbre'),
  // G3 (15-N) · 0x33 «Call Center» (Other Events 0x5): la llamada a la central.
  '5/51': e('llamada', 'Llamada a la central'),
  '5/75': e('rostro_reconocido', 'Rostro reconocido'),
  '5/76': e('rostro_no_reconocido', 'Rostro no reconocido'),
  '5/77': e('rostro_reconocido', 'Rostro reconocido (con código de persona)'),
  '5/78': e('rostro_no_reconocido', 'Rostro no reconocido (con código de persona)'),
  '5/79': e('rostro_no_reconocido', 'Rostro: tiempo agotado'),
  '5/80': e('rostro_no_reconocido', 'Rostro no reconocido'),
  '5/113': e('lista_negra', 'Persona en lista negra del equipo'),
  // R2 (15-N) · 0x76 «Authentication Failed: Authentication Schedule in Sleeping Mode».
  '5/118': e(
    'acceso_negado_por_el_equipo',
    'El equipo negó el acceso: fuera de su horario de autenticación',
    'FUERA_DE_HORARIO',
  ),
  '5/135': e('puerta_forzada', 'Paso forzado'),
  '5/146': e('rostro_capturado_para_verificacion', 'Rostro capturado para verificación'),
  // 3 · operaciones
  '3/1024': e('apertura_remota', 'Puerta abierta en remoto'),
  '3/1025': e('cierre_remoto', 'Puerta cerrada en remoto'),
  '3/1026': e('abierta_permanente', 'Puerta abierta permanente (remoto)'),
  '3/1027': e('cerrada_permanente', 'Puerta cerrada permanente (remoto)'),
  // 1 · alarmas
  '1/5': e('sabotaje', 'Sabotaje del equipo'),
  '1/6': e('sabotaje_restablecido', 'Sabotaje del equipo: restablecido'),
  '1/1030': e('sabotaje', 'Sabotaje del lector'),
  '1/1031': e('sabotaje_restablecido', 'Sabotaje del lector: restablecido'),
  '1/1034': e('coaccion', 'Alarma de coacción'),
  // 2 · excepciones
  '2/39': e('equipo_fuera_de_linea', 'Red desconectada'),
  '2/1031': e('equipo_en_linea', 'Red restablecida'),
  '2/1062': e('equipo_en_linea', 'Terminal en línea'),
  '2/1063': e('equipo_fuera_de_linea', 'Terminal fuera de línea'),
};

/** `cmdType` de la llamada del videoportero (`VoiceTalkEvent`). */
const POR_ORDEN_DE_LLAMADA: Readonly<Record<string, Entrada>> = {
  request: e('llamada', 'Llamada entrante'),
  cancel: e('llamada_cancelada', 'Llamada cancelada por quien llamaba'),
  answer: e('llamada_contestada', 'Llamada contestada'),
  reject: e('llamada_rechazada', 'Llamada rechazada'),
  belltimeout: e('llamada_sin_respuesta', 'Llamada sin respuesta'),
  hangup: e('llamada_colgada', 'Llamada terminada'),
  deviceoncall: e('llamada_en_curso', 'El equipo ya está en una llamada'),
};

const hexadecimal = (n: number): string => `0x${n.toString(16)}`;

/** Lo que el catálogo dice de un par de códigos, o `desconocido` con sus números. */
export const eventoPorCodigo = (mayor: number, menor: number): Entrada =>
  POR_CODIGO[`${String(mayor)}/${String(menor)}`] ??
  e('desconocido', `Evento del equipo (código ${String(mayor)}/${hexadecimal(menor)})`);

export const eventoDeLlamada = (orden: string | null | undefined): Entrada => {
  if (orden === null || orden === undefined || orden.trim() === '') {
    return e('llamada', 'Llamada entrante');
  }
  return (
    POR_ORDEN_DE_LLAMADA[orden.trim().toLowerCase()] ??
    e('desconocido', `Llamada del equipo (orden «${orden.trim().slice(0, 30)}»)`)
  );
};

/** R2 (15-N) · el motivo del dominio con que el equipo negó, si el código lo dice. */
export const motivoDelEquipo = (
  mayor: number | null,
  menor: number | null,
): MotivoDelEquipo | null =>
  mayor === null || menor === null
    ? null
    : (POR_CODIGO[`${String(mayor)}/${String(menor)}`]?.motivo ?? null);

/** Un código que el catálogo reconoce como un ROSTRO que pide decisión. */
export const esCodigoDeRostro = (mayor: number, menor: number): boolean => {
  const tipo = POR_CODIGO[`${String(mayor)}/${String(menor)}`]?.tipo;
  return tipo === 'rostro_reconocido' || tipo === 'rostro_capturado_para_verificacion';
};
