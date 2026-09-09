import type { MotivoAcceso } from '@ncr/contracts';

/**
 * Texto en español de los **diez** motivos de denegación del dominio.
 *
 * El tipo viene del contrato generado, no de una lista escrita aquí. Eso hace
 * que el registro sea **exhaustivo por construcción**: si el dominio añade un
 * motivo —como ocurrió con `FUERA_DE_HORARIO`, que se sumó en la ETAPA 01-B—,
 * este objeto deja de compilar hasta que alguien le dé un texto. La alternativa
 * —un `switch` con `default`— habría dejado el motivo nuevo mostrándose como
 * «otro» sin que nadie se enterara.
 *
 * **No se colapsan.** El mockup mezclaba dos en una sola línea («Sin Registro /
 * Lista Negra»); en el dominio son excluyentes y con precedencia definida
 * (`listaNegra > vigencia > patrón > zona`), y la consola muestra el que
 * determinó la decisión. Dos motivos en una línea impiden saber cuál fue.
 */
export const TEXTO_MOTIVO: Readonly<Record<MotivoAcceso, string>> = {
  VIGENCIA_EXPIRADA: 'Autorización fuera de vigencia',
  AFORO_SUPERADO: 'Aforo de la zona completo',
  LISTA_NEGRA: 'Persona o placa en lista negra',
  ZONA_NO_AUTORIZADA: 'Sin permiso sobre esa zona',
  FUERA_DE_PATRON: 'Fuera del patrón de recurrencia',
  FUERA_DE_HORARIO: 'Fuera del horario de la zona',
  SIN_CONSENTIMIENTO: 'Sin consentimiento biométrico vigente',
  PLACA_DESCONOCIDA: 'Placa no registrada',
  CONFIANZA_INSUFICIENTE: 'Lectura con confianza insuficiente',
  FALLO_TECNICO: 'Fallo técnico del dispositivo',
};

/**
 * Explicación larga, para el detalle del evento. Separada del texto corto
 * porque una fila de tabla y una ficha necesitan longitudes distintas, y meter
 * las dos en la misma cadena obliga a recortar en la vista.
 */
export const DETALLE_MOTIVO: Readonly<Record<MotivoAcceso, string>> = {
  VIGENCIA_EXPIRADA:
    'La autorización existe, pero el intento ocurrió fuera de su ventana de vigencia.',
  AFORO_SUPERADO: 'La zona alcanzó su aforo máximo; el ingreso se deniega aunque haya permiso.',
  LISTA_NEGRA: 'La lista negra tiene precedencia absoluta sobre cualquier autorización vigente.',
  ZONA_NO_AUTORIZADA: 'La autorización no incluye esta zona entre las permitidas.',
  FUERA_DE_PATRON: 'El intento cae fuera de los días u horas del patrón de recurrencia.',
  FUERA_DE_HORARIO: 'La zona estaba cerrada según su horario configurado.',
  SIN_CONSENTIMIENTO:
    'No hay consentimiento biométrico vigente del titular; la plantilla no se sincroniza.',
  PLACA_DESCONOCIDA:
    'La placa leída no corresponde a ningún vehículo activo ni autorización vigente.',
  CONFIANZA_INSUFICIENTE:
    'La lectura no alcanzó el umbral de confianza; no se decide automáticamente.',
  FALLO_TECNICO:
    'El dispositivo o el canal fallaron; el intento queda registrado como no resuelto.',
};

export const textoDeMotivo = (motivo: MotivoAcceso | null): string =>
  motivo === null ? 'Acceso permitido' : TEXTO_MOTIVO[motivo];
