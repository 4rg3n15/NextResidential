// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mis_ocupantes_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MisOcupantesDto _$MisOcupantesDtoFromJson(Map<String, dynamic> json) =>
    MisOcupantesDto(
      declarados: json['declarados'] as num,
      declarada: json['declarada'] as bool,
      plazas: (json['plazas'] as List<dynamic>)
          .map((e) => PlazaDeOcupanteDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      aviso: json['aviso'] as String,
    );

Map<String, dynamic> _$MisOcupantesDtoToJson(MisOcupantesDto instance) =>
    <String, dynamic>{
      'declarados': instance.declarados,
      'declarada': instance.declarada,
      'plazas': instance.plazas,
      'aviso': instance.aviso,
    };
