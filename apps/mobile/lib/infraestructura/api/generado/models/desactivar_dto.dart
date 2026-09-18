// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'desactivar_dto.g.dart';

@JsonSerializable()
class DesactivarDto {
  const DesactivarDto({
    required this.motivo,
  });
  
  factory DesactivarDto.fromJson(Map<String, Object?> json) => _$DesactivarDtoFromJson(json);
  
  /// Obligatorio (RN-19). Queda en la auditoría junto al actor y no se puede editar.
  final String motivo;

  Map<String, Object?> toJson() => _$DesactivarDtoToJson(this);
}
