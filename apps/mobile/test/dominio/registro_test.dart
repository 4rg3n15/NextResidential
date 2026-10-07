import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/registro.dart';

/// Una contraseña de prueba que cumple la política (no es un secreto).
const claveDePrueba = 'Clave#2026';

/// RONDA 15-W · «Crear cuenta»: de dónde sale el código con el que se entra
/// después, cuándo se puede pulsar el botón y la cortesía de los campos.
void main() {
  group('el prefijo del código de invitación es el código de la copropiedad', () {
    test('con guiones, espacios o minúsculas, como lo escriba', () {
      expect(copropiedadDelCodigo('MIRA-K7PQ-2XWZ'), 'MIRA');
      expect(copropiedadDelCodigo(' mira k7pq 2xwz '), 'MIRA');
      expect(copropiedadDelCodigo('ROBLE12K7PQ2XWZ'), 'ROBLE12');
    });

    test('sin prefijo, o con uno que no puede ser de un conjunto, no hay con qué entrar', () {
      expect(copropiedadDelCodigo('K7PQ-2XWZ'), isNull);
      expect(copropiedadDelCodigo('AB-K7PQ-2XWZ'), isNull);
      expect(copropiedadDelCodigo('MI_RA-K7PQ-2XWZ'), isNull);
      expect(copropiedadDelCodigo(''), isNull);
    });

    test('la cortesía del campo pide el código completo, sin decir nada de su validez', () {
      expect(motivoDeCodigoDeInvitacion(''), 'Escriba el código de invitación');
      expect(motivoDeCodigoDeInvitacion('K7PQ-2XWZ'), contains('MIRA-K7PQ-2XWZ'));
      expect(motivoDeCodigoDeInvitacion('MIRA-K7PQ-2XWZ'), isNull);
    });
  });

  group('el usuario y el correo, como los juzga el servidor', () {
    test('usuario de 3 a 32, sin tildes y empezando por letra o número', () {
      expect(motivoDeUsuarioInvalido('ana.perez'), isNull);
      expect(motivoDeUsuarioInvalido(' Ana.Perez '), isNull, reason: 'se normaliza');
      expect(motivoDeUsuarioInvalido('an'), contains('entre 3 y 32'));
      expect(motivoDeUsuarioInvalido('a' * 33), contains('entre 3 y 32'));
      expect(motivoDeUsuarioInvalido('.ana'), contains('empieza por letra o número'));
      expect(motivoDeUsuarioInvalido('peña'), contains('sin tilde'));
    });

    test('el correo es de contacto: basta con que tenga forma de correo', () {
      expect(motivoDeCorreoInvalido('ana@ejemplo.invalid'), isNull);
      expect(motivoDeCorreoInvalido(''), 'Escriba su correo');
      expect(motivoDeCorreoInvalido('ana@'), 'Escriba un correo válido');
      expect(motivoDeCorreoInvalido('ana ejemplo.invalid'), 'Escriba un correo válido');
    });
  });

  group('el botón se habilita con todo escrito, la casilla y las dos contraseñas iguales', () {
    bool listo({
      String usuario = 'ana.perez',
      String correo = 'ana@ejemplo.invalid',
      String contrasena = claveDePrueba,
      String confirmacion = claveDePrueba,
      String codigo = 'MIRA-K7PQ-2XWZ',
      String fecha = '1990-05-17',
      bool aceptada = true,
      bool hayPolitica = true,
    }) => registroListoParaEnviar(
      usuario: usuario,
      correo: correo,
      contrasena: contrasena,
      confirmacion: confirmacion,
      codigo: codigo,
      fechaNacimiento: fecha,
      aceptada: aceptada,
      hayPolitica: hayPolitica,
    );

    test('completo', () => expect(listo(), isTrue));
    test('un campo en blanco', () {
      expect(listo(usuario: ' '), isFalse);
      expect(listo(correo: ''), isFalse);
      expect(listo(codigo: ''), isFalse);
      expect(listo(fecha: ''), isFalse);
      expect(listo(contrasena: '', confirmacion: ''), isFalse);
    });
    test('sin la casilla, o sin la política que se acepta', () {
      expect(listo(aceptada: false), isFalse);
      expect(listo(hayPolitica: false), isFalse);
    });
    test('las contraseñas distintas', () => expect(listo(confirmacion: 'Clave#2027'), isFalse));
  });
}
