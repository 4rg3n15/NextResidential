import 'package:ncr_residente/aplicacion/servidor_en_uso.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/direccion_del_servidor.dart';
import 'package:ncr_residente/dominio/notificaciones.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/infraestructura/almacen/almacen_de_texto.dart';

/// Dobles de 15-L: el servidor que se prueba, las notificaciones de la API y
/// el llavero. Implementan PUERTOS: ninguno sabe qué es HTTP.

/// Contesta a `/health` lo que la prueba diga, y apunta qué se probó.
class ComprobadorFijo implements ComprobadorDeServidor {
  ComprobadorFijo([this.salud = SaludDelServidor.responde]);
  SaludDelServidor salud;
  final List<String> probadas = [];

  @override
  Future<SaludDelServidor> comprobar(String url) async {
    probadas.add(url);
    return salud;
  }
}

/// La lista de la API, que la prueba cambia como la cambiaría portería.
class NotificacionesFalsas implements RepositorioDeNotificaciones {
  NotificacionesFalsas([List<Notificacion>? lista]) : lista = lista ?? [];
  List<Notificacion> lista;
  Fallo? falla;
  int lecturas = 0;

  @override
  Future<List<Notificacion>> misNotificaciones() async {
    lecturas += 1;
    final f = falla;
    if (f != null) throw f;
    return List.of(lista);
  }
}

Notificacion rechazo(String id, String visitante, String motivo) => Notificacion(
      id: id,
      tipo: TipoDeNotificacion.visitaRechazada,
      en: DateTime(2026, 9, 20, 9, 5),
      visitante: visitante,
      motivo: motivo,
    );

/// El caso de uso del servidor sobre un llavero en memoria.
CambioDeServidor cambioDeServidor(
  SesionEnUso sesion, {
  String compilada = 'http://api.invalid',
  AlmacenDeTexto? almacen,
  ComprobadorDeServidor? comprobador,
}) =>
    CambioDeServidor(
      direccion: DireccionDelServidor(
        compilada: compilada,
        almacen: almacen ?? AlmacenDeTextoEnMemoria(),
      ),
      comprobador: comprobador ?? ComprobadorFijo(),
      sesion: sesion,
    );

/// Un llavero que falla (bloqueado, lleno): la app tiene que seguir igual.
class AlmacenRoto implements AlmacenDeTexto {
  @override
  Future<String?> leer(String clave) => throw StateError('llavero bloqueado');
  @override
  Future<void> escribir(String clave, String valor) => throw StateError('llavero bloqueado');
  @override
  Future<void> borrar(String clave) => throw StateError('llavero bloqueado');
}
