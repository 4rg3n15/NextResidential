/// Controladores de vista: el estado de una pantalla, y quién lo mueve.
///
/// Un `ChangeNotifier` por pantalla, todos sobre el mismo mecanismo: pedir,
/// traducir a `Estado<T>`, notificar. No hay gestor de estado de terceros
/// porque no hace falta: lo que esta app necesita es una lectura por pantalla y
/// un refresco al volver a primer plano.
///
/// **El dato previo se conserva al recargar.** `Cargando(previo: …)` es lo que
/// permite que un regreso a primer plano no parpadee a blanco.
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

  Future<void> cargarAhora() async {
    _estado = Cargando<T>(previo: _previo);
    notifyListeners();
    final resultado = await cargar<T>(_leer, estaVacio: _estaVacio);
    // Si falló pero había dato previo, se conserva para que la vista pueda
    // mostrar los dos: el aviso y lo último que sí se supo.
    _estado = switch (resultado) {
      Fallido<T>(fallo: final f) => Fallido<T>(f, previo: _previo),
      _ => resultado,
    };
    notifyListeners();
  }

  /// Vacía el estado sin pedir nada. Se usa al cerrar sesión: dejar los datos
  /// del residente anterior en memoria sería una fuga entre cuentas en el mismo
  /// dispositivo.
  void olvidar() {
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
    await cargarAhora();
  }
}
