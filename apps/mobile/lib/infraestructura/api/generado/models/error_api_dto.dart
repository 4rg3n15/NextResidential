// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'error_api_dto.g.dart';

@JsonSerializable()
class ErrorApiDto {
  const ErrorApiDto({
    required this.estado,
    required this.correlacion,
    required this.mensaje,
  });
  
  factory ErrorApiDto.fromJson(Map<String, Object?> json) => _$ErrorApiDtoFromJson(json);
  
  /// Código HTTP, repetido en el cuerpo
  final num estado;

  /// Identificador de correlación para seguir la petición en la bitácora
  final String correlacion;

  /// Detalle para el cliente en 4xx. En 5xx es siempre «Error interno»: el mensaje original no sale, porque suele llevar nombres de tabla o fragmentos de consulta.
  final dynamic mensaje;

  Map<String, Object?> toJson() => _$ErrorApiDtoToJson(this);
}
