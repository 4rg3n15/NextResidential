// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'configurar_zona_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConfigurarZonaDto _$ConfigurarZonaDtoFromJson(Map<String, dynamic> json) =>
    ConfigurarZonaDto(
      nombre: json['nombre'] as String?,
      aforoMaximo: json['aforoMaximo'] as num?,
      horario: (json['horario'] as List<dynamic>?)
          ?.map((e) => FranjaDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      politicaReinicio: json['politicaReinicio'] == null
          ? null
          : ConfigurarZonaDtoPoliticaReinicio.fromJson(
              json['politicaReinicio'] as String,
            ),
      normas: (json['normas'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      abierta: json['abierta'] as bool?,
    );

Map<String, dynamic> _$ConfigurarZonaDtoToJson(ConfigurarZonaDto instance) =>
    <String, dynamic>{
      'nombre': instance.nombre,
      'aforoMaximo': instance.aforoMaximo,
      'horario': instance.horario,
      'politicaReinicio': instance.politicaReinicio,
      'normas': instance.normas,
      'abierta': instance.abierta,
    };
