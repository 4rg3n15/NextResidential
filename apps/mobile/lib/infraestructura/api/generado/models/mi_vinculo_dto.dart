// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mi_vinculo_dto.g.dart';

@JsonSerializable()
class MiVinculoDto {
  const MiVinculoDto({
    required this.residenteId,
    required this.esTitular,
    required this.nivelAcceso,
  });
  
  factory MiVinculoDto.fromJson(Map<String, Object?> json) => _$MiVinculoDtoFromJson(json);
  
  final String residenteId;
  final bool esTitular;

  /// P-11 · por defecto el más restrictivo mientras no se defina.
  final String? nivelAcceso;

  Map<String, Object?> toJson() => _$MiVinculoDtoToJson(this);
}
