import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/causa_de_red.dart';
import 'package:ncr_residente/infraestructura/red/tipo_de_red.dart';

/// E2 (ETAPA 15-L) · cada causa de un fallo de conexión, con su nombre y su
/// remedio. Nunca «No hay conexión» a secas.
void main() {
  const url = 'http://192.0.2.10:3000';
  CausaDeRed causa(TipoDeRed red, String error, {bool tiempo = false}) =>
      causaDeRed(red: red, error: error, agotoElTiempo: tiempo);

  group('la causa', () {
    test(
      'con datos móviles o sin red manda la red, diga lo que diga el socket',
      () {
        expect(
          causa(TipoDeRed.datosMoviles, 'No route to host'),
          CausaDeRed.datosMoviles,
        );
        expect(causa(TipoDeRed.ninguna, ''), CausaDeRed.sinRed);
      },
    );

    test('en Wi-Fi, por lo que contestó el sistema', () {
      expect(
        causa(
          TipoDeRed.wifi,
          'SocketException: No route to host (OS Error: No route to host, errno = 65)',
        ),
        CausaDeRed.redLocalDenegada,
      );
      expect(
        causa(TipoDeRed.wifi, 'Operation not permitted, errno = 1'),
        CausaDeRed.redLocalDenegada,
      );
      expect(
        causa(TipoDeRed.wifi, 'Connection refused, errno = 61'),
        CausaDeRed.servidorApagado,
      );
      expect(
        causa(TipoDeRed.wifi, 'Network is unreachable, errno = 51'),
        CausaDeRed.sinRed,
      );
      expect(
        causa(TipoDeRed.wifi, "Failed host lookup: 'mac.local'"),
        CausaDeRed.direccionInvalida,
      );
      expect(causa(TipoDeRed.wifi, '', tiempo: true), CausaDeRed.macNoContesta);
      expect(causa(TipoDeRed.desconocida, 'algo raro'), CausaDeRed.desconocida);
    });
  });

  group('el mensaje', () {
    test(
      'cada causa nombra su remedio; las del Mac, la comprobación con Safari',
      () {
        expect(
          mensajeDeCausa(CausaDeRed.datosMoviles, url),
          contains('datos móviles'),
        );
        expect(mensajeDeCausa(CausaDeRed.sinRed, url), contains('misma Wi-Fi'));
        expect(
          mensajeDeCausa(CausaDeRed.redLocalDenegada, url),
          contains('Red local'),
        );
        expect(
          mensajeDeCausa(CausaDeRed.macNoContesta, url),
          contains('$url/health'),
        );
        expect(
          mensajeDeCausa(CausaDeRed.macNoContesta, url),
          contains('cortafuegos'),
        );
        expect(
          mensajeDeCausa(CausaDeRed.servidorApagado, url),
          contains('$url/health'),
        );
        // 15-L · el remedio ya no es reinstalar: «Cambiar servidor», y la
        // pista de por qué un nombre .local puede no resolverse.
        expect(
          mensajeDeCausa(CausaDeRed.direccionInvalida, url),
          allOf(contains('Cambiar servidor'), contains('.local'), contains(url)),
        );
        expect(mensajeDeCausa(CausaDeRed.direccionInvalida, url), isNot(contains('dart-define')));
        expect(
          mensajeDeCausa(CausaDeRed.desconocida, ''),
          contains('(sin API_URL)/health'),
        );
        for (final c in CausaDeRed.values) {
          expect(mensajeDeCausa(c, url), isNot(contains('No hay conexión')));
        }
      },
    );
  });

  group('la red del teléfono', () {
    test('Wi-Fi o cable, datos móviles, ninguna u otra', () {
      expect(
        tipoDeRedDe([ConnectivityResult.wifi, ConnectivityResult.mobile]),
        TipoDeRed.wifi,
      );
      expect(tipoDeRedDe([ConnectivityResult.ethernet]), TipoDeRed.wifi);
      expect(tipoDeRedDe([ConnectivityResult.mobile]), TipoDeRed.datosMoviles);
      expect(tipoDeRedDe([ConnectivityResult.none]), TipoDeRed.ninguna);
      expect(tipoDeRedDe([]), TipoDeRed.ninguna);
      expect(tipoDeRedDe([ConnectivityResult.vpn]), TipoDeRed.otra);
    });
  });
}
