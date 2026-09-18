import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';

/// Reloj de prueba: el tiempo se mueve a mano.
class RelojFijo implements Reloj {
  RelojFijo(this._ahora);
  DateTime _ahora;
  void avanzar(Duration d) => _ahora = _ahora.add(d);
  @override
  DateTime ahora() => _ahora;
}

class AutenticadorDePrueba implements Autenticador {
  AutenticadorDePrueba(this._reloj, {this.fallaRenovacion = false});
  final RelojFijo _reloj;
  final bool fallaRenovacion;

  int renovaciones = 0;
  int inicios = 0;

  /// Completador manual: permite dejar una renovación EN VUELO y comprobar qué
  /// hacen las llamadas que llegan mientras tanto. Es la única forma de
  /// reproducir el caso de las cuatro pantallas al reanudar.
  Completer<void>? bloqueo;

  Sesion _nueva() => Sesion(
        tokenDeAcceso: 'a${renovaciones + inicios}',
        tokenDeRefresco: 'r${renovaciones + inicios}',
        expiraEn: _reloj.ahora().add(const Duration(minutes: 5)),
        usuarioId: 'u',
        copropiedadId: 'c',
        correo: 'residente@ejemplo.invalid',
      );

  @override
  Future<Sesion> iniciarSesion({required String correo, required String clave}) async {
    inicios += 1;
    return _nueva();
  }

  @override
  Future<Sesion> renovar(Sesion sesion) async {
    renovaciones += 1;
    if (bloqueo != null) await bloqueo!.future;
    if (fallaRenovacion) {
      throw const Fallo(ClaseDeFallo.sesionInvalida, 'el refresco fue rechazado');
    }
    return _nueva();
  }
}

void main() {
  late RelojFijo reloj;
  late AutenticadorDePrueba autenticador;
  late AlmacenEnMemoria almacen;
  late SesionEnUso sesion;

  SesionEnUso construir({bool fallaRenovacion = false}) {
    reloj = RelojFijo(DateTime.utc(2026, 9, 18, 12));
    autenticador = AutenticadorDePrueba(reloj, fallaRenovacion: fallaRenovacion);
    almacen = AlmacenEnMemoria();
    return SesionEnUso(almacen: almacen, autenticador: autenticador, reloj: reloj);
  }

  setUp(() {
    sesion = construir();
  });

  test('iniciar sesión la guarda en el almacén', () async {
    await sesion.iniciar(correo: 'x@y.invalid', clave: 'z');
    expect(sesion.haySesion, isTrue);
    expect(await almacen.leer(), isNotNull);
  });

  test('con la sesión fresca, asegurar() NO renueva', () async {
    await sesion.iniciar(correo: 'x@y.invalid', clave: 'z');
    await sesion.asegurar();
    expect(autenticador.renovaciones, 0);
  });

  test('tras una suspensión larga, asegurar() renueva ANTES de devolverla', () async {
    await sesion.iniciar(correo: 'x@y.invalid', clave: 'z');
    reloj.avanzar(const Duration(hours: 3));

    final s = await sesion.asegurar();

    expect(autenticador.renovaciones, 1);
    // Y lo que devuelve ya es el token nuevo: si devolviera el viejo, la
    // petición saldría caducada igual y todo esto sería decorativo.
    expect(s!.tokenDeAcceso, isNot('a0'));
    expect(s.expiraEn.isAfter(reloj.ahora()), isTrue);
  });

  test('CUATRO pantallas al reanudar producen UNA sola renovación', () async {
    /// El modo de fallo que convierte «refresqué al volver» en «me echó al
    /// volver»: Supabase ROTA el token de refresco en cada uso, así que cuatro
    /// renovaciones en paralelo invalidan tres.
    await sesion.iniciar(correo: 'x@y.invalid', clave: 'z');
    reloj.avanzar(const Duration(hours: 3));
    autenticador.bloqueo = Completer<void>();

    final peticiones = [
      sesion.asegurar(),
      sesion.asegurar(),
      sesion.asegurar(),
      sesion.asegurar(),
    ];
    // Las cuatro están esperando a la MISMA renovación, que aún no terminó.
    expect(autenticador.renovaciones, 1);

    autenticador.bloqueo!.complete();
    final resultados = await Future.wait(peticiones);

    expect(autenticador.renovaciones, 1);
    // Y las cuatro reciben el mismo token, no una carrera de tres perdedores.
    expect(resultados.map((s) => s!.tokenDeAcceso).toSet().length, 1);
  });

  test('alVolverAPrimerPlano renueva solo cuando hace falta, y lo dice', () async {
    await sesion.iniciar(correo: 'x@y.invalid', clave: 'z');

    expect(await sesion.alVolverAPrimerPlano(), isFalse);
    expect(autenticador.renovaciones, 0);

    reloj.avanzar(const Duration(hours: 3));
    expect(await sesion.alVolverAPrimerPlano(), isTrue);
    expect(autenticador.renovaciones, 1);
  });

  test('si el refresco es rechazado, la sesión se cierra y se borra el llavero', () async {
    sesion = construir(fallaRenovacion: true);
    await sesion.iniciar(correo: 'x@y.invalid', clave: 'z');
    reloj.avanzar(const Duration(hours: 3));

    final s = await sesion.asegurar();

    expect(s, isNull);
    expect(sesion.haySesion, isFalse);
    // Dejar el token muerto en el llavero haría que el siguiente arranque
    // repitiera el mismo rechazo y la app pareciera rota.
    expect(await almacen.leer(), isNull);
    // Y NO se reintenta: el token de refresco se rota en cada uso, así que
    // insistir con el mismo no puede funcionar.
    expect(autenticador.renovaciones, 1);
  });

  test('cerrar sesión borra la sesión guardada', () async {
    await sesion.iniciar(correo: 'x@y.invalid', clave: 'z');
    await sesion.cerrar();
    expect(sesion.haySesion, isFalse);
    expect(await almacen.leer(), isNull);
  });

  test('recuperar() trae la sesión del almacén al arrancar', () async {
    await sesion.iniciar(correo: 'x@y.invalid', clave: 'z');
    final otra = SesionEnUso(almacen: almacen, autenticador: autenticador, reloj: reloj);
    expect(otra.haySesion, isFalse);
    await otra.recuperar();
    expect(otra.haySesion, isTrue);
  });
}
