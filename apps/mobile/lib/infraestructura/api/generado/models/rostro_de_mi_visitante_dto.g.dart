// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rostro_de_mi_visitante_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RostroDeMiVisitanteDto _$RostroDeMiVisitanteDtoFromJson(
  Map<String, dynamic> json,
) => RostroDeMiVisitanteDto(
  vector: json['vector'] as String,
  medidas: MedidasDeCapturaDto.fromJson(
    json['medidas'] as Map<String, dynamic>,
  ),
  versionPolitica: json['versionPolitica'] as String,
  suprimirEn: DateTime.parse(json['suprimirEn'] as String),
);

Map<String, dynamic> _$RostroDeMiVisitanteDtoToJson(
  RostroDeMiVisitanteDto instance,
) => <String, dynamic>{
  'vector': instance.vector,
  'medidas': instance.medidas,
  'versionPolitica': instance.versionPolitica,
  'suprimirEn': instance.suprimirEn.toIso8601String(),
};
