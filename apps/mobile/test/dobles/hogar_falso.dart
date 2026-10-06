import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/puertos.dart';

/// Dobles del hogar (15-I, 15-W). Implementan los PUERTOS, no el cliente HTTP:
/// las pantallas y la puerta del primer ingreso se prueban sin red.
const avisoDePrueba =
    'Usted gestiona las plazas de su vivienda: hasta 4 en total, contándose usted. Puede añadir '
    'plazas y retirar las libres; para más, pídalo a la administración.';

EstadoDeAlta estadoDeAlta({
  bool vinculada = true,
  bool asignada = true,
  bool declarar = false,
  bool pideAgrupacion = false,
  String? aviso,
}) =>
    EstadoDeAlta(
      completa: vinculada && !declarar,
      viviendaVinculada: vinculada,
      viviendaAsignada: vinculada || asignada,
      debeDeclararOcupantes: declarar,
      vocabulario: const VocabularioDeAlta(
        copropiedad: 'Conjunto de prueba',
        tipo: 'casas',
        etiquetaVivienda: 'Casa',
        etiquetaAgrupacion: 'Manzana',
        codigoCorto: 'MIRA',
      ),
      pideAgrupacion: pideAgrupacion,
      avisoOcupantes: avisoDePrueba,
      aviso: aviso,
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

/// La vivienda del titular: su plaza, una libre con código y el tope de 4.
const ocupantesDePrueba = MisOcupantes(
  declarados: 2,
  declarada: true,
  aviso: avisoDePrueba,
  tope: 4,
  esTitular: true,
  plazas: [
    PlazaDeOcupante(id: 'p1', numero: 1, libre: false, codigo: null, ocupante: 'Ana Pérez'),
    PlazaDeOcupante(id: 'p2', numero: 2, libre: true, codigo: 'MIRA-ABCD-EFGH', ocupante: null),
  ],
);

class AltaFalsa implements RepositorioDeAlta {
  AltaFalsa({
    List<EstadoDeAlta>? estados,
    this.respuestaAlta,
    this.falloDeclarar,
    this.ocupantes = ocupantesDePrueba,
  }) : estados = estados ?? [estadoDeAlta()];

  /// Uno por consulta; el último se repite.
  final List<EstadoDeAlta> estados;
  ResultadoDeAlta? respuestaAlta;
  final Fallo? falloDeclarar;
  Fallo? falloConsulta;
  MisOcupantes ocupantes;
  int consultas = 0;
  final List<DatosDePrimerIngreso> primerosIngresos = [];
  final List<SolicitudDeCambioDeVivienda> cambios = [];
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
  Future<ResultadoDeAlta> completarPrimerIngreso(DatosDePrimerIngreso datos) async {
    primerosIngresos.add(datos);
    return respuestaAlta ?? const AltaHecha(debeDeclararOcupantes: false);
  }

  @override
  Future<ResultadoDeAlta> cambiarDeVivienda(SolicitudDeCambioDeVivienda s) async {
    cambios.add(s);
    return respuestaAlta ?? const AltaHecha(debeDeclararOcupantes: false);
  }

  @override
  Future<MisOcupantes> misOcupantes() async => ocupantes;

  @override
  Future<MisOcupantes> declararOcupantes(int numero) async {
    final f = falloDeclarar;
    if (f != null) throw f;
    declaraciones.add(numero);
    return misOcupantes();
  }
}

class HogarFalso implements RepositorioDelHogar {
  HogarFalso({
    this.perfil = perfilDePrueba,
    this.respuestaVehiculo,
    this.eliminacion = EliminacionDeVehiculo.borrado,
    this.falloAlEditar,
  });
  PerfilDelResidente perfil;
  ResultadoDeVehiculo? respuestaVehiculo;

  /// Lo que contesta el servidor al eliminar.
  EliminacionDeVehiculo eliminacion;

  /// Un rechazo del servidor al editar (la placa con historial, por ejemplo).
  Fallo? falloAlEditar;
  final List<NuevoVehiculo> vehiculos = [];
  final List<(String, EdicionDeVehiculo)> ediciones = [];
  final List<String> eliminados = [];
  final List<DatosDePerfil> perfiles = [];

  @override
  Future<PerfilDelResidente> miPerfil() async => perfil;

  @override
  Future<ResultadoDePerfil> editarPerfil(DatosDePerfil datos) async {
    perfiles.add(datos);
    return PerfilGuardado(perfil);
  }

  @override
  Future<ResultadoDeVehiculo> registrarVehiculo(NuevoVehiculo v) async {
    vehiculos.add(v);
    return respuestaVehiculo ?? const VehiculoRegistrado('veh-1');
  }

  @override
  Future<void> editarVehiculo(String vehiculoId, EdicionDeVehiculo cambios) async {
    // Se anota antes de contestar: la prueba mira qué se PIDIÓ, aceptado o no.
    ediciones.add((vehiculoId, cambios));
    final f = falloAlEditar;
    if (f != null) throw f;
  }

  @override
  Future<EliminacionDeVehiculo> eliminarVehiculo(String vehiculoId) async {
    eliminados.add(vehiculoId);
    return eliminacion;
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

/// Un miembro de la familia para los formularios que lo piden.
const anaTitular = MiembroDeFamilia(
  residenteId: 'r-1',
  nombre: 'Ana Pérez',
  parentesco: null,
  esTitular: true,
  nivelAcceso: null,
  activo: true,
);
