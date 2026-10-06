/// Los adaptadores del hogar del residente (ETAPA 15-I, RONDA 15-W): primer
/// ingreso, cambio de vivienda, ocupantes, perfil, vehículos propios y la
/// contraseña.
///
/// Misma regla que `repositorio_api.dart`: el cliente GENERADO adentro, las
/// entidades del dominio afuera. Ningún DTO ni `DioException` cruza esta
/// frontera, y ningún texto que la app y la consola deban decir igual —el aviso
/// de las plazas con su tope, la explicación del tope de vehículos— se inventa
/// aquí: se pasa tal como lo manda el servidor.
library;

import 'package:dio/dio.dart';

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/hogar.dart';
import 'cuerpo_de_error.dart';
import 'generado/clients/cuentas_api.dart';
import 'generado/clients/residente_api.dart';
import 'generado/models/alta_de_mi_vivienda_dto.dart';
import 'generado/models/cambio_de_contrasena_dto.dart';
import 'generado/models/campo_rechazado_dto.dart';
import 'generado/models/declaracion_de_ocupantes_dto.dart';
import 'generado/models/edicion_de_vehiculo_propio_dto.dart';
import 'generado/models/mis_ocupantes_dto.dart';
import 'generado/models/perfil_del_residente_dto.dart';
import 'generado/models/perfil_dto.dart';
import 'generado/models/perfil_dto_tipo_documento.dart';
import 'generado/models/primer_ingreso_dto.dart';
import 'generado/models/primer_ingreso_dto_tipo_documento.dart';
import 'generado/models/resultado_de_alta_dto.dart';
import 'generado/models/vehiculo_eliminado_dto_resultado.dart';
import 'generado/models/vehiculo_propio_dto.dart';
import 'generado/models/vehiculo_propio_dto_tipo.dart';
import 'soporte_de_api.dart';

class AltaPorApi implements RepositorioDeAlta {
  AltaPorApi({required ResidenteApi api, required SesionEnUso sesion})
    : _api = api,
      _sesion = sesion;

  final ResidenteApi _api;
  final SesionEnUso _sesion;

  String get _copropiedad => copropiedadDeLaSesion(_sesion);

  @override
  Future<EstadoDeAlta> miAlta() => pedirALaApi(() async {
    final d = await _api.miAltaControllerEstado(id: _copropiedad);
    return EstadoDeAlta(
      completa: d.completa,
      viviendaVinculada: d.viviendaVinculada,
      debeDeclararOcupantes: d.debeDeclararOcupantes,
      viviendaAsignada: d.viviendaAsignada,
      vocabulario: VocabularioDeAlta(
        copropiedad: d.vocabulario.copropiedadNombre,
        tipo: d.vocabulario.tipo,
        etiquetaVivienda: d.vocabulario.etiquetaVivienda,
        etiquetaAgrupacion: d.vocabulario.etiquetaAgrupacion,
        codigoCorto: d.vocabulario.codigoCorto,
      ),
      pideAgrupacion: d.pideAgrupacion,
      avisoOcupantes: d.avisoOcupantes,
      aviso: d.aviso,
    );
  });

  /// D3 (15-W) · sin vivienda ni código: la cuenta ya trae la suya.
  @override
  Future<ResultadoDeAlta> completarPrimerIngreso(DatosDePrimerIngreso p) {
    final tipo = PrimerIngresoDtoTipoDocumento.fromJson(p.tipoDocumento);
    // Un tipo que el contrato no conoce no se puede serializar: se dice en el
    // campo, en vez de reventar al codificar el cuerpo.
    if (tipo == PrimerIngresoDtoTipoDocumento.$unknown) {
      return Future.value(
        const AltaConErrores({'tipoDocumento': 'Cédula, cédula de extranjería o pasaporte'}),
      );
    }
    return _conCampos(() async {
      final d = await _api.miAltaControllerAlta(
        id: _copropiedad,
        body: PrimerIngresoDto(
          nombres: p.nombres,
          apellidos: p.apellidos,
          tipoDocumento: tipo,
          numeroDocumento: p.numeroDocumento,
          telefono: p.telefono,
          fechaNacimiento: p.fechaNacimiento,
          correo: p.correo,
        ),
      );
      return resultadoDeAlta(d);
    });
  }

