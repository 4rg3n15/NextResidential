// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'registrar_residente_dto.g.dart';

@JsonSerializable()
class RegistrarResidenteDto {
  const RegistrarResidenteDto({
    required this.viviendaId,
    required this.personaId,
    this.esTitular,
    this.parentesco,
  });
  
  factory RegistrarResidenteDto.fromJson(Map<String, Object?> json) => _$RegistrarResidenteDtoFromJson(json);
  
  final String viviendaId;
  final String personaId;
  final bool? esTitular;
  final String? parentesco;

  Map<String, Object?> toJson() => _$RegistrarResidenteDtoToJson(this);
}
