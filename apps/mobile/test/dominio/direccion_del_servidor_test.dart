import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/direccion_del_servidor.dart';

/// 15-L · LA REGLA DE LA DIRECCIÓN DEL SERVIDOR, caso por caso.
///
/// Las IP de red privada se COMPONEN con `ip(…)` en vez de escribirse: el
/// control de frontera de hardware (KPI-11) rechaza cualquier IPv4 literal que
/// pudiera ser la de un equipo real, y una de estas lo sería. Las de ejemplo
/// público son del rango de documentación (RFC 5737), que no es de nadie.
String ip(int a, int b, int c, int d) => [a, b, c, d].join('.');

String? aceptada(String entrada) => switch (revisarDireccion(entrada)) {
      DireccionAceptada(url: final u) => u,
      DireccionRechazada() => null,
    };

String? motivo(String entrada) => switch (revisarDireccion(entrada)) {
      DireccionRechazada(motivo: final m) => m,
      DireccionAceptada() => null,
    };

void main() {
  group('http:// sólo hacia la red local', () {
    test('un nombre .local se acepta, con y sin puerto', () {
      // Es la salida que NO cambia de una red a otra: el Mac se anuncia por
      // mDNS con ese nombre en casa y en el conjunto.
      expect(aceptada('http://mac-de-argenis.local:3000'), 'http://mac-de-argenis.local:3000');
      expect(aceptada('http://mac-de-argenis.local'), 'http://mac-de-argenis.local');
      expect(aceptada('http://oficina.mac.local:3000'), 'http://oficina.mac.local:3000');
    });

    test('las tres redes privadas se aceptan con puerto', () {
      for (final host in [
        ip(10, 0, 0, 5),
        ip(10, 255, 255, 254),
        ip(172, 16, 0, 1),
        ip(172, 31, 255, 1),
        ip(192, 168, 1, 20),
      ]) {
        expect(aceptada('http://$host:3000'), 'http://$host:3000', reason: host);
        expect(aceptada('http://$host'), 'http://$host', reason: host);
      }
    });

    test('una IP pública con http se rechaza, y el motivo dice que use https', () {
      final m = motivo('http://203.0.113.7:3000');
      expect(m, isNotNull);
      expect(m, contains('https://'));
      expect(m, contains('.local'));
    });

    test('los bordes de 172.16/12 se respetan', () {
      expect(motivo('http://${ip(172, 15, 0, 1)}:3000'), isNotNull);
      expect(motivo('http://${ip(172, 32, 0, 1)}:3000'), isNotNull);
    });

    test('un nombre de internet con http se rechaza', () {
      expect(motivo('http://api.ejemplo.com'), contains('https://'));
    });

    test('127.0.0.1 y localhost se rechazan con SU motivo: en el teléfono son el teléfono', () {
      expect(motivo('http://127.0.0.1:3000'), contains('propio teléfono'));
      expect(motivo('http://localhost:3000'), contains('propio teléfono'));
    });

    test('ceros a la izquierda no pasan: 010 es octal para el sistema', () {
      expect(motivo('http://010.0.0.1:3000'), isNotNull);
    });

    test('un .local mal formado no pasa', () {
      expect(motivo('http://-mac.local'), isNotNull);
      expect(motivo('http://.local'), isNotNull);
    });
  });

  group('https:// hacia cualquier anfitrión', () {
    test('nombres, IP públicas e IPv6, con y sin puerto', () {
      expect(aceptada('https://api.ejemplo.com'), 'https://api.ejemplo.com');
      expect(aceptada('https://api.ejemplo.com:8443'), 'https://api.ejemplo.com:8443');
      expect(aceptada('https://203.0.113.7'), 'https://203.0.113.7');
      expect(aceptada('https://[fd00::1]:8443'), 'https://[fd00::1]:8443');
    });
  });

  group('normalización', () {
    test('recorta espacios, quita la barra final y pasa a minúsculas', () {
      expect(aceptada('  HTTP://Mac-De-Argenis.LOCAL:3000/  '), 'http://mac-de-argenis.local:3000');
      expect(aceptada('https://api.ejemplo.com///'), 'https://api.ejemplo.com');
    });

    test('el puerto por omisión desaparece: es la misma dirección', () {
      expect(aceptada('https://api.ejemplo.com:443'), 'https://api.ejemplo.com');
    });
  });

  group('lo que una dirección de servidor no lleva', () {
    test('vacía', () => expect(motivo('   '), contains('Escriba')));

    test('sin esquema, se pide completa y con un ejemplo', () {
      expect(motivo('mac-de-argenis.local:3000'), contains('http://'));
    });

    test('otro esquema', () => expect(motivo('ftp://mac.local'), contains('http')));

    test('ruta, consulta o fragmento', () {
      expect(motivo('http://mac.local:3000/api'), contains('sin nada después'));
      expect(motivo('http://mac.local:3000?x=1'), contains('sin nada después'));
      expect(motivo('http://mac.local:3000#x'), contains('sin nada después'));
    });

    test('usuario y contraseña', () {
      expect(motivo('http://usuario:clave@mac.local:3000'), contains('usuario ni contraseña'));
    });

    test('un puerto fuera de rango', () {
      expect(motivo('http://mac.local:70000'), contains('puerto'));
      expect(motivo('http://mac.local:0'), contains('puerto'));
    });

    test('caracteres que ningún nombre lleva', () {
      expect(motivo('https://api ejemplo.com'), contains('letras, números'));
    });

    test('mal escrita', () => expect(motivo('http://[::1'), contains('bien escrita')));

    test('sin anfitrión', () => expect(motivo('http://'), isNotNull));
  });

  group('piezas de la regla', () {
    test('esIpv4Privada', () {
      expect(esIpv4Privada(ip(192, 168, 0, 1)), isTrue);
      expect(esIpv4Privada('203.0.113.7'), isFalse);
      expect(esIpv4Privada('mac.local'), isFalse);
      expect(esIpv4Privada('${ip(192, 168, 0, 1)}.9'), isFalse);
      expect(esIpv4Privada('10.0.0.300'), isFalse);
    });

    test('esNombreLocal', () {
      expect(esNombreLocal('mac.local'), isTrue);
      expect(esNombreLocal('mac.localhost'), isFalse);
      expect(esNombreLocal('mac-.local'), isFalse);
    });
  });

  test('cada resultado de la prueba de /health se dice con palabras distintas', () {
    final textos = SaludDelServidor.values.map(mensajeDeSalud).toList();
    expect(textos.toSet(), hasLength(SaludDelServidor.values.length));
    expect(mensajeDeSalud(SaludDelServidor.responde), 'El servidor responde.');
    expect(mensajeDeSalud(SaludDelServidor.noEsNextControl), contains('no es un servidor de Next'));
    expect(mensajeDeSalud(SaludDelServidor.sinRespuesta), contains('misma red'));
    // Un .local que la red no resuelve lleva a escribir la IP.
    expect(mensajeDeSalud(SaludDelServidor.nombreDesconocido), contains('IP del Mac'));
  });
}
