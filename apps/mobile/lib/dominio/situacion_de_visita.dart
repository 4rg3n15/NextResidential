/// En qué situación está una visita, SEGÚN EL SERVIDOR.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ LA APP YA NO LA CALCULA
///
/// La tarjeta decía «vigente» con una cuenta hecha en el teléfono —`activa` y
/// la hora dentro de `[desde, hasta)`— y la consola decía otra cosa con la
/// suya. Dos versiones de una regla son una regla y una mentira: el reloj del
/// teléfono se desvía, y una visita rechazada en portería seguía «vigente» en
/// el bolsillo del residente hasta que el estado local se enteraba. Ahora la
/// API la deriva con SU reloj y la app la enseña tal cual, igual que la
/// consola.
library;

enum SituacionDeVisita {
  /// Puede entrar ahora.
  vigente,

  /// Autorizada para más adelante.
  programada,

  /// Ya pasó su hora.
  vencida,

  /// Portería o la administración la anuló, con un motivo.
  rechazada,

  /// El servidor mandó una situación que esta versión de la app no conoce. No
  /// se adivina: se dice que no se sabe.
  desconocida,
}
