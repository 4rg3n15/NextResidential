// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'linea_de_tiempo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LineaDeTiempoDto _$LineaDeTiempoDtoFromJson(Map<String, dynamic> json) =>
    LineaDeTiempoDto(
      elementos: (json['elementos'] as List<dynamic>)
          .map(
            (e) =>
                ElementoDeLineaDeTiempoDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
    );

Map<String, dynamic> _$LineaDeTiempoDtoToJson(LineaDeTiempoDto instance) =>
    <String, dynamic>{'elementos': instance.elementos};
