import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/menores.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/registro.dart';
import 'package:ncr_residente/dominio/revocacion.dart';

import 'hogar_falso.dart';

/// Dobles de la RONDA 15-W: «Crear cuenta», los menores del hogar, las plazas
/// del titular y la revocación de una visita. Implementan los PUERTOS: las
/// pantallas se prueban sin red, con el servidor que la prueba gobierna.

const politicaDePrueba = PoliticaDeDatos(
  version: 'version-de-prueba-1',
  texto: 'Autorizo el tratamiento de mis datos con la única finalidad de gestionar el acceso.',
);

class RegistroFalso implements ServicioDeRegistro {
  RegistroFalso({this.politica = politicaDePrueba, this.respuesta = const CuentaCreada()});

  PoliticaDeDatos politica;

  /// Lo que contesta el servidor al registrar.
  ResultadoDeRegistro respuesta;

  /// Si no es `null`, la política no llega.
  Fallo? falloDePolitica;
  int lecturasDePolitica = 0;
  final List<SolicitudDeRegistro> solicitudes = [];

  @override
  Future<PoliticaDeDatos> politicaVigente() async {
    lecturasDePolitica += 1;
    final f = falloDePolitica;
    if (f != null) throw f;
    return politica;
  }

  @override
  Future<ResultadoDeRegistro> registrar(SolicitudDeRegistro solicitud) async {
    solicitudes.add(solicitud);
    return respuesta;
  }
}

MenorDelHogar menorDePrueba({
  String residenteId = 'r-3',
  String nombre = 'Sofía Pérez',
  int? edad = 11,
}) => MenorDelHogar(
  residenteId: residenteId,
  nombres: nombre.split(' ').first,
  apellidos: nombre.split(' ').last,
  nombreCompleto: nombre,
  fechaNacimiento: '2015-08-21',
  edad: edad,
  tipoDocumento: 'tarjeta_identidad',
  documento: '••••5678',
  parentesco: 'Hija',
  plazaId: 'p3',
  plazaNumero: 3,
  tieneRostro: false,
);

class MenoresFalsos implements RepositorioDeMenores {
  MenoresFalsos({List<MenorDelHogar>? lista}) : lista = lista ?? [menorDePrueba()];

  List<MenorDelHogar> lista;

  /// El rechazo del servidor a la siguiente escritura, con su texto.
  Fallo? falloAlEscribir;
  final List<NuevoMenor> registros = [];
  final List<(String, DatosDelMenor)> ediciones = [];
  final List<(String, String)> bajas = [];
  final List<String> traspasos = [];

  void _quizasFalla() {
    final f = falloAlEscribir;
    if (f != null) throw f;
  }

  @override
  Future<List<MenorDelHogar>> misMenores() async => List.of(lista);

  @override
  Future<void> registrarMenor(NuevoMenor menor) async {
    _quizasFalla();
    registros.add(menor);
  }

  @override
  Future<void> editarMenor(String residenteId, DatosDelMenor datos) async {
    _quizasFalla();
    ediciones.add((residenteId, datos));
  }

  @override
  Future<void> darDeBajaMenor(String residenteId, {required String motivo}) async {
    _quizasFalla();
    bajas.add((residenteId, motivo));
    lista = lista.where((m) => m.residenteId != residenteId).toList();
  }

  @override
  Future<String> codigoDeTraspaso(String residenteId) async {
    _quizasFalla();
    traspasos.add(residenteId);
    return 'MIRA-TRAS-PASO';
  }
}

/// Las plazas, sobre el MISMO estado que lee `AltaFalsa.misOcupantes`: lo que
/// se añade o se retira aquí es lo que la pantalla vuelve a leer, como en el
/// servidor de verdad. El tope lo decide aquí «la base».
class PlazasFalsas implements RepositorioDePlazas {
  PlazasFalsas(this.alta);
  final AltaFalsa alta;
  final List<(String, String)> retiros = [];
  int anadidas = 0;

  @override
  Future<MisOcupantes> anadirPlaza() async {
    final o = alta.ocupantes;
    if (o.alTope) {
      throw Fallo(
        ClaseDeFallo.servidor,
        'Su vivienda tiene el máximo de ${o.tope} plazas. Para más, pídalo a la administración.',
      );
    }
    anadidas += 1;
    final numero = o.plazas.length + 1;
    return alta.ocupantes = _con(o, [
      ...o.plazas,
      PlazaDeOcupante(
        id: 'p$numero',
        numero: numero,
        libre: true,
        codigo: 'MIRA-NUEV-A00$numero',
        ocupante: null,
      ),
    ]);
  }

  @override
  Future<MisOcupantes> retirarPlaza(String plazaId, {required String motivo}) async {
    final o = alta.ocupantes;
    final plaza = o.plazas.firstWhere((p) => p.id == plazaId);
    if (!plaza.libre) throw const Fallo(ClaseDeFallo.servidor, 'Primero dé de baja a la persona');
    retiros.add((plazaId, motivo));
    return alta.ocupantes = _con(o, o.plazas.where((p) => p.id != plazaId).toList());
  }

  static MisOcupantes _con(MisOcupantes o, List<PlazaDeOcupante> plazas) => MisOcupantes(
    declarados: plazas.length,
    declarada: o.declarada,
    aviso: o.aviso,
    tope: o.tope,
    esTitular: o.esTitular,
    plazas: plazas,
  );
}

class RevocacionFalsa implements RevocacionDeVisitas {
  RevocacionFalsa({this.fallo});

  /// El rechazo del servidor («La visita ya está revocada»).
  Fallo? fallo;
  final List<(String, String)> revocadas = [];

  @override
  Future<VisitaRevocada> revocar(String autorizacionId, {required String motivo}) async {
    final f = fallo;
    if (f != null) throw f;
    revocadas.add((autorizacionId, motivo));
    return const VisitaRevocada(rostrosSuprimidos: 1, equiposRetirados: 2, equiposPendientes: 0);
  }
}
