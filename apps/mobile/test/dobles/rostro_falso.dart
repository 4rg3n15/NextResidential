import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/rostro.dart';
import 'package:ncr_residente/dominio/rostro_de_menor.dart';

/// 15-X · «Mi rostro» sin red: un estado que se gobierna desde la prueba, un
/// fallo que se le puede imponer al siguiente envío y lo que se le pidió.
class RostroFalso implements RostroDelResidente {
  RostroFalso({EstadoDeMiRostro? inicial}) : estado = inicial ?? sinRostro;

  static const politica = PoliticaDelRostro(version: 'rostro-de-prueba-1', texto: 'Autorizo…');

  static const sinRostro = EstadoDeMiRostro(
    estado: EstadoDelRostro.sinRostro,
    calidad: null,
    registradoEn: null,
    venceEn: null,
    diasParaVencer: null,
    equiposConRostro: 2,
    equiposConMiRostro: 0,
    equipos: [
      EquipoDelRostro(nombre: 'Terminal de la portería', estado: EstadoEnEquipo.pendiente),
      EquipoDelRostro(nombre: 'Videoportero', estado: EstadoEnEquipo.pendiente),
    ],
    politica: politica,
  );

  static final activo = EstadoDeMiRostro(
    estado: EstadoDelRostro.activa,
    calidad: 0.9,
    registradoEn: DateTime.utc(2026, 10, 8, 12),
    venceEn: DateTime.utc(2027, 10, 8, 12),
    diasParaVencer: 365,
    equiposConRostro: 2,
    equiposConMiRostro: 2,
    equipos: const [
      EquipoDelRostro(nombre: 'Terminal de la portería', estado: EstadoEnEquipo.sincronizada),
      EquipoDelRostro(nombre: 'Videoportero', estado: EstadoEnEquipo.sincronizada),
    ],
  );

  EstadoDeMiRostro estado;

  /// Si no es `null`, el SIGUIENTE registro o retiro lo lanza (una vez).
  Fallo? falloSiguiente;

  /// Si no es `null`, toda lectura lo lanza (sin red, por ejemplo).
  Fallo? falloAlLeer;

  final registros = <(FotoDeRostro, String)>[];
  int retiros = 0;
  int lecturas = 0;

  @override
  Future<EstadoDeMiRostro> miRostro() async {
    lecturas += 1;
    final f = falloAlLeer;
    if (f != null) throw f;
    return estado.conPolitica(politica);
  }

  @override
  Future<EstadoDeMiRostro> registrar(FotoDeRostro foto, {required String versionPolitica}) async {
    _quizaFalla();
    registros.add((foto, versionPolitica));
    estado = activo;
    return activo;
  }

  @override
  Future<EstadoDeMiRostro> retirar() async {
    _quizaFalla();
    retiros += 1;
    estado = sinRostro;
    return sinRostro.conPolitica(null);
  }

  void _quizaFalla() {
    final f = falloSiguiente;
    falloSiguiente = null;
    if (f != null) throw f;
  }
}

/// 15-X (D3) · un rostro falso por menor: el mismo cada vez que se pide.
class RostroDeMenoresFalso implements RostroDeMenores {
  final porMenor = <String, RostroFalso>{};

  @override
  RostroFalso de(String residenteId) => porMenor.putIfAbsent(residenteId, () => RostroFalso());
}
