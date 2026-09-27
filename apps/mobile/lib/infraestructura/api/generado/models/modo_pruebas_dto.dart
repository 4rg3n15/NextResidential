// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'modo_pruebas_dto.g.dart';

@JsonSerializable()
class ModoPruebasDto {
  const ModoPruebasDto({
    required this.activo,
  });
  
  factory ModoPruebasDto.fromJson(Map<String, Object?> json) => _$ModoPruebasDtoFromJson(json);
  
  /// Con el modo pruebas activo, las restricciones de porteros se evalúan y se registran sin bloquear, no hay bloqueo por intentos fallidos y el límite de peticiones es más alto
  final bool activo;

  Map<String, Object?> toJson() => _$ModoPruebasDtoToJson(this);
}
