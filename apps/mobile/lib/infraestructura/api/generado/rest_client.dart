// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';

import 'clients/autenticacion_api.dart';
import 'clients/multiempresa_api.dart';
import 'clients/alertas_api.dart';
import 'clients/autorizaciones_api.dart';
import 'clients/biometria_api.dart';
import 'clients/dispositivos_api.dart';
import 'clients/equipos_api.dart';
import 'clients/eventos_api.dart';
import 'clients/guardia_api.dart';
import 'clients/informes_api.dart';
import 'clients/residente_api.dart';
import 'clients/padron_api.dart';
import 'clients/tablero_api.dart';
import 'clients/zonas_api.dart';
import 'clients/salud_api.dart';
import 'clients/ingesta_api.dart';
import 'clients/observabilidad_api.dart';

/// Next Control Residencial — API `v0.1.0`.
///
/// Next Control decide. El hardware ejecuta.
class RestClient {
  RestClient(
    Dio dio, {
    String? baseUrl,
  })  : _dio = dio,
        _baseUrl = baseUrl;

  final Dio _dio;
  final String? _baseUrl;

  static String get version => '0.1.0';

  AutenticacionApi? _autenticacion;
  MultiempresaApi? _multiempresa;
  AlertasApi? _alertas;
  AutorizacionesApi? _autorizaciones;
  BiometriaApi? _biometria;
  DispositivosApi? _dispositivos;
  EquiposApi? _equipos;
  EventosApi? _eventos;
  GuardiaApi? _guardia;
  InformesApi? _informes;
  ResidenteApi? _residente;
  PadronApi? _padron;
  TableroApi? _tablero;
  ZonasApi? _zonas;
  SaludApi? _salud;
  IngestaApi? _ingesta;
  ObservabilidadApi? _observabilidad;

  AutenticacionApi get autenticacion => _autenticacion ??= AutenticacionApi(_dio, baseUrl: _baseUrl);

  MultiempresaApi get multiempresa => _multiempresa ??= MultiempresaApi(_dio, baseUrl: _baseUrl);

  AlertasApi get alertas => _alertas ??= AlertasApi(_dio, baseUrl: _baseUrl);

  AutorizacionesApi get autorizaciones => _autorizaciones ??= AutorizacionesApi(_dio, baseUrl: _baseUrl);

  BiometriaApi get biometria => _biometria ??= BiometriaApi(_dio, baseUrl: _baseUrl);

  DispositivosApi get dispositivos => _dispositivos ??= DispositivosApi(_dio, baseUrl: _baseUrl);

  EquiposApi get equipos => _equipos ??= EquiposApi(_dio, baseUrl: _baseUrl);

  EventosApi get eventos => _eventos ??= EventosApi(_dio, baseUrl: _baseUrl);

  GuardiaApi get guardia => _guardia ??= GuardiaApi(_dio, baseUrl: _baseUrl);

  InformesApi get informes => _informes ??= InformesApi(_dio, baseUrl: _baseUrl);

  ResidenteApi get residente => _residente ??= ResidenteApi(_dio, baseUrl: _baseUrl);

  PadronApi get padron => _padron ??= PadronApi(_dio, baseUrl: _baseUrl);

  TableroApi get tablero => _tablero ??= TableroApi(_dio, baseUrl: _baseUrl);

  ZonasApi get zonas => _zonas ??= ZonasApi(_dio, baseUrl: _baseUrl);

  SaludApi get salud => _salud ??= SaludApi(_dio, baseUrl: _baseUrl);

  IngestaApi get ingesta => _ingesta ??= IngestaApi(_dio, baseUrl: _baseUrl);

  ObservabilidadApi get observabilidad => _observabilidad ??= ObservabilidadApi(_dio, baseUrl: _baseUrl);
}
