// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cuenta_de_residente_creada_dto.g.dart';

@JsonSerializable()
class CuentaDeResidenteCreadaDto {
  const CuentaDeResidenteCreadaDto({
    required this.usuarioId,
  });
  
  factory CuentaDeResidenteCreadaDto.fromJson(Map<String, Object?> json) => _$CuentaDeResidenteCreadaDtoFromJson(json);
  
  final String usuarioId;

  Map<String, Object?> toJson() => _$CuentaDeResidenteCreadaDtoToJson(this);
}
