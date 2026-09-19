/// El adaptador: cliente GENERADO adentro, entidades del dominio afuera.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LO QUE ESTE FICHERO CONTIENE, Y POR QUÉ ES UNO SOLO
///
/// Todo el conocimiento de que existe HTTP. Los DTO generados no salen de aquí,
/// `DioException` no sale de aquí, y el nombre de ningún campo del JSON aparece
/// en ninguna pantalla. Cuando el contrato cambie, el generador reescribirá el
/// cliente y **este** fichero dejará de compilar: un sitio, señalado por el
/// compilador, en vez de catorce pantallas que fallan en ejecución.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// EL 404 DE «NO TENGO VIVIENDA» NO ES UN ERROR
///
/// La API responde 404 cuando la identidad no tiene vivienda activa asignada.
/// Traducirlo a «error de servidor» pintaría un aspa roja donde el mockup M-1
/// necesita una explicación. Aquí se traduce a `ClaseDeFallo.sinVivienda`, que
/// la interfaz sabe pintar como lo que es: un estado previsto.
library;

import 'package:dio/dio.dart';

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/entidades.dart';
import '../../dominio/puertos.dart';
import 'generado/clients/residente_api.dart';
import 'generado/models/mi_autorizacion_dto.dart';
import 'generado/models/mi_evento_dto.dart';
import 'generado/models/mi_inicio_dto.dart';
import 'generado/models/mi_vehiculo_dto.dart';
import 'generado/models/miembro_de_familia_dto.dart';
import 'generado/models/periodo.dart';

/// Construye el `Dio` de la API con el interceptor de sesión.
///
/// El interceptor hace DOS cosas y el orden importa:
///
/// 1. **Antes de cada petición**, `asegurar()`: si el token está vencido o a
///    punto, se renueva y la petición sale con el nuevo. Ninguna petición sale
///    con un token que ya se sabía muerto (ver `dominio/sesion.dart`).
/// 2. **Ante un 401**, una y solo una renovación forzada y un reintento. Un
///    token puede revocarse en el servidor mientras la app está en primer
///    plano, y la política de caducidad no puede saberlo. El reintento es
///    único: si el segundo 401 llega, la sesión está muerta y insistir es un
///    bucle.
Dio crearDioDeApi({
  required String urlBase,
  required SesionEnUso sesion,
  Dio? base,
}) {
  final dio = base ?? Dio();
  dio.options
    ..baseUrl = urlBase
    ..connectTimeout = const Duration(seconds: 10)
    ..receiveTimeout = const Duration(seconds: 20);

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (opciones, siguiente) async {
        final s = await sesion.asegurar();
        if (s != null) opciones.headers['Authorization'] = 'Bearer ${s.tokenDeAcceso}';
        siguiente.next(opciones);
      },
      onError: (error, siguiente) async {
        final esRechazo = error.response?.statusCode == 401;
        final yaReintentado = error.requestOptions.extra['ncr_reintentado'] == true;
        if (!esRechazo || yaReintentado) return siguiente.next(error);

        final renovada = await sesion.renovarPorRechazo();
        if (renovada == null) return siguiente.next(error);

        final opciones = error.requestOptions
          ..headers['Authorization'] = 'Bearer ${renovada.tokenDeAcceso}'
          ..extra['ncr_reintentado'] = true;
        try {
          final respuesta = await dio.fetch<dynamic>(opciones);
          return siguiente.resolve(respuesta);
        } on DioException catch (e) {
          return siguiente.next(e);
        }
      },
    ),
  );
  return dio;
}

class RepositorioApiDelResidente implements RepositorioDelResidente {
  RepositorioApiDelResidente({
    required ResidenteApi api,
    required SesionEnUso sesion,
  })  : _api = api,
        _sesion = sesion;

  final ResidenteApi _api;
  final SesionEnUso _sesion;

  /// La copropiedad de la ruta sale de los claims de la sesión.
  ///
  /// No es un dato que el residente elija: si su token no la trae, ninguna ruta
  /// de la API es alcanzable y decirlo así —«su cuenta no está asociada a un
  /// conjunto»— es más útil que un 404 sin contexto. Es el mismo hueco que dejó
  /// al superadministrador sin escribir (D-71), visto desde el otro lado.
  String get _copropiedad {
    final id = _sesion.sesion?.copropiedadId;
    if (id == null || id.isEmpty) {
      throw const Fallo(
        ClaseDeFallo.sinPermiso,
        'Su cuenta no está asociada a ninguna copropiedad. El administrador del '
            'conjunto tiene que vincularla a su vivienda.',
      );
    }
    return id;
  }

  Future<T> _pedir<T>(Future<T> Function() llamada) async {
    try {
      return await llamada();
    } on DioException catch (e) {
      throw _traducir(e);
    }
  }

