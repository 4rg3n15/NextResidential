/// Controladores de vista: el estado de una pantalla, y quién lo mueve.
///
/// Un `ChangeNotifier` por pantalla, todos sobre el mismo mecanismo: pedir,
/// traducir a `Estado<T>`, notificar. No hay gestor de estado de terceros
/// porque no hace falta: lo que esta app necesita es una lectura por pantalla y
/// un refresco al volver a primer plano.
///
/// **El dato previo se conserva al recargar.** `Cargando(previo: …)` es lo que
/// permite que un regreso a primer plano no parpadee a blanco.
///
/// 15-L · **y ahora se recarga sola cada 20 s**, así que dos reglas más:
///
///  · `refrescar()` es la recarga SILENCIOSA del ciclo y del gesto de tirar: si
///    hay datos, no pasa por `Cargando` —la marca «lo último que se pudo
///    cargar» y la barra parpadearían cada 20 s— y cambia la pantalla sólo
///    cuando llega la respuesta.
///  · **Nunca dos lecturas iguales en vuelo.** Si ya hay una, la segunda
///    llamada espera a ESA en vez de pedir otra vez lo mismo.
library;

import 'package:flutter/foundation.dart';

import '../aplicacion/estado.dart';
import '../dominio/entidades.dart';
import '../dominio/puertos.dart';

class ControladorDeVista<T> extends ChangeNotifier {
  ControladorDeVista({
    required Future<T> Function() leer,
    bool Function(T)? estaVacio,
  })  : _leer = leer,
        _estaVacio = estaVacio;

  /// La lectura es reemplazable a propósito: el historial cambia de consulta
  /// al cambiar de periodo y no necesita una segunda máquina de estados.
  @protected
  Future<T> Function() _leer;
  final bool Function(T)? _estaVacio;

  Estado<T> _estado = Inicial<T>();
  Estado<T> get estado => _estado;

  T? get _previo => switch (_estado) {
        ConDatos<T>(datos: final d) => d,
        Cargando<T>(previo: final p) => p,
        Fallido<T>(previo: final p) => p,
        _ => null,
      };

  Future<void>? _enCurso;

  /// Sube con cada `olvidar()`: una lectura que empezó antes no puede pintar
  /// al volver los datos de la cuenta que ya se fue.
  int _generacion = 0;

  /// Recarga ENSEÑANDO que recarga: el botón «Reintentar» y la primera carga.
  Future<void> cargarAhora() => _enCurso ??= _cargar(silenciosa: false);

  /// Recarga SIN pasar por `Cargando` si ya hay datos: el ciclo y el gesto.
  Future<void> refrescar() => _enCurso ??= _cargar(silenciosa: true);

  Future<void> _cargar({required bool silenciosa}) async {
    final generacion = _generacion;
    try {
      // Con algo ya en pantalla —datos, un vacío, un fallo— la recarga
      // silenciosa lo deja ahí hasta que llega la respuesta.
      final hayAlgo = _estado is! Inicial<T> && _estado is! Cargando<T>;
      if (!silenciosa || !hayAlgo) {
        _estado = Cargando<T>(previo: _previo);
        notifyListeners();
      }
      final resultado = await cargar<T>(_leer, estaVacio: _estaVacio);
      if (generacion != _generacion) return;
      // Si falló pero había dato previo, se conserva para que la vista pueda
      // mostrar los dos: el aviso y lo último que sí se supo.
      _estado = switch (resultado) {
        Fallido<T>(fallo: final f) => Fallido<T>(f, previo: _previo),
        _ => resultado,
      };
      notifyListeners();
    } finally {
      // Si entre tanto se olvidó todo, `_enCurso` ya es de otra lectura.
      if (generacion == _generacion) _enCurso = null;
    }
  }

