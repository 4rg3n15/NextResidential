/// LA DIRECCIÓN DEL SERVIDOR: qué se admite, y cómo se dice que no.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// POR QUÉ LA DIRECCIÓN SE PUEDE CAMBIAR DESDE LA APP
///
/// El cliente lo pidió con estas palabras: «en sitio la app debe funcionar igual
/// que en casa, sin error de conexión con el servidor». La dirección compilada
/// con `--dart-define=API_URL=…` es sólo el VALOR INICIAL: la IP del Mac cambia
/// de una red a otra, y recompilar para cada red no es algo que pueda hacer
/// quien usa la app. Por eso hay dos salidas, y conviven:
///
///   1. Un nombre `.local` (`http://mac-de-argenis.local:3000`), que NO cambia
///      de red a red. Ver «CÓMO SE RESUELVE UN NOMBRE .local» más abajo.
///   2. La opción «Servidor» del acceso y de toda pantalla de error de
///      conexión, que deja escribir otra dirección, la PRUEBA contra `/health`
///      y sólo entonces la guarda.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// QUÉ SE ADMITE, Y POR QUÉ ESA REGLA Y NO OTRA
///
/// | Forma                         | Se admite | Por qué                                                      |
/// | ----------------------------- | --------- | ------------------------------------------------------------ |
/// | `https://` a cualquier nombre | sí        | El canal va cifrado y el certificado dice quién contesta      |
/// | `http://` a 10.x.x.x          | sí        | Red privada: el tráfico no sale del conjunto ni de la casa    |
/// | `http://` a 172.16–31.x.x     | sí        | Ídem                                                         |
/// | `http://` a 192.168.x.x       | sí        | Ídem                                                         |
/// | `http://` a `algo.local`      | sí        | mDNS sólo resuelve en el mismo enlace de red local            |
/// | `http://` a otra IP o nombre  | NO        | Contraseña y token viajarían en claro por internet            |
/// | usuario, ruta, consulta       | NO        | Una dirección de servidor no los lleva; esconderían otra cosa |
///
/// `127.0.0.1` y `localhost` se rechazan con su propio motivo: en un teléfono
/// son el propio teléfono, no el Mac. La dirección COMPILADA no pasa por aquí:
/// la elige quien compila (el recorrido web usa la de bucle local), y es el
/// punto de partida, no una entrada del usuario.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// CÓMO SE RESUELVE UN NOMBRE .local · y qué pasa si la red no deja
///
/// La app habla con la API por Dio, que en iOS y Android usa `dart:io`
/// (`HttpClient` → `Socket.connect` → `InternetAddress.lookup`), y ésta llama a
/// `getaddrinfo` del sistema. En iOS `getaddrinfo` lo atiende `mDNSResponder`,
/// que resuelve los nombres `.local` por DNS multidifusión (mDNS, puerto 5353
/// del grupo de multidifusión del enlace): el Mac anuncia su «nombre local» (Ajustes del Sistema →
/// General → Compartir → Nombre del host local) y el iPhone obtiene la IP que
/// el Mac tenga EN ESA RED, sin configurar nada. Hace falta el permiso de red
/// local de iOS, que el `Info.plist` ya declara; sin él falla la resolución o
/// la conexión, y la app lo nombra (`CausaDeRed.redLocalDenegada`). En Android
/// depende de la versión del sistema: si no resuelve `.local`, cae en el mismo
/// camino de fallo que sigue.
///
/// Si la red BLOQUEA mDNS —Wi-Fi de invitados o corporativa con aislamiento de
/// clientes, routers que no reenvían multidifusión, teléfono y Mac en subredes
/// distintas—, nadie contesta a la consulta y `getaddrinfo` falla con «Failed
/// host lookup» / «nodename nor servname provided». `causaDeRed` lo clasifica
/// como `direccionInvalida`, la pantalla de error dice que el nombre no se
/// encuentra en esta red y ofrece «Cambiar servidor» para escribir la IP.
library;

/// Lo que dice la revisión de una dirección escrita por el usuario.
sealed class DireccionRevisada {
  const DireccionRevisada();
}

/// Admitida y NORMALIZADA: `esquema://anfitrión[:puerto]`, sin barra final.
class DireccionAceptada extends DireccionRevisada {
  const DireccionAceptada(this.url);
  final String url;
}

