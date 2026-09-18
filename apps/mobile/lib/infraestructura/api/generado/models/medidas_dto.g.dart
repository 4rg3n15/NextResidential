// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'medidas_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MedidasDto _$MedidasDtoFromJson(Map<String, dynamic> json) => MedidasDto(
  rostrosDetectados: json['rostrosDetectados'] as num,
  nitidez: json['nitidez'] as num,
  iluminacion: json['iluminacion'] as num,
  proporcionRostro: json['proporcionRostro'] as num,
);

Map<String, dynamic> _$MedidasDtoToJson(MedidasDto instance) =>
    <String, dynamic>{
      'rostrosDetectados': instance.rostrosDetectados,
      'nitidez': instance.nitidez,
      'iluminacion': instance.iluminacion,
      'proporcionRostro': instance.proporcionRostro,
    };
