/// E2 (ETAPA 15-L) · POR QUÉ LA APP NO LLEGA AL SERVIDOR, DICHO CON NOMBRE.
///
/// En sitio, el 26/09/2026, un iPhone decía «No hay conexión con el servidor»
/// mientras Safari, en el mismo teléfono, abría la API. Esa frase servía igual
/// para cinco causas con cinco remedios distintos. Aquí se separan, con lo que
/// el teléfono sabe: por qué red sale (Wi-Fi, datos móviles, ninguna) y qué
/// contestó el sistema al abrir el socket.
///
/// La comprobación que decide quién tiene la culpa es la del usuario: abrir
/// `<API_URL>/health` en Safari. Si Safari tampoco llega, el problema es la red,
/// el cortafuegos del Mac o los datos móviles, no la app. Por eso cada mensaje
/// la nombra con la dirección exacta.
///
/// `[SUPUESTO]` S-71: iOS no da un código propio para «permiso de red local
/// denegado»; en la práctica el socket falla en el acto con «No route to host»
/// (EHOSTUNREACH) u «Operation not permitted» (EPERM) estando en Wi-Fi. Se
/// confirma en sitio con el iPhone (Ajustes → Privacidad y seguridad → Red
/// local).
library;

enum TipoDeRed { wifi, datosMoviles, ninguna, otra, desconocida }

enum CausaDeRed {
  datosMoviles,
  sinRed,
  redLocalDenegada,
  macNoContesta,
  servidorApagado,
  direccionInvalida,
  desconocida,
}

/// Errno de «no hay ruta» y «operación no permitida», en iOS/macOS y Linux.
final _denegada = RegExp(
  r'No route to host|Operation not permitted|errno = (65|113|1)\b',
  caseSensitive: false,
);
final _rechazada = RegExp(
  r'Connection refused|errno = (61|111)\b',
  caseSensitive: false,
);
final _sinRuta = RegExp(
  r'Network is unreachable|errno = (51|101)\b',
  caseSensitive: false,
);
final _sinNombre = RegExp(
  r'Failed host lookup|nodename nor servname',
  caseSensitive: false,
);

/// Qué pasó, a partir de la red del teléfono y del error del transporte.
CausaDeRed causaDeRed({
  required TipoDeRed red,
  required String? error,
  required bool agotoElTiempo,
}) {
  if (red == TipoDeRed.datosMoviles) return CausaDeRed.datosMoviles;
  if (red == TipoDeRed.ninguna) return CausaDeRed.sinRed;
  final texto = error ?? '';
  if (_sinNombre.hasMatch(texto)) return CausaDeRed.direccionInvalida;
  if (_rechazada.hasMatch(texto)) return CausaDeRed.servidorApagado;
  if (_sinRuta.hasMatch(texto)) return CausaDeRed.sinRed;
  if (_denegada.hasMatch(texto)) return CausaDeRed.redLocalDenegada;
  if (agotoElTiempo) return CausaDeRed.macNoContesta;
  return CausaDeRed.desconocida;
}

/// La frase que ve el residente: la causa y qué hacer, con la dirección exacta.
String mensajeDeCausa(CausaDeRed causa, String urlDeLaApi) {
  final url = urlDeLaApi.isEmpty ? '(sin API_URL)' : urlDeLaApi;
  final salud = '$url/health';
  return switch (causa) {
    CausaDeRed.datosMoviles =>
      'El iPhone está usando datos móviles y el servidor está en la red del Mac. '
          'Conéctelo a la misma Wi-Fi que el Mac y vuelva a intentarlo.',
    CausaDeRed.sinRed =>
      'El iPhone no tiene red hasta el Mac. Conéctelo a la misma Wi-Fi que el Mac y '
          'vuelva a intentarlo.',
    CausaDeRed.redLocalDenegada =>
      'iOS no deja a la app usar la red local. Si Safari sí abre $salud, es eso: vaya a '
          'Ajustes → Privacidad y seguridad → Red local, active Next Control y vuelva a '
          'intentarlo.',
    CausaDeRed.macNoContesta =>
      'El Mac no contesta en $url. Abra $salud en Safari: si tampoco abre, el cortafuegos '
          'del Mac está bloqueando a node (Ajustes del Sistema → Red → Cortafuegos → '
          'permitir conexiones entrantes de node) o el Mac cambió de dirección.',
    CausaDeRed.servidorApagado =>
      'El Mac contesta, pero el servidor no está en marcha en $url. Arránquelo en el Mac '
          'y compruebe $salud en Safari.',
    CausaDeRed.direccionInvalida =>
      'La dirección con que se instaló la app ($url) no existe en esta red. Vuelva a '
          'instalarla con --dart-define=API_URL=http://<IP-del-Mac>:3000.',
    CausaDeRed.desconocida =>
      'No se pudo llegar al servidor en $url. Abra $salud en Safari: si abre, avise a '
          'soporte con el detalle técnico; si no, el problema es la red o el Mac.',
  };
}