  Fallo _traducir(DioException e) {
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return Fallo(ClaseDeFallo.sinConexion, e.message ?? 'Sin conexión');
    }
    final codigo = e.response?.statusCode;
    final detalle = _detalleDe(e.response?.data) ?? e.message ?? 'Error de servidor';
    return switch (codigo) {
      401 => Fallo(ClaseDeFallo.sesionInvalida, detalle),
      403 => Fallo(ClaseDeFallo.sinPermiso, detalle),
      404 => Fallo(ClaseDeFallo.sinVivienda, detalle),
      _ => Fallo(ClaseDeFallo.servidor, detalle),
    };
  }

  /// El cuerpo de error de la API tiene forma `{estado, correlacion, mensaje}`
  /// —el filtro global de `main.ts`—, y `mensaje` puede ser a su vez el objeto
  /// de Nest. Se extrae el texto útil sin suponer una sola forma, porque
  /// suponerla fue justo lo que rompió la suite de la API cuando el filtro
  /// global no estaba en el banco de pruebas.
  String? _detalleDe(dynamic datos) {
    if (datos is Map) {
      final mensaje = datos['mensaje'] ?? datos['message'];
      if (mensaje is String) return mensaje;
      if (mensaje is Map) {
        final interno = mensaje['message'];
        if (interno is String) return interno;
        if (interno is List && interno.isNotEmpty) return interno.join(', ');
      }
    }
    return null;
  }

  @override
  Future<MiHogar> miHogar() => _pedir(() async {
        final dto = await _api.miControllerVivienda(id: _copropiedad);
        return _hogarDe(dto);
      });

  @override
  Future<List<MiembroDeFamilia>> miFamilia() => _pedir(() async {
        final dtos = await _api.miControllerFamilia(id: _copropiedad);
        return dtos.map(_miembroDe).toList(growable: false);
      });

  @override
  Future<List<Vehiculo>> misVehiculos() => _pedir(() async {
        final dtos = await _api.miControllerVehiculos(id: _copropiedad);
        return dtos.map(_vehiculoDe).toList(growable: false);
      });

  @override
  Future<List<Autorizacion>> misAutorizaciones() => _pedir(() async {
        final dtos = await _api.miControllerAutorizaciones(id: _copropiedad);
        return dtos.map(_autorizacionDe).toList(growable: false);
      });

  @override
  Future<List<EventoDeAcceso>> miHistorial(PeriodoDeHistorial periodo) => _pedir(() async {
        final dtos = await _api.miControllerHistorial(
          id: _copropiedad,
          periodo: switch (periodo) {
            PeriodoDeHistorial.hoy => Periodo.hoy,
            PeriodoDeHistorial.semana => Periodo.semana,
            PeriodoDeHistorial.mes => Periodo.mes,
            PeriodoDeHistorial.todo => Periodo.todo,
          },
        );
        return dtos.map(_eventoDe).toList(growable: false);
      });
}

// ─── Traducciones. Explícitas, una por tipo, sin reflexión ────────────────────

MiHogar _hogarDe(MiInicioDto dto) => MiHogar(
      vivienda: Vivienda(
        id: dto.vivienda.id,
        identificador: dto.vivienda.identificador,
        agrupacion: dto.vivienda.agrupacion,
        etiquetaVivienda: dto.vivienda.etiquetaVivienda,
        etiquetaAgrupacion: dto.vivienda.etiquetaAgrupacion,
        direccion: dto.vivienda.direccion,
        copropiedadNombre: dto.vivienda.copropiedadNombre,
        estadoAdministrativo: dto.vivienda.estadoAdministrativo,
        activa: dto.vivienda.activa,
      ),
      vinculo: Vinculo(
        residenteId: dto.vinculo.residenteId,
        esTitular: dto.vinculo.esTitular,
        nivelAcceso: dto.vinculo.nivelAcceso,
      ),
      puedeAutorizar: dto.puedeAutorizar,
    );

MiembroDeFamilia _miembroDe(MiembroDeFamiliaDto d) => MiembroDeFamilia(
      residenteId: d.residenteId,
      nombre: d.nombre,
      parentesco: d.parentesco,
      esTitular: d.esTitular,
      nivelAcceso: d.nivelAcceso,
      activo: d.activo,
    );

Vehiculo _vehiculoDe(MiVehiculoDto d) => Vehiculo(
      id: d.id,
      placa: d.placa,
      marca: d.marca,
      modelo: d.modelo,
      color: d.color,
      esPrincipal: d.esPrincipal,
      activo: d.activo,
    );

Autorizacion _autorizacionDe(MiAutorizacionDto d) => Autorizacion(
      id: d.id,
      visitante: d.visitante,
      tipo: d.tipo,
      desde: d.desde,
      hasta: d.hasta,
      placa: d.placa,
      permiteAccesoVehicular: d.permiteAccesoVehicular,
      estado: d.estado,
      acompanantes: d.acompanantes.toInt(),
    );

EventoDeAcceso _eventoDe(MiEventoDto d) => EventoDeAcceso(
      id: d.id,
      ocurridoEn: d.ocurridoEn,
      tipo: d.tipo,
      resultado: d.resultado,
      motivo: d.motivo,
      metodo: d.metodo,
      placaDetectada: d.placaDetectada,
      persona: d.persona,
      zona: d.zona,
      decididoPorEdge: d.decididoPorEdge,
    );
