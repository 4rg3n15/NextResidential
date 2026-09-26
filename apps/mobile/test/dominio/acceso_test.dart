import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/acceso.dart';

/// D1 · cómo se entra, y 3.2 · qué pantalla toca en el primer ingreso.
void main() {
  group('identificador (D1)', () {
    test('sin arroba es un usuario con su código, normalizado', () {
      final i = identificadorDesde(codigo: ' mi ra ', usuario: ' Casa42.Ana ');
      expect(i, isA<PorUsuario>());
      final u = i as PorUsuario;
      expect(u.codigo, 'MIRA');
      expect(u.usuario, 'casa42.ana');
    });

    test('con arroba es un correo de cuenta anterior: el código no se pide', () {
      final i = identificadorDesde(codigo: '', usuario: 'Ana@Ejemplo.invalid');
      expect(i, isA<PorCorreo>());
      expect((i as PorCorreo).correo, 'ana@ejemplo.invalid');
      expect(pideCodigo('ana@ejemplo.invalid'), isFalse);
      expect(pideCodigo('casa42.ana'), isTrue);
    });

    test('el código tiene de 3 a 8 letras o números', () {
      expect(motivoDeCodigoInvalido(''), isNotNull);
      expect(motivoDeCodigoInvalido('AB'), isNotNull);
      expect(motivoDeCodigoInvalido('ABCDEFGHI'), isNotNull);
      expect(motivoDeCodigoInvalido('MI-RA'), isNotNull);
      expect(motivoDeCodigoInvalido('mira'), isNull);
      expect(motivoDeCodigoInvalido('ROBLE12'), isNull);
    });
  });

  group('paso del primer ingreso (3.2)', () {
    test('el cambio de contraseña va antes que nada', () {
      expect(
        pasoDePrimerIngreso(
          debeCambiarContrasena: true,
          viviendaVinculada: false,
          debeDeclararOcupantes: true,
        ),
        PasoDePrimerIngreso.cambiarContrasena,
      );
    });

    test('sin saber aún del alta, se consulta', () {
      expect(
        pasoDePrimerIngreso(
          debeCambiarContrasena: false,
          viviendaVinculada: null,
          debeDeclararOcupantes: false,
        ),
        PasoDePrimerIngreso.consultarAlta,
      );
    });

    test('sin vivienda, el formulario; luego los ocupantes; luego la app', () {
      expect(
        pasoDePrimerIngreso(
          debeCambiarContrasena: false,
          viviendaVinculada: false,
          debeDeclararOcupantes: false,
        ),
        PasoDePrimerIngreso.completarAlta,
      );
      expect(
        pasoDePrimerIngreso(
          debeCambiarContrasena: false,
          viviendaVinculada: true,
          debeDeclararOcupantes: true,
        ),
        PasoDePrimerIngreso.declararOcupantes,
      );
      expect(
        pasoDePrimerIngreso(
          debeCambiarContrasena: false,
          viviendaVinculada: true,
          debeDeclararOcupantes: false,
        ),
        PasoDePrimerIngreso.listo,
      );
    });
  });

  group('política de contraseña (paridad con el servidor)', () {
    // Los mismos ejemplos que la prueba de paridad de la consola.
    test('acepta la que cumple todo', () {
      expect(motivoDeRechazoDeContrasena('Inicial#2026'), isNull);
    });

    test('dice TODO lo que falta, no sólo lo primero', () {
      final m = motivoDeRechazoDeContrasena('abc')!;
      expect(m, contains('al menos 8 caracteres'));
      expect(m, contains('una letra mayúscula'));
      expect(m, contains('un número'));
      expect(m, contains('un carácter especial'));
      expect(m, isNot(contains('minúscula')));
    });

    test('rechaza la de más de 256 caracteres', () {
      expect(motivoDeRechazoDeContrasena('Aa1#' * 70), contains('256'));
    });
  });

  test('C-36 · el correo sintético se reconoce para no enseñarlo', () {
    expect(esCorreoSintetico('ana@10000000-0000-4000-8000-000000000001.usuarios.ncr.invalid'), isTrue);
    expect(esCorreoSintetico('ana@ejemplo.invalid'), isFalse);
  });
}