/// Rechazada, con el motivo en palabras de quien la escribió.
class DireccionRechazada extends DireccionRevisada {
  const DireccionRechazada(this.motivo);
  final String motivo;
}

const _ejemplo = 'http://192.168.1.x:3000 o http://nombre-del-mac.local:3000';

/// La regla entera. Pura: sin red, sin reloj, sin estado.
DireccionRevisada revisarDireccion(String entrada) {
  var texto = entrada.trim();
  while (texto.endsWith('/')) {
    texto = texto.substring(0, texto.length - 1);
  }
  if (texto.isEmpty) return const DireccionRechazada('Escriba la dirección del servidor.');

  final esquema = RegExp(r'^([a-zA-Z][a-zA-Z0-9+.-]*)://').firstMatch(texto)?.group(1);
  if (esquema == null) {
    return const DireccionRechazada(
      'Escriba la dirección completa, empezando por http:// o https:// (por ejemplo, '
      '$_ejemplo).',
    );
  }
  final Uri uri;
  try {
    uri = Uri.parse(texto);
  } on FormatException {
    return const DireccionRechazada('Esa dirección no está bien escrita. Revise el puerto y los puntos.');
  }
  final s = uri.scheme.toLowerCase();
  if (s != 'http' && s != 'https') {
    return const DireccionRechazada('La dirección tiene que empezar por http:// o https://.');
  }
  if (uri.userInfo.isNotEmpty) {
    return const DireccionRechazada('La dirección no puede llevar usuario ni contraseña.');
  }
  if (uri.path.isNotEmpty || uri.hasQuery || uri.hasFragment) {
    return const DireccionRechazada(
      'Escriba solo la dirección del servidor, sin nada después del puerto.',
    );
  }
  final anfitrion = uri.host.toLowerCase();
  if (anfitrion.isEmpty) {
    return const DireccionRechazada('Falta el nombre o la IP del servidor.');
  }
  if (!_anfitrionBienEscrito(anfitrion)) {
    return const DireccionRechazada(
      'El nombre del servidor solo puede llevar letras, números, guiones y puntos.',
    );
  }
  if (uri.hasPort && (uri.port < 1 || uri.port > 65535)) {
    return const DireccionRechazada('El puerto tiene que ser un número entre 1 y 65535.');
  }
  if (s == 'http') {
    final motivo = _motivoContraHttp(anfitrion);
    if (motivo != null) return DireccionRechazada(motivo);
  }
  // `Uri` quita el puerto por omisión (80 · 443) y guarda el anfitrión IPv6 sin
  // corchetes: se recompone a mano para que la dirección guardada sea siempre
  // la misma forma.
  final host = anfitrion.contains(':') ? '[$anfitrion]' : anfitrion;
  final puerto = uri.hasPort ? ':${uri.port}' : '';
  return DireccionAceptada('$s://$host$puerto');
}

final _nombreDns = RegExp(r'^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$');
final _ipv6 = RegExp(r'^[0-9a-f:.]+$');

/// Un nombre DNS (o una IPv4, que tiene su misma forma) o una IPv6. `Uri`
/// admite espacios y otros caracteres codificados en el anfitrión, y una
/// dirección así no la resuelve nadie: mejor decirlo aquí que tras la prueba.
bool _anfitrionBienEscrito(String anfitrion) =>
    anfitrion.contains(':') ? _ipv6.hasMatch(anfitrion) : _nombreDns.hasMatch(anfitrion);

/// `null` si `http://` hacia ese anfitrión es aceptable; si no, por qué no.
String? _motivoContraHttp(String anfitrion) {
  if (anfitrion == 'localhost' || _esBucleLocal(anfitrion)) {
    return 'En el teléfono, esa dirección es el propio teléfono, no el Mac. Escriba la IP del Mac '
        'en esta red o su nombre terminado en .local.';
  }
  if (esIpv4Privada(anfitrion) || esNombreLocal(anfitrion)) return null;
  return 'Con http:// solo se admiten direcciones de la red local (10.x, 172.16 a 172.31, '
      '192.168.x) o nombres terminados en .local. Para cualquier otra dirección use https://.';
}