  /// Vacía el estado sin pedir nada. Se usa al cerrar sesión: dejar los datos
  /// del residente anterior en memoria sería una fuga entre cuentas en el mismo
  /// dispositivo.
  void olvidar() {
    _generacion += 1;
    _enCurso = null;
    _estado = Inicial<T>();
    notifyListeners();
  }
}

/// Fábricas por pantalla. Existen para que el nombre de la operación aparezca
/// en el árbol de widgets y no un genérico ilegible.
ControladorDeVista<MiHogar> controladorDeInicio(RepositorioDelResidente repo) =>
    ControladorDeVista<MiHogar>(leer: repo.miHogar);

ControladorDeVista<List<MiembroDeFamilia>> controladorDeFamilia(
  RepositorioDelResidente repo,
) =>
    ControladorDeVista<List<MiembroDeFamilia>>(
      leer: repo.miFamilia,
      estaVacio: (l) => l.isEmpty,
    );

ControladorDeVista<List<Vehiculo>> controladorDeVehiculos(RepositorioDelResidente repo) =>
    ControladorDeVista<List<Vehiculo>>(
      leer: repo.misVehiculos,
      estaVacio: (l) => l.isEmpty,
    );

ControladorDeVista<List<Autorizacion>> controladorDeAutorizaciones(
  RepositorioDelResidente repo,
) =>
    ControladorDeVista<List<Autorizacion>>(
      leer: repo.misAutorizaciones,
      estaVacio: (l) => l.isEmpty,
    );

/// F6 · los últimos visitantes de la vivienda, uno por persona. Vacía no es un
/// fallo: quien nunca ha autorizado a nadie no tiene a quién volver a autorizar.
ControladorDeVista<List<VisitanteReciente>> controladorDeUltimosVisitantes(
  RepositorioDelResidente repo,
) =>
    ControladorDeVista<List<VisitanteReciente>>(
      leer: repo.ultimosVisitantes,
      estaVacio: (l) => l.isEmpty,
    );

/// El historial lleva su propio filtro, así que el controlador tiene estado
/// además del `Estado`: el periodo elegido. Cambiar de periodo es cambiar la
/// lectura y recargar — la misma máquina de estados, no otra.
class ControladorDeHistorial extends ControladorDeVista<List<EventoDeAcceso>> {
  /// `repo` se recibe como PARÁMETRO y se captura en la lambda antes de
  /// asignarlo al campo: un campo de instancia no se puede leer en la lista de
  /// inicialización, y el compilador lo rechaza con un mensaje que no explica
  /// por qué.
  ControladorDeHistorial(RepositorioDelResidente repo)
      : _repo = repo,
        super(
          leer: () => repo.miHistorial(PeriodoDeHistorial.mes),
          estaVacio: _listaVacia,
        );

  final RepositorioDelResidente _repo;
  PeriodoDeHistorial _periodo = PeriodoDeHistorial.mes;
  PeriodoDeHistorial get periodo => _periodo;

  static bool _listaVacia(List<EventoDeAcceso> l) => l.isEmpty;

  Future<void> cambiarPeriodo(PeriodoDeHistorial nuevo) async {
    _periodo = nuevo;
    _leer = () => _repo.miHistorial(nuevo);
    // Una lectura del periodo anterior en vuelo no puede ser la respuesta a
    // este: se espera a que termine y se pide la del periodo nuevo.
    await _enCurso;
    await cargarAhora();
  }
}

/// M-5 · las zonas del conjunto con su aforo de AHORA.
///
/// Es una lectura más, sin máquina propia, y eso es deliberado: la pantalla
/// **refleja**, no calcula. Si aquí hubiera lógica de «puede entrar», el aforo
/// se estaría decidiendo en el teléfono, que es justo lo que la base garantiza
/// y lo que §2.2 prohíbe a la capa de presentación.
ControladorDeVista<List<ZonaComun>> controladorDeZonas(RepositorioDelResidente repo) =>
    ControladorDeVista<List<ZonaComun>>(
      leer: repo.misZonas,
      estaVacio: (l) => l.isEmpty,
    );
