// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'detalle_de_error_dto.g.dart';

@JsonSerializable()
class DetalleDeErrorDto {
  const DetalleDeErrorDto({
    required this.message,
    this.error,
    this.statusCode,
  });
  
  factory DetalleDeErrorDto.fromJson(Map<String, Object?> json) => _$DetalleDeErrorDtoFromJson(json);
  
  /// Un mensaje, o el arreglo que devuelve el ValidationPipe con un renglón por campo rechazado. La consola muestra el arreglo campo a campo; una cadena, tal cual.
  final dynamic message;
  final String? error;
  final num? statusCode;

  Map<String, Object?> toJson() => _$DetalleDeErrorDtoToJson(this);
}
