/// E2 (ETAPA 15-L) · por qué red sale el teléfono, para nombrar la causa de un
/// fallo de conexión. Si el sistema no contesta, `desconocida`: el mensaje de
/// la pantalla se apoya entonces sólo en el error del socket.
library;

import 'package:connectivity_plus/connectivity_plus.dart';

import '../../dominio/causa_de_red.dart';

/// Pura: lo que devuelve el sistema, en el vocabulario de la app.
TipoDeRed tipoDeRedDe(List<ConnectivityResult> resultados) {
  if (resultados.contains(ConnectivityResult.wifi) ||
      resultados.contains(ConnectivityResult.ethernet)) {
    return TipoDeRed.wifi;
  }
  if (resultados.contains(ConnectivityResult.mobile)) {
    return TipoDeRed.datosMoviles;
  }
  if (resultados.isEmpty ||
      resultados.every((r) => r == ConnectivityResult.none)) {
    return TipoDeRed.ninguna;
  }
  return TipoDeRed.otra;
}

Future<TipoDeRed> tipoDeRedActual() async {
  try {
    return tipoDeRedDe(await Connectivity().checkConnectivity());
  } on Object {
    return TipoDeRed.desconocida;
  }
}
