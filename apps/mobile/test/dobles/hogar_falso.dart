import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/puertos.dart';

/// Dobles del hogar (15-I). Implementan los PUERTOS, no el cliente HTTP: las
/// pantallas y la puerta del primer ingreso se prueban sin red.
const avisoDePrueba = 'El número de ocupantes es DEFINITIVO: sólo el superadministrador lo cambia.';

EstadoDeAlta estadoDeAlta({
  bool vinculada = true,
  bool declarar = false,
  bool pideAgrupacion = false,
}) =>
    EstadoDeAlta(
      completa: vinculada && !declarar,
      viviendaVinculada: vinculada,
      debeDeclararOcupantes: declarar,
      vocabulario: const VocabularioDeAlta(
        copropiedad: 'Conjunto de prueba',
        tipo: 'casas',
        etiquetaVivienda: 'Casa',
        etiquetaAgrupacion: 'Manzana',
      ),
      pideAgrupacion: pideAgrupacion,
      avisoOcupantes: avisoDePrueba,
    );

const perfilDePrueba = PerfilDelResidente(
  nombres: 'Ana',
  apellidos: 'Pérez',
  nombreCompleto: 'Ana Pérez',
  fechaNacimiento: null,
  tipoDocumento: 'cedula',
  numeroDocumento: '1000000001',
  correo: 'ana@ejemplo.invalid',
  telefono: '+573000000001',
  copropiedadNombre: 'Conjunto de prueba',
  copropiedadDireccion: 'Calle inventada 00',
  telefonoPorteria: '+576015550100',
);

class AltaFalsa implements RepositorioDeAlta {
  AltaFalsa({List<EstadoDeAlta>? estados, this.respuestaAlta, this.falloDeclarar})
      : estados = estados ?? [estadoDeAlta()];

  /// Uno por consulta; el último se repite.
  final List<EstadoDeAlta> estados;
  ResultadoDeAlta? respuestaAlta;
  final Fallo? falloDeclarar;
  Fallo? falloConsulta;
  int consultas = 0;
  final List<SolicitudDeAlta> solicitudes = [];
  final List<bool> cambios = [];
  final List<int> declaraciones = [];

  @override
  Future<EstadoDeAlta> miAlta() async {
    final f = falloConsulta;
    if (f != null) throw f;
    final e = estados[consultas < estados.length ? consultas : estados.length - 1];
    consultas += 1;
    return e;
  }

  @override
  Future<ResultadoDeAlta> completarAlta(SolicitudDeAlta s, {bool cambio = false}) async {
    solicitudes.add(s);
    cambios.add(cambio);
    return respuestaAlta ?? const AltaHecha(debeDeclararOcupantes: false);
  }

  @override
  Future<MisOcupantes> misOcupantes() async => const MisOcupantes(
        declarados: 2,
        declarada: true,
        aviso: avisoDePrueba,
        plazas: [
          PlazaDeOcupante(id: 'p1', numero: 1, libre: false, codigo: null, ocupante: 'Ana Pérez'),
          PlazaDeOcupante(id: 'p2', numero: 2, libre: true, codigo: 'ABCD-EFGH', ocupante: null),
        ],
      );

  @override
  Future<MisOcupantes> declararOcupantes(int numero) async {
    final f = falloDeclarar;
    if (f != null) throw f;
    declaraciones.add(numero);
    return misOcupantes();
  }
}

class HogarFalso implements RepositorioDelHogar {
  HogarFalso({this.perfil = perfilDePrueba, this.respuestaVehiculo, this.desactiva = true});
  PerfilDelResidente perfil;
  ResultadoDeVehiculo? respuestaVehiculo;
  final bool desactiva;
  EstadoDeConsentimiento consentimiento = EstadoDeConsentimiento.pendiente;
  final List<NuevoVehiculo> vehiculos = [];
  final List<String> bajas = [];
  final List<DatosDePerfil> ediciones = [];
  int consultasDeConsentimiento = 0;

  @override
  Future<PerfilDelResidente> miPerfil() async => perfil;

  @override
  Future<ResultadoDePerfil> editarPerfil(DatosDePerfil datos) async {
    ediciones.add(datos);
    return PerfilGuardado(perfil);
  }

  @override
  Future<ResultadoDeVehiculo> registrarVehiculo(NuevoVehiculo v) async {
    vehiculos.add(v);
    return respuestaVehiculo ?? const VehiculoRegistrado('veh-1');
  }

  @override
  Future<bool> desactivarVehiculo(String vehiculoId) async {
    bajas.add(vehiculoId);
    return desactiva;
  }

  @override
  Future<EstadoDeConsentimiento> estadoDelConsentimiento({
    required String autorizacionId,
    required String consentimientoId,
  }) async {
    consultasDeConsentimiento += 1;
    return consentimiento;
  }
}

class CuentaFalsa implements ServicioDeCuenta {
  CuentaFalsa({this.fallo});
  final Fallo? fallo;
  final List<(String, String)> cambios = [];

  @override
  Future<void> cambiarContrasena({required String actual, required String nueva}) async {
    final f = fallo;
    if (f != null) throw f;
    cambios.add((actual, nueva));
  }
}

class LlamadorFalso implements LlamadorDeTelefono {
  LlamadorFalso({this.puede = true});
  final bool puede;
  final List<String> llamadas = [];

  @override
  Future<bool> llamar(String numero) async {
    llamadas.add(numero);
    return puede;
  }
}

class CompartidorFalso implements Compartidor {
  final List<String> compartidos = [];

  @override
  Future<void> compartir(String texto) async => compartidos.add(texto);
}
