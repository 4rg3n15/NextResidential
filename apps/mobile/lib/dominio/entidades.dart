/// Entidades de la app del residente.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ EXISTEN SI YA HAY DTO GENERADOS
///
/// Porque no son lo mismo, y confundirlos es la forma más rápida de acoplar la
/// interfaz al transporte. `MiViviendaDto` es la forma del JSON de hoy: si
/// mañana el contrato renombra un campo, el generador lo renombra y **todas**
/// las pantallas que lo usaran dejarían de compilar. Con esta capa, lo que deja
/// de compilar es un fichero: el adaptador que traduce.
///
/// Es la misma frontera que en la API —el agregado nunca se serializa crudo al
/// transporte (§2.2)—, leída desde el otro lado: el transporte nunca entra
/// crudo a la presentación.
///
/// Todo es `final` y sin setters. Un objeto de esta capa no se modifica: se
/// construye otro (§2.4).
library;

class Vivienda {
  const Vivienda({
    required this.id,
    required this.identificador,
    required this.agrupacion,
    required this.etiquetaVivienda,
    required this.etiquetaAgrupacion,
    required this.direccion,
    required this.copropiedadNombre,
    required this.estadoAdministrativo,
    required this.activa,
  });

  final String id;

  /// El número, sin la palabra: `42`.
  final String identificador;
  final String? agrupacion;

  /// Cómo llama ESTA copropiedad a sus viviendas y a sus agrupaciones.
  final String etiquetaVivienda;
  final String etiquetaAgrupacion;
  final String? direccion;
  final String copropiedadNombre;
  final String estadoAdministrativo;

  /// RN-13: inactiva conserva lo vigente y no genera autorizaciones nuevas.
  final bool activa;

  /// «Casa 42 · Manzana B», compuesto con las etiquetas del conjunto.
  ///
  /// La composición vive aquí y no en cada pantalla porque aparece en cinco, y
  /// la quinta es la que se escribe distinta. No hay `switch` sobre el tipo de
  /// conjunto: las palabras llegan del servidor (migración 0029), así que un
  /// conjunto que use «Etapa» o «Sector» funciona sin tocar la app.
  String get titulo {
    final casa = '$etiquetaVivienda $identificador';
    return agrupacion == null ? casa : '$casa · $etiquetaAgrupacion $agrupacion';
  }
}

class Vinculo {
  const Vinculo({
    required this.residenteId,
    required this.esTitular,
    required this.nivelAcceso,
  });

  final String residenteId;
  final bool esTitular;
  final String? nivelAcceso;
}

class MiHogar {
  const MiHogar({
    required this.vivienda,
    required this.vinculo,
    required this.puedeAutorizar,
  });

  final Vivienda vivienda;
  final Vinculo vinculo;

  /// Lo decide el SERVIDOR (RN-13 + RN-05). La app deshabilita el botón con
  /// este booleano y no recompone la regla: dos versiones de una regla son una
  /// regla y una mentira.
  final bool puedeAutorizar;
}

class MiembroDeFamilia {
  const MiembroDeFamilia({
    required this.residenteId,
    required this.nombre,
    required this.parentesco,
    required this.esTitular,
    required this.nivelAcceso,
    required this.activo,
  });

  final String residenteId;
  final String nombre;
  final String? parentesco;
  final bool esTitular;
  final String? nivelAcceso;

  /// RN-19: el desactivado conserva historial, así que sigue apareciendo y se
  /// marca. Ocultarlo haría creer que nunca existió.
  final bool activo;
}

class Vehiculo {
  const Vehiculo({
    required this.id,
    required this.placa,
    required this.marca,
    required this.modelo,
    required this.color,
    required this.esPrincipal,
    required this.activo,
  });

  final String id;
  final String placa;
  final String? marca;
  final String? modelo;
  final String? color;
  final bool esPrincipal;
  final bool activo;

  String get descripcion => [marca, modelo, color].whereType<String>().join(' · ');
}

class Autorizacion {
  const Autorizacion({
    required this.id,
    required this.visitante,
    required this.tipo,
    required this.desde,
    required this.hasta,
    required this.placa,
    required this.permiteAccesoVehicular,
    required this.estado,
    required this.acompanantes,
  });

  final String id;
  final String visitante;
  final String tipo;
  final DateTime desde;
  final DateTime hasta;
  final String? placa;
  final bool permiteAccesoVehicular;
  final String estado;
  final int acompanantes;

  bool vigenteEn(DateTime ahora) =>
      estado == 'activa' && !ahora.isBefore(desde) && ahora.isBefore(hasta);
}

class EventoDeAcceso {
  const EventoDeAcceso({
    required this.id,
    required this.ocurridoEn,
    required this.tipo,
    required this.resultado,
    required this.motivo,
    required this.metodo,
    required this.placaDetectada,
    required this.persona,
    required this.zona,
    required this.decididoPorEdge,
  });

  final String id;
  final DateTime ocurridoEn;
  final String tipo;
  final String? resultado;

  /// El residente tiene derecho a entender la negación (mockup M-6): el motivo
  /// se muestra, no se traga.
  final String? motivo;
  final String metodo;
  final String? placaDetectada;
  final String? persona;
  final String? zona;

  /// KPI-31 · decidido con caché del Edge. Se marca en la interfaz: un evento
  /// resuelto sin nube es información del usuario, no un detalle interno.
  final bool decididoPorEdge;

  bool get negado => resultado == 'negado';
}

/// Los cuatro chips del mockup M-6.
enum PeriodoDeHistorial { hoy, semana, mes, todo }