/// Los cuatro octetos, o `null` si no es una IPv4 escrita de forma canónica.
///
/// Los ceros a la izquierda se rechazan a propósito: `010.0.0.1` es octal para
/// `inet_aton`, y la app acabaría hablando con una máquina distinta de la que
/// el usuario cree haber escrito.
List<int>? _octetos(String anfitrion) {
  final partes = anfitrion.split('.');
  if (partes.length != 4) return null;
  final octetos = <int>[];
  for (final p in partes) {
    if (!RegExp(r'^(0|[1-9][0-9]{0,2})$').hasMatch(p)) return null;
    final n = int.parse(p);
    if (n > 255) return null;
    octetos.add(n);
  }
  return octetos;
}

bool _esBucleLocal(String anfitrion) => _octetos(anfitrion)?.first == 127;

/// Rangos privados de IPv4: 10.x.x.x, 172.16.x.x a 172.31.x.x, 192.168.x.x.
bool esIpv4Privada(String anfitrion) {
  final o = _octetos(anfitrion);
  if (o == null) return false;
  return o[0] == 10 || (o[0] == 172 && o[1] >= 16 && o[1] <= 31) || (o[0] == 192 && o[1] == 168);
}

/// Un nombre de mDNS: una o más etiquetas válidas y el sufijo `.local`.
bool esNombreLocal(String anfitrion) {
  if (!anfitrion.endsWith('.local')) return false;
  final etiquetas = anfitrion.substring(0, anfitrion.length - '.local'.length).split('.');
  final valida = RegExp(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');
  return etiquetas.isNotEmpty && etiquetas.every(valida.hasMatch);
}

// ═════════════════════════════════════════════════════════════════════════════
// LA PRUEBA ANTES DE GUARDAR: `GET <dirección>/health`
// ═════════════════════════════════════════════════════════════════════════════

/// Qué contestó la dirección al pedirle `/health`. Sólo `responde` se admite:
/// una dirección que no se comprueba es una sesión que fallará en la puerta.
enum SaludDelServidor {
  /// 200 con `{"estado":"vivo"}`: es un servidor de Next Control.
  responde,

  /// Contestó, pero no con lo que contesta Next Control: otro servicio en ese
  /// puerto, un portal cautivo, un router.
  noEsNextControl,

  /// El equipo existe y rechaza la conexión: nada escucha en ese puerto.
  rechazaConexion,

  /// Nadie contesta: apagado, otra red, cortafuegos.
  sinRespuesta,

  /// El nombre no se encuentra. Con `.local`, la red no deja pasar mDNS.
  nombreDesconocido,

  /// iOS no deja a la app usar la red local.
  redLocalDenegada,

  /// Contestó, pero tarde: más de lo que se espera de una red local.
  tiempoAgotado,

  /// `https://` con un certificado que no vale para esa dirección.
  certificadoInvalido,
}

/// Quién comprueba una dirección. Es un puerto: la prueba de la pantalla no
/// necesita un servidor, y el adaptador real usa el cliente generado.
abstract interface class ComprobadorDeServidor {
  Future<SaludDelServidor> comprobar(String url);
}

/// El resultado dicho en palabras, con lo que hay que hacer.
String mensajeDeSalud(SaludDelServidor salud) => switch (salud) {
  SaludDelServidor.responde => 'El servidor responde.',
  SaludDelServidor.noEsNextControl =>
    'Esa dirección responde, pero no es un servidor de Next Control. Revise el puerto '
        '(normalmente 3000).',
  SaludDelServidor.rechazaConexion =>
    'El equipo de esa dirección contesta, pero el servidor no está en marcha en ese puerto. '
        'Arránquelo en el Mac o revise el puerto.',
  SaludDelServidor.sinRespuesta =>
    'No hay respuesta en esa dirección: revise que el Mac esté encendido y en la misma red.',
  SaludDelServidor.nombreDesconocido =>
    'Ese nombre no se encuentra en esta red. Si termina en .local, puede que esta red no lo '
        'anuncie: escriba la IP del Mac (algo como http://192.168.1.x:3000).',
  SaludDelServidor.redLocalDenegada =>
    'El teléfono no deja a la app usar la red local. Actívelo en Ajustes → Privacidad y '
        'seguridad → Red local → Next Control, y vuelva a probar.',
  SaludDelServidor.tiempoAgotado =>
    'El servidor tardó demasiado en responder. Revise que el Mac esté encendido y en la misma '
        'red, y vuelva a probar.',
  SaludDelServidor.certificadoInvalido =>
    'La conexión segura falló: el certificado del servidor no vale para esa dirección.',
};
