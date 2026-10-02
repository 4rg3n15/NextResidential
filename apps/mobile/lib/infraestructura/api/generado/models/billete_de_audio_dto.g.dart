// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'billete_de_audio_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BilleteDeAudioDto _$BilleteDeAudioDtoFromJson(Map<String, dynamic> json) =>
    BilleteDeAudioDto(
      billete: json['billete'] as String,
      caducaEnSegundos: json['caducaEnSegundos'] as num,
      ruta: json['ruta'] as String,
    );

Map<String, dynamic> _$BilleteDeAudioDtoToJson(BilleteDeAudioDto instance) =>
    <String, dynamic>{
      'billete': instance.billete,
      'caducaEnSegundos': instance.caducaEnSegundos,
      'ruta': instance.ruta,
    };
