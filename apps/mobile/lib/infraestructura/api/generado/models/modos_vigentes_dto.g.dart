// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'modos_vigentes_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModosVigentesDto _$ModosVigentesDtoFromJson(Map<String, dynamic> json) =>
    ModosVigentesDto(
      modos: (json['modos'] as List<dynamic>)
          .map((e) => ModoVigenteDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ModosVigentesDtoToJson(ModosVigentesDto instance) =>
    <String, dynamic>{'modos': instance.modos};
