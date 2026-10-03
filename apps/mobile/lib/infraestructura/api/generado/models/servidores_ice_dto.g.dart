// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'servidores_ice_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ServidoresIceDto _$ServidoresIceDtoFromJson(Map<String, dynamic> json) =>
    ServidoresIceDto(
      iceServers: (json['iceServers'] as List<dynamic>)
          .map((e) => ServidorIceDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      ttlSegundos: json['ttlSegundos'] as num,
    );

Map<String, dynamic> _$ServidoresIceDtoToJson(ServidoresIceDto instance) =>
    <String, dynamic>{
      'iceServers': instance.iceServers,
      'ttlSegundos': instance.ttlSegundos,
    };
