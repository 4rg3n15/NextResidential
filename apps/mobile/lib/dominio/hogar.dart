/// El hogar del residente: alta, ocupantes, perfil y vehículos propios (15-I,
/// 15-W).
///
/// Entidades y puertos, sin Dio ni plataforma. Los textos que la app y la
/// consola tienen que decir igual —el aviso de las plazas con su tope, la
/// explicación del tope de vehículos— NO se escriben aquí: los manda el
/// servidor, que los saca del dominio compartido. Si la app los reescribiera,
/// el día que cambien habría dos versiones y una sería falsa.
library;

import 'plazas.dart';
import 'primer_ingreso.dart';
import 'vehiculos_propios.dart';

export 'plazas.dart';
export 'primer_ingreso.dart';
export 'vehiculos_propios.dart';

/// Cómo llama ESTA copropiedad a sus viviendas (nunca codificado, 3.2).
class VocabularioDeAlta {
  const VocabularioDeAlta({
    required this.copropiedad,
    required this.tipo,
    required this.etiquetaVivienda,
    required this.etiquetaAgrupacion,
    this.codigoCorto,
  });
  final String copropiedad;
  final String? tipo;
  final String etiquetaVivienda;
  final String etiquetaAgrupacion;

  /// 15-W · el prefijo de sus códigos de plaza («MIRA»). `null` si aún no
  /// tiene.
  final String? codigoCorto;
}

class EstadoDeAlta {
  const EstadoDeAlta({
    required this.completa,
    required this.viviendaVinculada,
    required this.viviendaAsignada,
    required this.debeDeclararOcupantes,
    required this.vocabulario,
    required this.pideAgrupacion,
    required this.avisoOcupantes,
    required this.aviso,
  });
  final bool completa;
  final bool viviendaVinculada;

  /// 15-W · la cuenta ya trae vivienda, asignada o vinculada. Sin ella, el
  /// primer ingreso no tiene nada que completar todavía.
  final bool viviendaAsignada;
  final bool debeDeclararOcupantes;
  final VocabularioDeAlta vocabulario;

  /// En un conjunto de apartamentos la torre es obligatoria (cambio de
  /// vivienda).
  final bool pideAgrupacion;

  /// El texto de las plazas, con el tope de la vivienda.
  final String avisoOcupantes;

  /// 15-W · lo que lee una cuenta sin vivienda; `null` si la tiene.
  final String? aviso;
}

/// Datos personales y de CONTACTO (no de acceso: no hay SMTP, D9).
class DatosDePerfil {
  const DatosDePerfil({
    required this.nombres,
    required this.apellidos,
    required this.fechaNacimiento,
    required this.tipoDocumento,
    required this.numeroDocumento,
    required this.correo,
    required this.telefono,
  });
  final String nombres;
  final String apellidos;

  /// `AAAA-MM-DD`, o `null`.
  final String? fechaNacimiento;
  final String tipoDocumento;
  final String numeroDocumento;
  final String correo;
  final String telefono;
}

const tiposDeDocumento = <String, String>{
  'cedula': 'Cédula de ciudadanía',
  'cedula_extranjeria': 'Cédula de extranjería',
  'pasaporte': 'Pasaporte',
  'otro': 'Otro',
};

/// 3.5 · el cambio de vivienda desde el perfil: siempre con el código de una
/// plaza libre de la vivienda de destino, con o sin el prefijo del conjunto.
class SolicitudDeCambioDeVivienda {
  const SolicitudDeCambioDeVivienda({
    required this.perfil,
    required this.identificador,
    required this.agrupacion,
    required this.codigo,
  });
  final DatosDePerfil perfil;
  final String identificador;
  final String? agrupacion;
  final String codigo;
}

sealed class ResultadoDeAlta {
  const ResultadoDeAlta();
}

final class AltaHecha extends ResultadoDeAlta {
  const AltaHecha({required this.debeDeclararOcupantes});
  final bool debeDeclararOcupantes;
}

final class AltaRechazada extends ResultadoDeAlta {
  const AltaRechazada({required this.motivo, required this.explicacion});
  final String motivo;
  final String explicacion;

  /// 15-W · la fecha era de un menor: el servidor bloqueó la cuenta.
  bool get bloqueadaPorEdad => motivo == motivoCuentaBloqueadaPorEdad;

  /// 15-W · la administración aún no le asignó vivienda.
  bool get sinVivienda => motivo == motivoSinVivienda;
}

