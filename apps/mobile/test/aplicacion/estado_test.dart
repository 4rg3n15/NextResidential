import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/estado.dart';
import 'package:ncr_residente/dominio/puertos.dart';

/// `cargar()` es el ÚNICO sitio donde una excepción se convierte en estado. Si
/// dejara escapar una, la pantalla la recibiría en el árbol de widgets y el
/// residente vería un rectángulo gris de Flutter en vez de un mensaje.
void main() {
  test('una lectura correcta produce ConDatos', () async {
    final e = await cargar<int>(() async => 7);
    expect(e, isA<ConDatos<int>>());
    expect((e as ConDatos<int>).datos, 7);
  });

  test('una lista vacía produce Vacio, no ConDatos con lista vacía', () async {
    // «Sin vehículos registrados» es información; una lista vacía pintada como
    // datos deja la pantalla en blanco sin explicar nada.
    final e = await cargar<List<int>>(() async => [], estaVacio: (l) => l.isEmpty);
    expect(e, isA<Vacio<List<int>>>());
  });

  test('un Fallo tipado se conserva con su clase', () async {
    final e = await cargar<int>(
      () async => throw const Fallo(ClaseDeFallo.sinConexion, 'sin red'),
    );
    expect(e, isA<Fallido<int>>());
    expect((e as Fallido<int>).fallo.clase, ClaseDeFallo.sinConexion);
  });

  test('una excepción NO prevista se clasifica en vez de escapar', () async {
    // El caso que importa: algo que nadie tipó —un `FormatException` de una
    // fecha rara— tiene que llegar a la pantalla como un fallo con su texto.
    final e = await cargar<int>(() async => throw const FormatException('fecha ilegible'));
    expect(e, isA<Fallido<int>>());
    expect((e as Fallido<int>).fallo.clase, ClaseDeFallo.servidor);
    expect(e.fallo.detalle, contains('fecha ilegible'));
  });
}
