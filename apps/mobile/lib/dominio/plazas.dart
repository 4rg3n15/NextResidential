/// Las plazas de una vivienda y sus códigos (ETAPA 15-I, RONDA 15-W).
///
/// Cada ocupante tiene su PLAZA, y cada plaza libre su CÓDIGO de un solo uso,
/// con el prefijo del conjunto («MIRA-K7PQ-2XWZ»): con él, quien vive con el
/// titular crea su propia cuenta en «Crear cuenta». Un menor ocupa la suya sin
/// cuenta.
///
/// Desde la 15-W el número ya NO es definitivo: el TITULAR añade plazas hasta
/// el tope de su vivienda —contándose a sí mismo— y retira las libres. Quién
/// es el titular y cuál es el tope los dice el SERVIDOR en cada lectura; la
/// base vuelve a decidir el tope al escribir. Las reglas de aquí sólo deciden
/// qué botones se ofrecen: el «3 de 4» y que no se ofrezca retirar lo que el
/// servidor rechazaría.
library;

class PlazaDeOcupante {
  const PlazaDeOcupante({
    required this.id,
    required this.numero,
    required this.libre,
    required this.codigo,
    required this.ocupante,
    this.sinCuenta = false,
  });
  final String id;
  final int numero;
  final bool libre;

  /// Sólo en las libres, con el prefijo del conjunto: «MIRA-ABCD-EFGH».
  final String? codigo;
  final String? ocupante;

  /// La ocupa una persona sin cuenta: un menor del hogar.
  final bool sinCuenta;
}

class MisOcupantes {
  const MisOcupantes({
    required this.declarados,
    required this.declarada,
    required this.plazas,
    required this.aviso,
    required this.tope,
    required this.esTitular,
  });
  final int declarados;
  final bool declarada;
  final List<PlazaDeOcupante> plazas;

  /// El texto de la vivienda, con su tope. Lo escribe el servidor.
  final String aviso;

  /// Cuántas plazas puede tener la vivienda, contando la del titular.
  final int tope;

  /// Quien pregunta es el titular: sólo él añade y retira plazas.
  final bool esTitular;

  List<PlazaDeOcupante> get libres => plazas.where((p) => p.libre).toList();

  /// «3 de 4».
  String get cupo => '${plazas.length} de $tope';

  bool get alTope => plazas.length >= tope;
  bool get puedeAnadir => esTitular && !alTope;

  /// Sólo una plaza LIBRE, y nunca la primera, que es la del titular.
  bool sePuedeRetirar(PlazaDeOcupante plaza) => esTitular && plaza.libre && plaza.numero != 1;
}

/// Lo que se lee al llegar al tope.
const avisoDelTope = 'Para más plazas, pídalo a la administración';

/// El servidor pide al menos tres letras de motivo para retirar una plaza.
const motivoMinimoDeRetiro = 3;

/// El mensaje que acompaña a un código cuando se comparte.
String mensajeParaCompartir(String codigo) =>
    'Descargue la app, pulse Crear cuenta y use este código: $codigo';

/// Las plazas del TITULAR. Cada respuesta trae las plazas como quedaron.
abstract interface class RepositorioDePlazas {
  /// 409 al llegar al tope y 403 si no es el titular: llegan como `Fallo`
  /// con el texto del servidor.
  Future<MisOcupantes> anadirPlaza();

  /// Sólo una plaza libre: la ocupada contesta «Primero dé de baja a la
  /// persona».
  Future<MisOcupantes> retirarPlaza(String plazaId, {required String motivo});
}
