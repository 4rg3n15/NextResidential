/// El hogar del residente: alta, ocupantes, perfil y vehículos propios (15-I).
///
/// Entidades y puertos, sin Dio ni plataforma. Los textos que la app y la
/// consola tienen que decir igual —el aviso de que el número de ocupantes es
/// DEFINITIVO, la explicación del tope de vehículos— NO se escriben aquí: los
/// manda el servidor, que los saca del dominio compartido. Si la app los
/// reescribiera, el día que cambien habría dos versiones y una sería falsa.
library;

/// Cómo llama ESTA copropiedad a sus viviendas (nunca codificado, 3.2).
class VocabularioDeAlta {
  const VocabularioDeAlta({
    required this.copropiedad,
    required this.tipo,
    required this.etiquetaVivienda,
    required this.etiquetaAgrupacion,
  });
  final String copropiedad;
  final String? tipo;
  final String etiquetaVivienda;
  final String etiquetaAgrupacion;
}

class EstadoDeAlta {
  const EstadoDeAlta({
    required this.completa,
    required this.viviendaVinculada,
    required this.debeDeclararOcupantes,
    required this.vocabulario,
    required this.pideAgrupacion,
    required this.avisoOcupantes,
  });
  final bool completa;
  final bool viviendaVinculada;
  final bool debeDeclararOcupantes;
  final VocabularioDeAlta vocabulario;

  /// En un conjunto de apartamentos la torre es obligatoria.
  final bool pideAgrupacion;

  /// El texto que se muestra ANTES de confirmar la declaración (D6).
  final String avisoOcupantes;
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

class SolicitudDeAlta {
  const SolicitudDeAlta({
    required this.perfil,
    required this.identificador,
    required this.agrupacion,
    required this.codigo,
  });
  final DatosDePerfil perfil;
  final String identificador;
  final String? agrupacion;

  /// `null` = marcó «no lo tengo» (sólo vale si la vivienda no tiene cuenta).
  final String? codigo;
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
}

/// Campos que el servidor rechazó, por nombre. Nunca con el valor escrito.
final class AltaConErrores extends ResultadoDeAlta {
  const AltaConErrores(this.campos);
  final Map<String, String> campos;
}

class PlazaDeOcupante {
  const PlazaDeOcupante({
    required this.id,
    required this.numero,
    required this.libre,
    required this.codigo,
    required this.ocupante,
  });
  final String id;
  final int numero;
  final bool libre;

  /// Sólo en las libres: «ABCD-EFGH», para dárselo a quien vive con él.
  final String? codigo;
  final String? ocupante;
}

class MisOcupantes {
  const MisOcupantes({
    required this.declarados,
    required this.declarada,
    required this.plazas,
    required this.aviso,
  });
  final int declarados;
  final bool declarada;
  final List<PlazaDeOcupante> plazas;
  final String aviso;

  List<PlazaDeOcupante> get libres => plazas.where((p) => p.libre).toList();
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

/// RN-10 · lo que respondió el VISITANTE, no el residente.
enum EstadoDeConsentimiento { pendiente, aceptado, rechazado, revocado, expirado }

/// Alta y ocupantes (3.2, 3.3). Ninguna recibe la vivienda del vecino: la del
/// alta se busca por número y exige código si ya hay alguien dentro.
abstract interface class RepositorioDeAlta {
  Future<EstadoDeAlta> miAlta();
  Future<ResultadoDeAlta> completarAlta(SolicitudDeAlta solicitud, {bool cambio = false});
  Future<MisOcupantes> misOcupantes();

  /// D6 · una vez y definitivo; lanza `Fallo(sinPermiso)` si ya se declaró.
  Future<MisOcupantes> declararOcupantes(int numero);
}

/// Perfil, vehículos propios y el consentimiento del visitante (3.4, 3.5, 5).
abstract interface class RepositorioDelHogar {
  Future<PerfilDelResidente> miPerfil();
  Future<ResultadoDePerfil> editarPerfil(DatosDePerfil datos);
  Future<ResultadoDeVehiculo> registrarVehiculo(NuevoVehiculo vehiculo);
  Future<bool> desactivarVehiculo(String vehiculoId);
  Future<EstadoDeConsentimiento> estadoDelConsentimiento({
    required String autorizacionId,
    required String consentimientoId,
  });
}

/// ADR-023 · el cambio de contraseña de la propia cuenta.
abstract interface class ServicioDeCuenta {
  Future<void> cambiarContrasena({required String actual, required String nueva});
}

/// D7 · el marcador del teléfono. `false` si el aparato no puede llamar.
abstract interface class LlamadorDeTelefono {
  Future<bool> llamar(String numero);
}

/// Punto 5 · el panel nativo de compartir (WhatsApp, SMS…).
abstract interface class Compartidor {
  Future<void> compartir(String texto);
}

/// Punto 5 · la API devuelve la URL completa si declara `API_URL_PUBLICA` y, si
/// no, sólo la ruta (`/consentimiento/<token>`). Una ruta suelta no le sirve al
/// visitante, así que se completa con la URL de la API con la que habla la app.
String enlaceParaCompartir(String enlace, String urlDeLaApi) {
  if (enlace.startsWith('http://') || enlace.startsWith('https://')) return enlace;
  final base = urlDeLaApi.endsWith('/')
      ? urlDeLaApi.substring(0, urlDeLaApi.length - 1)
      : urlDeLaApi;
  return '$base${enlace.startsWith('/') ? '' : '/'}$enlace';
}

/// El texto que acompaña al enlace en el panel de compartir. Dice QUIÉN decide:
/// el visitante, no el residente (RN-10).
String mensajeParaElVisitante(String titular, String enlace) =>
    'Hola, $titular. Para entrar con reconocimiento facial necesito que usted mismo '
    'acepte o rechace el uso de su foto. Es un enlace de un solo uso: $enlace';
