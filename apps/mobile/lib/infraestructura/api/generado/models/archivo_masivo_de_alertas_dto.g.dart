// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'archivo_masivo_de_alertas_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ArchivoMasivoDeAlertasDto _$ArchivoMasivoDeAlertasDtoFromJson(
  Map<String, dynamic> json,
) => ArchivoMasivoDeAlertasDto(
  motivo: json['motivo'] as String,
  ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$ArchivoMasivoDeAlertasDtoToJson(
  ArchivoMasivoDeAlertasDto instance,
) => <String, dynamic>{'motivo': instance.motivo, 'ids': instance.ids};
