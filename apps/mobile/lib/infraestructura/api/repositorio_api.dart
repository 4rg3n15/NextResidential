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

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/calidad_de_captura.dart';
import '../../dominio/entidades.dart';
import '../../dominio/puertos.dart';
import 'generado/clients/residente_api.dart';
import 'generado/models/mi_autorizacion_dto.dart';
import 'generado/models/mi_evento_dto.dart';
import 'generado/models/mi_inicio_dto.dart';
import 'generado/models/mi_vehiculo_dto.dart';
import 'generado/models/miembro_de_familia_dto.dart';
import 'generado/models/mi_zona_dto.dart';
import 'generado/models/nueva_visita_dto.dart';
import 'generado/models/patron_de_visita_dto.dart';
import 'generado/models/medidas_de_captura_dto.dart';
import 'generado/models/periodo.dart';
import 'generado/models/rostro_de_mi_visitante_dto.dart';
import 'generado/models/token_de_notificacion_dto.dart';
import 'generado/models/token_de_notificacion_dto_plataforma.dart';
import 'generado/models/visita_creada_dto.dart';
import 'generado/models/visita_creada_dto_motivo.dart';
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
        final dto = await _api.miControllerCrearAutorizacion(
          id: _copropiedad,
          body: NuevaVisitaDto(
            visitante: visita.visitante,
            documento: visita.documento,
            // La API espera ISO-8601 CON zona. `toUtc()` la garantiza: enviar
            // una hora local sin huso deja que el servidor la interprete en el
            // suyo, y una visita «de 14:00 a 18:00» se convierte en otra cosa.
            desde: visita.desde.toUtc().toIso8601String(),
            hasta: visita.hasta.toUtc().toIso8601String(),
            placa: visita.placa,
            permiteAccesoVehicular: visita.permiteAccesoVehicular,
            acompanantes: visita.acompanantes.isEmpty ? null : visita.acompanantes,
            zonasPermitidas: visita.zonasPermitidas.isEmpty ? null : visita.zonasPermitidas,
            observaciones: visita.observaciones,
            patron: visita.patron == null
                ? null
                : PatronDeVisitaDto(
                    dias: visita.patron!.dias.map((d) => d.index).toList()..sort(),
                    minutoInicio: visita.patron!.minutoInicio,
                    minutoFin: visita.patron!.minutoFin,
                    desplazamientoUtcMinutos: visita.patron!.desplazamientoUtcMinutos,
                  ),
            claveDeIdempotencia: visita.claveDeIdempotencia,
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
  Future<ResultadoDeCaptura> capturarRostro({
    required String autorizacionId,
    required MedidasDeCaptura medidas,
    required Uint8List vector,
    required String versionPolitica,
    required DateTime suprimirEn,
  }) =>
      _pedir(() async {
        final dto = await _api.miControllerCapturarRostro(
          id: _copropiedad,
          autorizacionId: autorizacionId,
          body: RostroDeMiVisitanteDto(
            // El vector va en base64 y entra cifrado a la bóveda del servidor.
            // Nada de esto se guarda en el teléfono: la plantilla vive en la
            // terminal y cifrada en base, nunca en el cliente.
            vector: base64Encode(vector),
            medidas: MedidasDeCapturaDto(
              nitidez: medidas.nitidez,
              iluminacion: medidas.iluminacion,
              rostrosDetectados: medidas.rostrosDetectados,
              proporcionRostro: medidas.proporcionRostro,
            ),
            versionPolitica: versionPolitica,
            suprimirEn: suprimirEn.toUtc(),
          ),
        );
        if (!dto.aceptada) return CapturaRechazada(List<String>.from(dto.motivos));
        final consentimiento = dto.consentimientoId;
        if (consentimiento == null) {
          // Aceptada sin consentimiento sería un contrato roto, y tratarlo como
          // éxito dejaría al residente creyendo que el trámite acabó.
          throw const Fallo(
            ClaseDeFallo.servidor,
            'La captura se aceptó sin solicitud de consentimiento',
          );
        }
        return CapturaAceptada(
          consentimientoId: consentimiento,
          titular: dto.titular ?? 'su visitante',
          calidad: (dto.calidad ?? 0).toDouble(),
          enlaceDeConsentimiento: dto.enlaceDeConsentimiento,
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

/// El resultado de crear, traducido.
///
/// Un motivo que el servidor añada mañana y esta app no conozca llega como
/// `$unknown` del generador. NO se convierte en «creada»: se trata como
/// rechazo con la explicación que venga del servidor, que es la dirección
/// segura — decir «creada» sobre algo que no se creó sería lo peor posible.
ResultadoDeVisita _resultadoDe(VisitaCreadaDto d) {
  if (d.creada && d.id != null) {
    return VisitaCreada(id: d.id!, repetida: d.repetida);
  }
  final motivo = switch (d.motivo) {
    VisitaCreadaDtoMotivo.listaNegra => MotivoDeRechazo.listaNegra,
    VisitaCreadaDtoMotivo.viviendaInactiva => MotivoDeRechazo.viviendaInactiva,
    VisitaCreadaDtoMotivo.sinNivelDeAcceso => MotivoDeRechazo.sinNivelDeAcceso,
    VisitaCreadaDtoMotivo.placaDuplicada => MotivoDeRechazo.placaDuplicada,
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
