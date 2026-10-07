/// De quién es el rostro que se gestiona en la pantalla del rostro (RONDA 15-X):
/// el PROPIO (D2) o el de un MENOR del hogar, por el titular como su
/// representante legal (D3). Cambian los textos y, para el menor, las dos
/// declaraciones sin las que el botón no se habilita —el servidor las exige
/// igual (`declaraRepresentacionLegal`, `menorInformadoYDeAcuerdo`)—.
library;

class TextosDelRostro {
  const TextosDelRostro._({
    required this.titulo,
    required this.registrar,
    required this.renovar,
    required this.retirar,
    required this.acepto,
    required this.declaraciones,
  });

  /// «Mi rostro»: sin declaraciones, la política la acepta el propio titular.
  const TextosDelRostro.propio()
    : this._(
        titulo: 'Mi rostro',
        registrar: 'Registrar mi rostro',
        renovar: 'Renovar mi rostro',
        retirar: 'Retirar mi rostro',
        acepto: 'Leí y acepto la política del tratamiento de mi rostro',
        declaraciones: const [],
      );

  /// El de un menor de 15 a 17 años, por el titular del hogar.
  TextosDelRostro.deMenor(String nombre)
    : this._(
        titulo: 'Rostro de $nombre',
        registrar: 'Registrar su rostro',
        renovar: 'Renovar su rostro',
        retirar: 'Retirar su rostro',
        acepto: 'Leí y acepto, como su representante, la política del tratamiento de su rostro',
        declaraciones: const [
          'Soy su representante legal',
          'Le expliqué para qué es su rostro y está de acuerdo',
        ],
      );

  final String titulo;
  final String registrar;
  final String renovar;
  final String retirar;
  final String acepto;

  /// Casillas que hay que marcar, además de la política, antes de registrar.
  final List<String> declaraciones;
}