  /// 3.5 · siempre con el código de una plaza libre de la vivienda de destino.
  @override
  Future<ResultadoDeAlta> cambiarDeVivienda(SolicitudDeCambioDeVivienda s) => _conCampos(() async {
    final d = await _api.miAltaControllerCambioDeVivienda(
      id: _copropiedad,
      body: AltaDeMiViviendaDto(
        perfil: perfilDto(s.perfil),
        identificador: s.identificador,
        agrupacion: s.agrupacion,
        codigo: s.codigo,
      ),
    );
    return resultadoDeAlta(d);
  });

  /// El servidor contesta los CAMPOS rechazados con un 400: se devuelven como
  /// resultado, campo por campo, y no como un fallo con un texto suelto.
  Future<ResultadoDeAlta> _conCampos(Future<ResultadoDeAlta> Function() llamada) async {
    try {
      return await llamada();
    } on DioException catch (e) {
      final campos = e.response?.statusCode == 400
          ? camposDelRechazo(e.response?.data)
          : const <String, String>{};
      if (campos.isNotEmpty) return AltaConErrores(campos);
      throw falloDeDio(e);
    }
  }

  @override
  Future<MisOcupantes> misOcupantes() => pedirALaApi(() async {
    return ocupantesDe(await _api.miAltaControllerOcupantes(id: _copropiedad));
  });

  @override
  Future<MisOcupantes> declararOcupantes(int numero) => pedirALaApi(() async {
    final d = await _api.miAltaControllerDeclararOcupantes(
      id: _copropiedad,
      // 15-W · la declaración ya no es definitiva: la confirmación que pedía
      // el servidor está obsoleta y no se envía.
      body: DeclaracionDeOcupantesDto(numero: numero),
    );
    return ocupantesDe(d);
  });
}

class HogarPorApi implements RepositorioDelHogar {
  HogarPorApi({required ResidenteApi api, required SesionEnUso sesion})
    : _api = api,
      _sesion = sesion;

  final ResidenteApi _api;
  final SesionEnUso _sesion;

  String get _copropiedad => copropiedadDeLaSesion(_sesion);

  @override
  Future<PerfilDelResidente> miPerfil() => pedirALaApi(() async {
    return perfilDe(await _api.miHogarControllerPerfil(id: _copropiedad));
  });

  @override
  Future<ResultadoDePerfil> editarPerfil(DatosDePerfil datos) => pedirALaApi(() async {
    final d = await _api.miHogarControllerEditar(id: _copropiedad, body: perfilDto(datos));
    final guardado = d.perfil;
    if (d.guardado && guardado != null) return PerfilGuardado(perfilDe(guardado));
    if (d.campos.isNotEmpty) return PerfilConErrores(camposDe(d.campos));
    return PerfilRechazado(switch (d.motivo?.json) {
      'DOCUMENTO_EN_USO' =>
        'Ese documento ya pertenece a otra persona del conjunto. Consulte con la administración.',
      'SIN_VINCULO' => 'Su cuenta todavía no está vinculada a una vivienda.',
      _ => 'El conjunto no aceptó los cambios. Consulte con la administración.',
    });
  });

  @override
  Future<ResultadoDeVehiculo> registrarVehiculo(NuevoVehiculo v) => pedirALaApi(() async {
    final d = await _api.miHogarControllerVehiculo(
      id: _copropiedad,
      body: VehiculoPropioDto(
        placa: v.placa,
        color: v.color,
        modelo: v.modelo,
        marca: v.marca,
        tipo: VehiculoPropioDtoTipo.fromJson(v.tipo),
        ocupantes: v.ocupantes,
      ),
    );
    final id = d.id;
    if (d.registrado && id != null) return VehiculoRegistrado(id);
    return VehiculoRechazado(
      motivo: d.motivo?.json ?? 'DESCONOCIDO',
      explicacion:
          d.explicacion ??
          'El conjunto no permitió registrar este vehículo. Consulte con la administración.',
    );
  });

