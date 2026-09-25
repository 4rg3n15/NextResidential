/// Configuración de compilación, y la regla que no se negocia.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// NINGÚN SECRETO EN EL BINARIO
///
/// `docs/guias/CONEXION_SUPABASE.md` lo dice y conviene repetirlo aquí, donde
/// se comete el error: **todo lo compilado en Flutter es extraíble del
/// binario.** Un `.apk` es un zip; `strings` sobre la librería nativa saca
/// cualquier literal en segundos. No hay ofuscación que lo arregle: ofuscar
/// renombra símbolos, no esconde datos.
///
/// De ahí lo que entra y lo que no:
///
/// | Entra                        | Por qué                                                                 |
/// | ---------------------------- | ----------------------------------------------------------------------- |
/// | `API_URL`                    | Es una dirección pública; el servidor exige token en toda ruta          |
/// | `SUPABASE_URL`               | Pública por definición                                                  |
/// | `SUPABASE_PUBLISHABLE_KEY`   | **Publicable**: resuelve al rol `anon` y está sujeta a RLS              |
///
/// | NO entra                     | Qué pasaría                                                              |
/// | ---------------------------- | ------------------------------------------------------------------------ |
/// | `SUPABASE_SECRET_KEY`        | Omite la RLS por completo. En un binario distribuido es el proyecto entero |
/// | `INGESTA_FIRMA_SECRETO`      | Permitiría fabricar eventos de acceso                                    |
/// | `BIOMETRIA_LLAVE`            | Descifra plantillas biométricas (Ley 1581)                               |
///
/// La comprobación no es este comentario: es `flutter_sin_secretos` en
/// `scripts/lib/`, que falla la verificación de etapa si un nombre de variable
/// de la lista prohibida aparece en el código de la app, y `aserciones()` de
/// abajo, que impide arrancar si el valor recibido tiene forma de llave
/// secreta. Dos capas, porque la primera se puede rodear con una interpolación.
library;

/// Valores inyectados con `--dart-define`. Nunca leídos de un `.env` empacado:
/// un fichero de activos viaja dentro del `.apk` y se lee con un descompresor.
class Ambiente {
  const Ambiente({
    required this.apiUrl,
    required this.supabaseUrl,
    required this.supabaseClavePublicable,
  });

  factory Ambiente.deCompilacion() => const Ambiente(
        // Sin `localhost` por omisión, a propósito. En un teléfono físico
        // `localhost` es el propio teléfono: la app arrancaba, pedía y fallaba
        // con «sin conexión» sin decir que nadie le había dicho dónde está la
        // API. Vacío cae en `aserciones()` y se explica en pantalla ANTES de
        // la primera petición, que es donde se puede corregir.
        apiUrl: String.fromEnvironment('API_URL', defaultValue: ''),
        supabaseUrl: String.fromEnvironment('SUPABASE_URL'),
        supabaseClavePublicable: String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY'),
      );

  final String apiUrl;
  final String supabaseUrl;
  final String supabaseClavePublicable;

  /// Prefijos de llave que jamás deben llegar aquí. Son los del esquema nuevo
  /// de Supabase (`sb_secret_…`) y el heredado (`service_role` en un JWT).
  static const prefijosProhibidos = ['sb_secret_', 'eyJ'];

  /// Se ejecuta al arrancar. Falla ruidosamente, como el arranque de la API con
  /// una variable ausente (§2.7.1): una app que arranca con una llave secreta
  /// dentro es peor que una que no arranca.
  List<String> aserciones() {
    final problemas = <String>[];
    for (final prefijo in prefijosProhibidos) {
      if (supabaseClavePublicable.startsWith(prefijo)) {
        problemas.add(
          'SUPABASE_PUBLISHABLE_KEY empieza por «$prefijo»: eso no es una llave '
          'publicable. Una llave secreta compilada en el binario es extraíble y '
          'omite la RLS.',
        );
      }
    }
    if (apiUrl.isEmpty) {
      // El texto lleva el remedio, no sólo el diagnóstico: quien lo ve es quien
      // compiló, y lo que necesita es la línea que le faltó. En un iPhone
      // físico la IP es la del Mac, no `localhost`; en el emulador Android es
      // el alias de la máquina anfitriona que documenta `.env.example`.
      problemas.add(
        'Falta API_URL: la app no sabe a quién preguntar. Compile con '
        '--dart-define=API_URL=http://<IP-del-Mac>:3000 (en el emulador Android, '
        'el alias de la máquina anfitriona; ver apps/mobile/.env.example).',
      );
    }
    return problemas;
  }

  /// `true` cuando falta configuración de Supabase. La app lo dice en pantalla
  /// en vez de fallar en la primera petición con un error de red opaco.
  bool get faltaSupabase => supabaseUrl.isEmpty || supabaseClavePublicable.isEmpty;
}
