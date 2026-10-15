// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// 15-Z2 · en todo 409 de negocio: el código con que el dominio nombra el conflicto. La consola y la app deciden por él (qué refrescar, bajo qué campo pintar) y muestran `message`.
@JsonEnum()
enum DetalleDeErrorDtoCodigo {
  @JsonValue('VIVIENDA_CON_TITULAR')
  viviendaConTitular('VIVIENDA_CON_TITULAR'),
  @JsonValue('CUENTA_CON_VIVIENDA')
  cuentaConVivienda('CUENTA_CON_VIVIENDA'),
  @JsonValue('USUARIO_NO_DISPONIBLE')
  usuarioNoDisponible('USUARIO_NO_DISPONIBLE'),
  @JsonValue('USUARIO_DUPLICADO')
  usuarioDuplicado('USUARIO_DUPLICADO'),
  @JsonValue('PROVEEDOR_DE_IDENTIDAD')
  proveedorDeIdentidad('PROVEEDOR_DE_IDENTIDAD'),
  @JsonValue('REGISTRO_NO_SUSPENDIDO')
  registroNoSuspendido('REGISTRO_NO_SUSPENDIDO'),
  @JsonValue('TOPE_DE_PLAZAS')
  topeDePlazas('TOPE_DE_PLAZAS'),
  @JsonValue('TOPE_BAJO_LAS_PLAZAS')
  topeBajoLasPlazas('TOPE_BAJO_LAS_PLAZAS'),
  @JsonValue('PLAZAS_MAXIMAS')
  plazasMaximas('PLAZAS_MAXIMAS'),
  @JsonValue('PLAZA_OCUPADA')
  plazaOcupada('PLAZA_OCUPADA'),
  @JsonValue('PLAZA_DEL_TITULAR')
  plazaDelTitular('PLAZA_DEL_TITULAR'),
  @JsonValue('DOCUMENTO_EN_USO')
  documentoEnUso('DOCUMENTO_EN_USO'),
  @JsonValue('TRASPASO_SOLO_MAYOR')
  traspasoSoloMayor('TRASPASO_SOLO_MAYOR'),
  @JsonValue('PLACA_CON_HISTORIAL')
  placaConHistorial('PLACA_CON_HISTORIAL'),
  @JsonValue('VEHICULO')
  vehiculo('VEHICULO'),
  @JsonValue('VISITA_NO_REVOCABLE')
  visitaNoRevocable('VISITA_NO_REVOCABLE'),
  @JsonValue('SUSCRIPCION_WEB_PUSH')
  suscripcionWebPush('SUSCRIPCION_WEB_PUSH'),
  @JsonValue('POLITICA_CAMBIADA')
  politicaCambiada('POLITICA_CAMBIADA'),
  @JsonValue('OTRO_REGISTRO_GANO')
  otroRegistroGano('OTRO_REGISTRO_GANO'),
  @JsonValue('ROSTRO')
  rostro('ROSTRO'),
  @JsonValue('PADRON')
  padron('PADRON'),
  @JsonValue('AUTORIZACION')
  autorizacion('AUTORIZACION'),
  @JsonValue('OPERACION_NO_PERMITIDA')
  operacionNoPermitida('OPERACION_NO_PERMITIDA'),
  @JsonValue('LISTA_NEGRA')
  listaNegra('LISTA_NEGRA'),
  @JsonValue('ZONA')
  zona('ZONA'),
  @JsonValue('VISITA')
  visita('VISITA'),
  @JsonValue('ALERTA_YA_ATENDIDA')
  alertaYaAtendida('ALERTA_YA_ATENDIDA'),
  @JsonValue('CONFIGURACION_EN_SITIO')
  configuracionEnSitio('CONFIGURACION_EN_SITIO'),
  @JsonValue('TURNO_TERMINADO')
  turnoTerminado('TURNO_TERMINADO'),
  @JsonValue('PORTERO_DUPLICADO')
  porteroDuplicado('PORTERO_DUPLICADO'),
  @JsonValue('CUPO_DE_PORTEROS')
  cupoDePorteros('CUPO_DE_PORTEROS'),
  @JsonValue('NUMEROS_DE_PORTERO_AGOTADOS')
  numerosDePorteroAgotados('NUMEROS_DE_PORTERO_AGOTADOS'),
  @JsonValue('SIN_ORIGEN_DE_VIDEO')
  sinOrigenDeVideo('SIN_ORIGEN_DE_VIDEO'),
  @JsonValue('AUDIO_POR_HTTP')
  audioPorHttp('AUDIO_POR_HTTP'),
  @JsonValue('SIN_LA_PALABRA')
  sinLaPalabra('SIN_LA_PALABRA'),
  @JsonValue('TRANSPORTE_DE_AUDIO_NO_DISPONIBLE')
  transporteDeAudioNoDisponible('TRANSPORTE_DE_AUDIO_NO_DISPONIBLE'),
  @JsonValue('SIN_TRANSPORTE_DE_AUDIO')
  sinTransporteDeAudio('SIN_TRANSPORTE_DE_AUDIO'),
  @JsonValue('OTRO_EDGE_PUENTE')
  otroEdgePuente('OTRO_EDGE_PUENTE'),
  @JsonValue('CACHE_DEL_EDGE_ADELANTADA')
  cacheDelEdgeAdelantada('CACHE_DEL_EDGE_ADELANTADA'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const DetalleDeErrorDtoCodigo(this.json);

  factory DetalleDeErrorDtoCodigo.fromJson(String json) => values.firstWhere(
        (e) => e.json == json,
        orElse: () => $unknown,
      );

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError('Cannot convert enum value with null JSON representation to String. '
          'This usually happens for \$unknown or @JsonValue(null) entries.');
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();
  /// Returns all defined enum values excluding the $unknown value.
  static List<DetalleDeErrorDtoCodigo> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
