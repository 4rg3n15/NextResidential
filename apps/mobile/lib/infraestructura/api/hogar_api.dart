/// Los adaptadores del hogar del residente (ETAPA 15-I): alta, ocupantes,
/// perfil, vehículos propios, consentimiento del visitante y la contraseña.
///
/// Misma regla que `repositorio_api.dart`: el cliente GENERADO adentro, las
/// entidades del dominio afuera. Ningún DTO ni `DioException` cruza esta
/// frontera, y ningún texto que la app y la consola deban decir igual —el aviso
/// DEFINITIVO de los ocupantes, la explicación del tope— se inventa aquí: se
/// pasa tal como lo manda el servidor.
library;

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/hogar.dart';
import 'generado/clients/cuentas_api.dart';
import 'generado/clients/residente_api.dart';
import 'generado/models/alta_de_mi_vivienda_dto.dart';
import 'generado/models/cambio_de_contrasena_dto.dart';
import 'generado/models/campo_rechazado_dto.dart';
import 'generado/models/declaracion_de_ocupantes_dto.dart';
import 'generado/models/estado_de_consentimiento_dto_estado.dart';
import 'generado/models/mis_ocupantes_dto.dart';
import 'generado/models/perfil_del_residente_dto.dart';
import 'generado/models/perfil_dto.dart';
import 'generado/models/perfil_dto_tipo_documento.dart';
import 'generado/models/resultado_de_alta_dto.dart';
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
      vocabulario: VocabularioDeAlta(
        copropiedad: d.vocabulario.copropiedadNombre,
        tipo: d.vocabulario.tipo,
        etiquetaVivienda: d.vocabulario.etiquetaVivienda,
        etiquetaAgrupacion: d.vocabulario.etiquetaAgrupacion,
      ),
      pideAgrupacion: d.pideAgrupacion,
      avisoOcupantes: d.avisoOcupantes,
    );
  });

  @override
  Future<ResultadoDeAlta> completarAlta(SolicitudDeAlta s, {bool cambio = false}) =>
      pedirALaApi(() async {
        final cuerpo = AltaDeMiViviendaDto(
          perfil: perfilDto(s.perfil),
          identificador: s.identificador,
          agrupacion: s.agrupacion,
          codigo: s.codigo,
        );
        final d = cambio
            ? await _api.miAltaControllerCambioDeVivienda(id: _copropiedad, body: cuerpo)
            : await _api.miAltaControllerAlta(id: _copropiedad, body: cuerpo);
        return resultadoDeAlta(d);
      });

  @override
  Future<MisOcupantes> misOcupantes() => pedirALaApi(() async {
    return ocupantesDe(await _api.miAltaControllerOcupantes(id: _copropiedad));
  });

  @override
  Future<MisOcupantes> declararOcupantes(int numero) => pedirALaApi(() async {
    final d = await _api.miAltaControllerDeclararOcupantes(
      id: _copropiedad,
      // La confirmación la exige el servidor: la app sólo la envía después
      // de que el residente leyó el aviso y pulsó «Confirmar».
      body: DeclaracionDeOcupantesDto(numero: numero, confirmoQueEsDefinitivo: true),
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

  @override
  Future<bool> desactivarVehiculo(String vehiculoId) => pedirALaApi(() async {
    final d = await _api.miHogarControllerDesactivar(id: _copropiedad, vehiculoId: vehiculoId);
    return d.desactivado;
  });

  @override
  Future<EstadoDeConsentimiento> estadoDelConsentimiento({
    required String autorizacionId,
    required String consentimientoId,
  }) => pedirALaApi(() async {
    final d = await _api.miHogarControllerEstadoDelConsentimiento(
      id: _copropiedad,
      autorizacionId: autorizacionId,
      consentimientoId: consentimientoId,
    );
    return switch (d.estado) {
      EstadoDeConsentimientoDtoEstado.aceptado => EstadoDeConsentimiento.aceptado,
      EstadoDeConsentimientoDtoEstado.rechazado => EstadoDeConsentimiento.rechazado,
      EstadoDeConsentimientoDtoEstado.revocado => EstadoDeConsentimiento.revocado,
      EstadoDeConsentimientoDtoEstado.expirado => EstadoDeConsentimiento.expirado,
      // Un estado que el servidor añada mañana NO se pinta como aceptado:
      // «pendiente» es la lectura que no promete nada que no ocurrió.
      _ => EstadoDeConsentimiento.pendiente,
    };
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
  return AltaRechazada(
    motivo: d.motivo?.json ?? 'DESCONOCIDO',
    explicacion:
        d.explicacion ?? 'El conjunto no permitió la vinculación. Consulte con la administración.',
  );
}

MisOcupantes ocupantesDe(MisOcupantesDto d) => MisOcupantes(
  declarados: d.declarados.toInt(),
  declarada: d.declarada,
  aviso: d.aviso,
  plazas: d.plazas
      .map(
        (p) => PlazaDeOcupante(
          id: p.id,
          numero: p.numero.toInt(),
          libre: p.libre,
          codigo: p.codigo,
          ocupante: p.ocupante,
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
