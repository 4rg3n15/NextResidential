// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'campo_rechazado_de_forma_dto.dart';
import 'detalle_de_error_dto_codigo.dart';

part 'detalle_de_error_dto.g.dart';

@JsonSerializable()
class DetalleDeErrorDto {
  const DetalleDeErrorDto({
    required this.message,
    this.error,
    this.statusCode,
    this.codigo,
    this.campos,
  });
  
  factory DetalleDeErrorDto.fromJson(Map<String, Object?> json) => _$DetalleDeErrorDtoFromJson(json);
  
  /// Un mensaje, o el arreglo que devuelve el ValidationPipe con un renglón por campo rechazado. La consola muestra el arreglo campo a campo; una cadena, tal cual.
  final dynamic message;
  final String? error;
  final num? statusCode;

  /// 15-Z2 · en todo 409 de negocio: el código con que el dominio nombra el conflicto. La consola y la app deciden por él (qué refrescar, bajo qué campo pintar) y muestran `message`.
  final DetalleDeErrorDtoCodigo? codigo;

  /// 15-Z2 · en los 400 de forma del ValidationPipe: un renglón por campo rechazado, en español, con la misma forma que los `campos` de los 400 de regla del alta (15-W).
  final List<CampoRechazadoDeFormaDto>? campos;

  Map<String, Object?> toJson() => _$DetalleDeErrorDtoToJson(this);
}