  /// 15-W (D5) · la placa sólo si no tiene historial: con historial el
  /// servidor contesta 409 con su texto, que llega como `Fallo`.
  @override
  Future<void> editarVehiculo(String vehiculoId, EdicionDeVehiculo c) => pedirALaApi(() async {
    await _api.miHogarControllerEditarVehiculo(
      id: _copropiedad,
      vehiculoId: vehiculoId,
      body: EdicionDeVehiculoPropioDto(
        color: c.color,
        modelo: c.modelo,
        marca: c.marca,
        placa: c.placa,
      ),
    );
  });

  /// 15-W (D5) · sin historial se borra; con historial, baja lógica.
  @override
  Future<EliminacionDeVehiculo> eliminarVehiculo(String vehiculoId) => pedirALaApi(() async {
    final d = await _api.miHogarControllerEliminarVehiculo(
      id: _copropiedad,
      vehiculoId: vehiculoId,
    );
    // Un resultado que esta versión no conozca no se presenta como borrado:
    // la baja lógica es la lectura que no promete de más.
    return d.resultado == VehiculoEliminadoDtoResultado.borrado
        ? EliminacionDeVehiculo.borrado
        : EliminacionDeVehiculo.dadoDeBaja;
  });
}

class CuentaPorApi implements ServicioDeCuenta {
  CuentaPorApi({required CuentasApi api}) : _api = api;
  final CuentasApi _api;

  @override
  Future<void> cambiarContrasena({required String actual, required String nueva}) =>
      pedirALaApi(() async {
        await _api.cuentasControllerContrasena(
          body: CambioDeContrasenaDto(actual: actual, nueva: nueva),
        );
      });
}

// ─── Traducciones ─────────────────────────────────────────────────────────────

PerfilDto perfilDto(DatosDePerfil p) => PerfilDto(
  nombres: p.nombres,
  apellidos: p.apellidos,
  fechaNacimiento: p.fechaNacimiento,
  tipoDocumento: PerfilDtoTipoDocumento.fromJson(p.tipoDocumento),
  numeroDocumento: p.numeroDocumento,
  correo: p.correo,
  telefono: p.telefono,
);

Map<String, String> camposDe(List<CampoRechazadoDto> campos) => {
  for (final c in campos) c.campo: c.motivo,
};

ResultadoDeAlta resultadoDeAlta(ResultadoDeAltaDto d) {
  if (d.vinculada) return AltaHecha(debeDeclararOcupantes: d.debeDeclararOcupantes);
  if (d.campos.isNotEmpty) return AltaConErrores(camposDe(d.campos));
  final motivo = d.motivo?.json ?? 'DESCONOCIDO';
  // El texto es el del servidor; el del dominio sólo si no mandó ninguno.
  return AltaRechazada(motivo: motivo, explicacion: d.explicacion ?? explicacionDeAlta(motivo));
}

MisOcupantes ocupantesDe(MisOcupantesDto d) => MisOcupantes(
  declarados: d.declarados.toInt(),
  declarada: d.declarada,
  aviso: d.aviso,
  tope: d.tope.toInt(),
  esTitular: d.esTitular,
  plazas: d.plazas
      .map(
        (p) => PlazaDeOcupante(
          id: p.id,
          numero: p.numero.toInt(),
          libre: p.libre,
          codigo: p.codigo,
          ocupante: p.ocupante,
          sinCuenta: p.sinCuenta,
        ),
      )
      .toList(growable: false),
);

PerfilDelResidente perfilDe(PerfilDelResidenteDto d) => PerfilDelResidente(
  nombres: d.nombres,
  apellidos: d.apellidos,
  nombreCompleto: d.nombreCompleto,
  fechaNacimiento: d.fechaNacimiento,
  tipoDocumento: d.tipoDocumento,
  numeroDocumento: d.numeroDocumento,
  correo: d.correo,
  telefono: d.telefono,
  copropiedadNombre: d.copropiedadNombre,
  copropiedadDireccion: d.copropiedadDireccion,
  telefonoPorteria: d.telefonoPorteria,
);
