/// LAS NOTIFICACIONES DEL CONJUNTO, leídas de la API mientras la app está abierta.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// SIN SERVICIO DE MENSAJERÍA NO HAY AVISO CON LA APP CERRADA
///
/// Esta compilación no lleva Firebase, así que nada llega al teléfono con la app
/// cerrada. Lo que SÍ hay es la lista que la API arma con lo que pasó en la
/// vivienda —una visita que portería o la administración rechazó, con el motivo
/// que escribió; un visitante que ingresó—, la MISMA que ve la consola. La app
/// la pide mientras está abierta y cuenta en Inicio las que el residente no ha
/// visto. La pantalla lo dice tal cual: «Los avisos llegan mientras la app está
/// abierta».
///
/// ═════════════════════════════════════════════════════════════════════════════
/// «VISTA» ES ESTADO DEL TELÉFONO, NO DEL NEGOCIO
///
/// Qué notificaciones vio el residente en ESTE aparato no le importa a la
/// consola, y por eso es lo único de esta pantalla que vive en el teléfono. Se
/// guarda como el conjunto de identificadores vistos —el servidor los da
/// estables— y no como una hora: un ingreso decidido por el Edge sin red llega
/// tarde con su hora verdadera, anterior a la última visita a la pantalla, y
/// con una marca de hora no se contaría nunca.
library;

enum TipoDeNotificacion {
  /// Portería o la administración rechazó una visita del residente.
  visitaRechazada,

  /// Un visitante del residente ingresó.
  ingresoDeVisitante,

  /// Un tipo que el servidor añada mañana: se enseña sin inventar su sentido.
  otra,
}

class Notificacion {
  const Notificacion({
    required this.id,
    required this.tipo,
    required this.en,
    this.visitante,
    this.motivo,
    this.autorizacionId,
  });

  /// Estable: es lo que se recuerda como «vista».
  final String id;
  final TipoDeNotificacion tipo;
  final DateTime en;
  final String? visitante;

  /// El motivo que escribió quien rechazó la visita, tal cual.
  final String? motivo;
  final String? autorizacionId;

  /// La frase que ve el residente.
  String get texto {
    final quien = visitante;
    return switch (tipo) {
      TipoDeNotificacion.visitaRechazada => [
        quien == null ? 'Rechazaron una de sus visitas' : 'Rechazaron la visita de $quien',
        if (motivo != null && motivo!.trim().isNotEmpty) ': ${motivo!.trim()}' else '.',
      ].join(),
      TipoDeNotificacion.ingresoDeVisitante =>
        quien == null ? 'Ingresó uno de sus visitantes' : '$quien ingresó',
      TipoDeNotificacion.otra => 'Hay una novedad en sus visitas',
    };
  }
}

/// Cuántas de `lista` no están en `vistas`.
int cuantasSinVer(List<Notificacion> lista, Set<String> vistas) =>
    lista.where((n) => !vistas.contains(n.id)).length;

/// Lectura de las notificaciones de la vivienda del residente. Un puerto
/// aparte del repositorio del residente (ISP): quien lista visitas no tiene
/// por qué saber de notificaciones.
abstract interface class RepositorioDeNotificaciones {
  Future<List<Notificacion>> misNotificaciones();
}
