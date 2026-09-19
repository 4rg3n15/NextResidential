// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sincronizar_plantilla_dto.g.dart';

@JsonSerializable()
class SincronizarPlantillaDto {
  const SincronizarPlantillaDto({
    required this.dispositivoId,
  });
  
  factory SincronizarPlantillaDto.fromJson(Map<String, Object?> json) => _$SincronizarPlantillaDtoFromJson(json);
  
  final String dispositivoId;

  Map<String, Object?> toJson() => _$SincronizarPlantillaDtoToJson(this);
}