/// Campos que el servidor rechazó, por nombre. Nunca con el valor escrito.
final class AltaConErrores extends ResultadoDeAlta {
  const AltaConErrores(this.campos);
  final Map<String, String> campos;
}

class PerfilDelResidente {
  const PerfilDelResidente({
    required this.nombres,
    required this.apellidos,
    required this.nombreCompleto,
    required this.fechaNacimiento,
    required this.tipoDocumento,
    required this.numeroDocumento,
    required this.correo,
    required this.telefono,
    required this.copropiedadNombre,
    required this.copropiedadDireccion,
    required this.telefonoPorteria,
  });
  final String? nombres;
  final String? apellidos;
  final String nombreCompleto;
  final String? fechaNacimiento;
  final String? tipoDocumento;
  final String? numeroDocumento;
  final String? correo;
  final String? telefono;
  final String copropiedadNombre;
  final String? copropiedadDireccion;

  /// D7 · `null` = el superadministrador no lo registró: el botón lo dice.
  final String? telefonoPorteria;
}

sealed class ResultadoDePerfil {
  const ResultadoDePerfil();
}

final class PerfilGuardado extends ResultadoDePerfil {
  const PerfilGuardado(this.perfil);
  final PerfilDelResidente perfil;
}

final class PerfilRechazado extends ResultadoDePerfil {
  const PerfilRechazado(this.detalle);
  final String detalle;
}

final class PerfilConErrores extends ResultadoDePerfil {
  const PerfilConErrores(this.campos);
  final Map<String, String> campos;
}

const tiposDeVehiculo = <String, String>{
  'automovil': 'Automóvil',
  'motocicleta': 'Motocicleta',
  'bicicleta': 'Bicicleta',
  'otro': 'Otro',
};

class NuevoVehiculo {
  const NuevoVehiculo({
    required this.placa,
    required this.color,
    required this.modelo,
    required this.marca,
    required this.tipo,
    required this.ocupantes,
  });
  final String placa;
  final String color;
  final String modelo;
  final String? marca;
  final String tipo;

  /// `residenteId` de uno o más ocupantes de la vivienda.
  final List<String> ocupantes;
}

sealed class ResultadoDeVehiculo {
  const ResultadoDeVehiculo();
}

final class VehiculoRegistrado extends ResultadoDeVehiculo {
  const VehiculoRegistrado(this.id);
  final String id;
}

final class VehiculoRechazado extends ResultadoDeVehiculo {
  const VehiculoRechazado({required this.motivo, required this.explicacion});
  final String motivo;
  final String explicacion;

  /// D5 a · desde aquí, el siguiente lo registra el superadministrador.
  bool get esTope => motivo == 'TOPE_ALCANZADO';
}

/// Primer ingreso, cambio de vivienda y ocupantes (D3, 3.5, 3.3). Ninguna
/// recibe la vivienda: la del primer ingreso es la de la cuenta, y la del
/// cambio se busca por número y exige el código de una plaza libre.
abstract interface class RepositorioDeAlta {
  Future<EstadoDeAlta> miAlta();
  Future<ResultadoDeAlta> completarPrimerIngreso(DatosDePrimerIngreso datos);
  Future<ResultadoDeAlta> cambiarDeVivienda(SolicitudDeCambioDeVivienda solicitud);
  Future<MisOcupantes> misOcupantes();

  /// D6 · el titular, una vez, de 1 al tope; lanza `Fallo(sinPermiso)` si ya
  /// se declaró. Después, las plazas se añaden y retiran una a una.
  Future<MisOcupantes> declararOcupantes(int numero);
}

/// Perfil y vehículos propios (3.4, 3.5). Editar y eliminar rechazan con un
/// `Fallo` que lleva el texto del servidor (la placa con historial, la placa
/// duplicada, el vehículo que registró la administración).
abstract interface class RepositorioDelHogar {
  Future<PerfilDelResidente> miPerfil();
  Future<ResultadoDePerfil> editarPerfil(DatosDePerfil datos);
  Future<ResultadoDeVehiculo> registrarVehiculo(NuevoVehiculo vehiculo);
  Future<void> editarVehiculo(String vehiculoId, EdicionDeVehiculo cambios);
  Future<EliminacionDeVehiculo> eliminarVehiculo(String vehiculoId);
}

/// ADR-023 · el cambio de contraseña de la propia cuenta.
abstract interface class ServicioDeCuenta {
  Future<void> cambiarContrasena({required String actual, required String nueva});
}

/// D7 · el marcador del teléfono. `false` si el aparato no puede llamar.
abstract interface class LlamadorDeTelefono {
  Future<bool> llamar(String numero);
}
