/// F4 · la casilla de la foto: la ÚNICA constancia de que el visitante
/// autorizó el uso de su foto (decisión final del cliente para la visita de
/// sitio, corrección de la 15-L).
///
/// La firma el residente en primera persona y sobre una persona con nombre:
/// «Declaro que Ana Ruiz me autorizó…» compromete a quien la marca; «el
/// visitante autorizó…» no comprometía a nadie en concreto.
library;

/// El texto EXACTO de la casilla, con el nombre del visitante dentro.
///
/// El nombre sale en vivo del campo del formulario —sin los espacios de los
/// bordes— y, mientras está vacío, la frase dice «el visitante» para no quedar
/// con un hueco.
///
/// Es una función pura y vive en el dominio para que las dos pantallas que la
/// muestran («Nuevo visitante» y «Volver a autorizar») no la reescriban: la
/// casilla no puede decir dos cosas. El texto NO viaja: la app sólo envía que
/// la casilla se marcó, y la versión del texto que queda en la constancia la
/// fija el servidor.
///
/// Es la misma frase, con la misma regla para el nombre, que la plantilla que
/// publica la API (`apps/api/src/visitas/aplicacion/rostro-de-visita.ts`) y
/// que la consola sustituye. [SUPUESTO] S-99 · La app la lleva escrita en vez de
/// pedírsela al servidor: si el cliente cambia la frase, cambia también aquí
/// (y la prueba del dominio lo exige palabra por palabra).
String textoDeLaCasilla(String nombreDelVisitante) {
  final nombre = nombreDelVisitante.trim();
  return 'Declaro que ${nombre.isEmpty ? 'el visitante' : nombre} me autorizó a usar su foto '
      'para su ingreso al conjunto';
}
