/**
 * 15-L (Bloque B) · los tipos que el filtro de la consola de eventos ofrece,
 * con su nombre para personas. `acceso` son las decisiones del motor; lo demás,
 * lo que emite un equipo o lo que la plataforma le hizo. El orden es el de la
 * lista desplegable: lo que un portero busca primero, arriba.
 */
export const TIPOS_DE_LA_LINEA: readonly { readonly valor: string; readonly nombre: string }[] = [
  { valor: 'acceso', nombre: 'Accesos (placa, rostro, a mano)' },
  { valor: 'apertura_ordenada', nombre: 'Aperturas ordenadas por la plataforma' },
  { valor: 'negacion_ordenada', nombre: 'Accesos negados a mano' },
  { valor: 'puerta_abierta', nombre: 'Puerta abierta' },
  { valor: 'puerta_cerrada', nombre: 'Puerta cerrada' },
  { valor: 'puerta_forzada', nombre: 'Puerta forzada' },
  { valor: 'puerta_abierta_demasiado_tiempo', nombre: 'Puerta abierta demasiado tiempo' },
  { valor: 'boton_de_salida', nombre: 'Botón de salida' },
  { valor: 'timbre', nombre: 'Timbre' },
  { valor: 'llamada', nombre: 'Llamadas' },
  { valor: 'rostro_no_reconocido', nombre: 'Rostro no reconocido' },
  { valor: 'tarjeta_valida', nombre: 'Tarjeta válida' },
  { valor: 'tarjeta_rechazada', nombre: 'Tarjeta rechazada' },
  { valor: 'sabotaje', nombre: 'Sabotaje' },
  { valor: 'equipo_en_linea', nombre: 'Equipo en línea' },
  { valor: 'equipo_fuera_de_linea', nombre: 'Equipo fuera de línea' },
  { valor: 'apertura_remota', nombre: 'Apertura remota (según el equipo)' },
  { valor: 'resultado_de_verificacion', nombre: 'Verificación remota' },
  { valor: 'la_camara_decidio', nombre: 'La cámara decidió por su cuenta' },
  { valor: 'lectura_de_placa', nombre: 'Detección de vehículo sin acceso' },
  { valor: 'desconocido', nombre: 'Sin catalogar' },
];

/** Quién produjo la fila, dicho para personas. */
export const ORIGEN: Readonly<Record<'acceso' | 'equipo' | 'plataforma', string>> = {
  acceso: 'Motor de reglas',
  equipo: 'Equipo',
  plataforma: 'Plataforma',
};
