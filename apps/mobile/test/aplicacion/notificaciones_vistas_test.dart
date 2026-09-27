import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/notificaciones_vistas.dart';
import 'package:ncr_residente/infraestructura/almacen/almacen_de_texto.dart';

import '../dobles/sincronizacion.dart';

void main() {
  test('abrir la pantalla las marca vistas, y eso sobrevive a cerrar la app', () async {
    final llavero = AlmacenDeTextoEnMemoria();
    final vistas = NotificacionesVistas(almacen: llavero);
    final lista = [rechazo('a', 'Ana', 'No la esperan'), rechazo('b', 'Luis', 'Sin cupo')];
    expect(vistas.sinVer(lista), 2);

    var avisos = 0;
    vistas.addListener(() => avisos += 1);
    await vistas.marcar(lista);
    expect(vistas.sinVer(lista), 0);
    expect(avisos, 1);

    // Marcar lo mismo otra vez no avisa ni escribe: no hay bucle con quien
    // escucha y vuelve a marcar.
    await vistas.marcar(lista);
    expect(avisos, 1);

    final otraVez = NotificacionesVistas(almacen: llavero);
    await otraVez.recuperar();
    expect(otraVez.sinVer([...lista, rechazo('c', 'Eva', 'x')]), 1);
  });

  test('lo guardado son los de la lista de ahora: no crece sin límite', () async {
    final llavero = AlmacenDeTextoEnMemoria();
    final vistas = NotificacionesVistas(almacen: llavero);
    await vistas.marcar([rechazo('a', 'Ana', 'x')]);
    await vistas.marcar([rechazo('b', 'Luis', 'y')]);
    expect(llavero.datos[NotificacionesVistas.clave], '["b"]');
  });

  test('un llavero roto o ilegible no rompe nada: se cuenta de más, nunca de menos', () async {
    final llavero = AlmacenDeTextoEnMemoria()..datos[NotificacionesVistas.clave] = '{roto';
    final vistas = NotificacionesVistas(almacen: llavero);
    await vistas.recuperar();
    expect(vistas.sinVer([rechazo('a', 'Ana', 'x')]), 1);

    final sinLlavero = NotificacionesVistas(almacen: AlmacenRoto());
    await sinLlavero.recuperar();
    await sinLlavero.marcar([rechazo('a', 'Ana', 'x')]);
    expect(sinLlavero.sinVer([rechazo('a', 'Ana', 'x')]), 0, reason: 'se recuerda en memoria');
  });
}
