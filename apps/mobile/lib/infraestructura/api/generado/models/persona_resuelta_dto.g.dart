// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'persona_resuelta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PersonaResueltaDto _$PersonaResueltaDtoFromJson(Map<String, dynamic> json) =>
    PersonaResueltaDto(
      id: json['id'] as String,
      nombreCompleto: json['nombreCompleto'] as String,
      yaExistia: json['yaExistia'] as bool,
    );

Map<String, dynamic> _$PersonaResueltaDtoToJson(PersonaResueltaDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'nombreCompleto': instance.nombreCompleto,
      'yaExistia': instance.yaExistia,
    };
