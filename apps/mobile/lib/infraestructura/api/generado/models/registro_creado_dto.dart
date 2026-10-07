// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'registro_creado_dto.g.dart';

@JsonSerializable()
class RegistroCreadoDto {
  const RegistroCreadoDto({
    required this.creada,
  });
  
  factory RegistroCreadoDto.fromJson(Map<String, Object?> json) => _$RegistroCreadoDtoFromJson(json);
  
  /// Siempre true: la cuenta nació con su plaza
  final bool creada;

  Map<String, Object?> toJson() => _$RegistroCreadoDtoToJson(this);
}
