// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'medidas_de_captura_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MedidasDeCapturaDto _$MedidasDeCapturaDtoFromJson(Map<String, dynamic> json) =>
    MedidasDeCapturaDto(
      nitidez: json['nitidez'] as num,
      iluminacion: json['iluminacion'] as num,
      rostrosDetectados: json['rostrosDetectados'] as num,
      proporcionRostro: json['proporcionRostro'] as num,
    );

Map<String, dynamic> _$MedidasDeCapturaDtoToJson(
  MedidasDeCapturaDto instance,
) => <String, dynamic>{
  'nitidez': instance.nitidez,
  'iluminacion': instance.iluminacion,
  'rostrosDetectados': instance.rostrosDetectados,
  'proporcionRostro': instance.proporcionRostro,
};
