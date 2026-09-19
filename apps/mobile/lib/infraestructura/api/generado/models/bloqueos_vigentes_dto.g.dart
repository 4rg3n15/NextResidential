// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bloqueos_vigentes_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BloqueosVigentesDto _$BloqueosVigentesDtoFromJson(Map<String, dynamic> json) =>
    BloqueosVigentesDto(
      bloqueos: (json['bloqueos'] as List<dynamic>)
          .map((e) => BloqueoVigenteDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$BloqueosVigentesDtoToJson(
  BloqueosVigentesDto instance,
) => <String, dynamic>{'bloqueos': instance.bloqueos};
