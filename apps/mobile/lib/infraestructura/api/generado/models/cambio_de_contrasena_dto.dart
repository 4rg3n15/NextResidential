// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cambio_de_contrasena_dto.g.dart';

@JsonSerializable()
class CambioDeContrasenaDto {
  const CambioDeContrasenaDto({
    required this.actual,
    required this.nueva,
  });
  
  factory CambioDeContrasenaDto.fromJson(Map<String, Object?> json) => _$CambioDeContrasenaDtoFromJson(json);
  
  final String actual;
  final String nueva;

  Map<String, Object?> toJson() => _$CambioDeContrasenaDtoToJson(this);
}
