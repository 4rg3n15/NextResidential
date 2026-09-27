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
import 'generado/models/foto_de_visita_dto.dart';
import 'generado/models/foto_de_visita_dto_tipo_mime.dart';
import 'generado/models/medidas_de_foto_dto.dart';
import 'generado/models/mi_autorizacion_dto.dart';
import 'generado/models/mi_evento_dto.dart';
import 'generado/models/mi_inicio_dto.dart';
import 'generado/models/mi_vehiculo_dto.dart';
import 'generado/models/mi_visita_dto.dart';
import 'generado/models/mi_visita_generada_dto.dart';
import 'generado/models/mi_visita_generada_dto_motivo.dart';
import 'generado/models/miembro_de_familia_dto.dart';
import 'generado/models/mi_zona_dto.dart';
import 'generado/models/periodo.dart';
import 'generado/models/repetir_visita_dto.dart';
import 'generado/models/token_de_notificacion_dto.dart';
import 'generado/models/token_de_notificacion_dto_plataforma.dart';
import 'generado/models/visitante_reciente_dto.dart';
import 'soporte_de_api.dart';

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

  String get _copropiedad => copropiedadDeLaSesion(_sesion);

  Future<T> _pedir<T>(Future<T> Function() llamada) => pedirALaApi(llamada);

  @override
  Future<List<ZonaComun>> misZonas() => _pedir(() async {
        final dtos = await _api.miControllerZonas(id: _copropiedad);
        return dtos.map(_zonaDe).toList();
      });

  @override
  Future<ResultadoDeVisita> crearVisita(NuevaVisita visita) => _pedir(() async {
        final dto = await _api.misVisitasControllerCrear(
          id: _copropiedad,
          // Ni rastro de la vivienda: el servidor la saca del vínculo del
          // residente, y un cuerpo que la llevara sería el segundo eje del
          // aislamiento abierto desde el teléfono.
          body: MiVisitaDto(
            nombre: visita.visitante,
            documento: visita.documento,
            // La API espera ISO-8601 CON zona. `toUtc()` la garantiza: enviar
            // una hora local sin huso deja que el servidor la interprete en el
            // suyo, y una visita «de 14:00» se convierte en otra cosa.
            inicio: visita.inicio.toUtc(),
            duracionMinutos: visita.duracionMinutos,
            placa: visita.placa,
            observaciones: visita.observaciones,
            foto: _fotoDto(visita.foto),
            casillaMarcada: visita.casillaMarcada,
            claveDeIdempotencia: visita.claveDeIdempotencia,
          ),
        );
        return _resultadoDe(dto);
      });

  @override
  Future<List<VisitanteReciente>> ultimosVisitantes() => _pedir(() async {
        final dtos = await _api.misVisitasControllerUltimas(id: _copropiedad);
        return dtos.map(_recienteDe).toList(growable: false);
      });

  @override
  Future<ResultadoDeVisita> volverAAutorizar({
    required String autorizacionId,
    required DateTime inicio,
    required int duracionMinutos,
    required bool casillaMarcada,
    required String claveDeIdempotencia,
  }) =>
      _pedir(() async {
        final dto = await _api.misVisitasControllerRepetir(
          id: _copropiedad,
          // La visita anterior va en la RUTA y de ella copia el servidor el
          // nombre, el documento, la placa y la foto. Si no es de la vivienda
          // del residente, contesta 404 y no se crea nada.
          autorizacionId: autorizacionId,
          body: RepetirVisitaDto(
            inicio: inicio.toUtc(),
            duracionMinutos: duracionMinutos,
            casillaMarcada: casillaMarcada,
            claveDeIdempotencia: claveDeIdempotencia,
          ),
        );
        return _resultadoDe(dto);
      });

  @override
  Future<void> registrarAparato(AparatoDeNotificaciones aparato) => _pedir(() async {
        await _api.miControllerRegistrarAparato(
          id: _copropiedad,
          body: TokenDeNotificacionDto(
            instalacionId: aparato.instalacionId,
            token: aparato.token,
            plataforma: switch (aparato.plataforma) {
              PlataformaDelAparato.ios => TokenDeNotificacionDtoPlataforma.ios,
              PlataformaDelAparato.android => TokenDeNotificacionDtoPlataforma.android,
              PlataformaDelAparato.web => TokenDeNotificacionDtoPlataforma.web,
            },
          ),
        );
      });

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

