// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'medidas_de_foto_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MedidasDeFotoDto _$MedidasDeFotoDtoFromJson(Map<String, dynamic> json) =>
    MedidasDeFotoDto(
      rostrosDetectados: json['rostrosDetectados'] as num,
      nitidez: json['nitidez'] as num,
      iluminacion: json['iluminacion'] as num,
      proporcionRostro: json['proporcionRostro'] as num,
    );

Map<String, dynamic> _$MedidasDeFotoDtoToJson(MedidasDeFotoDto instance) =>
    <String, dynamic>{
      'rostrosDetectados': instance.rostrosDetectados,
      'nitidez': instance.nitidez,
      'iluminacion': instance.iluminacion,
      'proporcionRostro': instance.proporcionRostro,
    };
