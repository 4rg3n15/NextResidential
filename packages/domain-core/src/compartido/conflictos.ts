/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CÓDIGOS DE CONFLICTO · RONDA 15-Z2 · DT-15W-01 · DT-15X-09
 *
 * Todo 409 de negocio de la API lleva un `codigo` de esta lista además de su
 * texto. La consola y la app DECIDEN por el código —qué refrescar, bajo qué
 * campo pintar el rechazo, si releer una política— y muestran el texto; antes
 * sólo podían mostrarlo, y «Ese usuario no está disponible» no se distinguía
 * de «Esta vivienda ya tiene titular» sin comparar cadenas.
 *
 * Vive en el dominio por lo mismo que `MOTIVOS_ACCESO`: es vocabulario de
 * negocio, se documenta en OpenAPI desde aquí y el cliente Dart lo recibe
 * tipado. Un código nuevo es una entrada más; ninguno se reutiliza con otro
 * significado.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const CODIGOS_DE_CONFLICTO = [
  // Cuentas y hogar (15-W)
  'VIVIENDA_CON_TITULAR',
  'CUENTA_CON_VIVIENDA',
  'USUARIO_NO_DISPONIBLE',
  'USUARIO_DUPLICADO',
  'PROVEEDOR_DE_IDENTIDAD',
  'REGISTRO_NO_SUSPENDIDO',
  'TOPE_DE_PLAZAS',
  'TOPE_BAJO_LAS_PLAZAS',
  'PLAZAS_MAXIMAS',
  'PLAZA_OCUPADA',
  'PLAZA_DEL_TITULAR',
  'DOCUMENTO_EN_USO',
  'TRASPASO_SOLO_MAYOR',
  'PLACA_CON_HISTORIAL',
  'VEHICULO',
  'VISITA_NO_REVOCABLE',
  'SUSCRIPCION_WEB_PUSH',
  // El rostro (15-X)
  'POLITICA_CAMBIADA',
  'OTRO_REGISTRO_GANO',
  'ROSTRO',
  // Padrón, autorizaciones, zonas, visitas, alertas, equipos
  'PADRON',
  'AUTORIZACION',
  'OPERACION_NO_PERMITIDA',
  'LISTA_NEGRA',
  'ZONA',
  'VISITA',
  'ALERTA_YA_ATENDIDA',
  'CONFIGURACION_EN_SITIO',
  // Portería
  'TURNO_TERMINADO',
  'PORTERO_DUPLICADO',
  'CUPO_DE_PORTEROS',
  'NUMEROS_DE_PORTERO_AGOTADOS',
  // Guardia virtual
  'SIN_ORIGEN_DE_VIDEO',
  'AUDIO_POR_HTTP',
  'SIN_LA_PALABRA',
  'TRANSPORTE_DE_AUDIO_NO_DISPONIBLE',
  'SIN_TRANSPORTE_DE_AUDIO',
  // Edge
  'OTRO_EDGE_PUENTE',
  'CACHE_DEL_EDGE_ADELANTADA',
] as const;

export type CodigoDeConflicto = (typeof CODIGOS_DE_CONFLICTO)[number];

export const esCodigoDeConflicto = (valor: unknown): valor is CodigoDeConflicto =>
  typeof valor === 'string' && (CODIGOS_DE_CONFLICTO as readonly string[]).includes(valor);