/// La foto, como la espera el contrato. Siempre JPEG: es lo que produce la
/// cámara del teléfono (`CamaraDelTelefono` recomprime lo que no lo sea), y el
/// servidor comprueba que el contenido sea de verdad lo que dice el tipo.
FotoDeVisitaDto _fotoDto(FotoDeVisita f) => FotoDeVisitaDto(
      contenidoBase64: f.jpegBase64,
      // Por su valor y no por `undefined0`, que es como el generador tuvo que
      // llamar a `image/jpeg` porque la barra no cabe en un identificador.
      tipoMime: FotoDeVisitaDtoTipoMime.fromJson('image/jpeg'),
      medidas: MedidasDeFotoDto(
        rostrosDetectados: f.medidas.rostrosDetectados,
        nitidez: f.medidas.nitidez,
        iluminacion: f.medidas.iluminacion,
        proporcionRostro: f.medidas.proporcionRostro,
      ),
    );

/// El resultado de crear o de volver a autorizar, traducido.
///
/// Un motivo que el servidor añada mañana y esta app no conozca llega como
/// `$unknown` del generador. NO se convierte en «creada»: se trata como
/// rechazo con la explicación que venga del servidor, que es la dirección
/// segura — decir «creada» sobre algo que no se creó sería lo peor posible.
ResultadoDeVisita _resultadoDe(MiVisitaGeneradaDto d) {
  final id = d.id;
  if (d.creada && id != null) {
    return VisitaCreada(
      id: id,
      repetida: d.repetida,
      equipos: d.equipos.toInt(),
      sincronizadas: d.sincronizadas.toInt(),
      fallidas: d.fallidas.toInt(),
      avisoDeSincronizacion: d.avisoDeSincronizacion,
    );
  }
  // La foto no sirvió: el servidor ni siquiera llegó a mirar las reglas de la
  // visita. Se dice eso y no un rechazo de negocio, porque el arreglo es otro:
  // repetir la foto, no llamar a la administración.
  if (!d.creada && d.motivosDeFoto.isNotEmpty) {
    return FotoRechazada(List<String>.unmodifiable(d.motivosDeFoto));
  }
  final motivo = switch (d.motivo) {
    MiVisitaGeneradaDtoMotivo.listaNegra => MotivoDeRechazo.listaNegra,
    MiVisitaGeneradaDtoMotivo.viviendaInactiva => MotivoDeRechazo.viviendaInactiva,
    MiVisitaGeneradaDtoMotivo.sinNivelDeAcceso => MotivoDeRechazo.sinNivelDeAcceso,
    MiVisitaGeneradaDtoMotivo.placaDuplicada => MotivoDeRechazo.placaDuplicada,
    _ => null,
  };
  return VisitaRechazada(
    // Sin motivo reconocible, el más conservador: el que manda al residente a
    // la administración en vez de hacerle repetir un formulario que está bien.
    motivo: motivo ?? MotivoDeRechazo.viviendaInactiva,
    explicacion: d.explicacion ??
        'El conjunto no permitió registrar esta visita. Consulte con la administración.',
  );
}

VisitanteReciente _recienteDe(VisitanteRecienteDto d) => VisitanteReciente(
      autorizacionId: d.autorizacionId,
      visitante: d.visitante,
      documento: d.documento,
      ultimaVisita: d.ultimaVisita,
      placa: d.placa,
      tieneFoto: d.tieneFoto,
    );

ZonaComun _zonaDe(MiZonaDto d) => ZonaComun(
      id: d.id,
      nombre: d.nombre,
      aforoMaximo: d.aforoMaximo.toInt(),
      ocupacionActual: d.ocupacionActual.toInt(),
      abiertaAhora: d.abiertaAhora,
      franjasDeHoy: d.franjasDeHoy
          // El generador ya devuelve `DateTime` para un `format: date-time`:
          // volver a analizarlo sería analizar dos veces la misma cadena.
          .map((f) => FranjaDeZona(desde: f.desde, hasta: f.hasta))
          .toList(),
      requiereAutorizacion: d.requiereAutorizacion,
    );
