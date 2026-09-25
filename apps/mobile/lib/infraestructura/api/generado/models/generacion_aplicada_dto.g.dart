// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'generacion_aplicada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GeneracionAplicadaDto _$GeneracionAplicadaDtoFromJson(
  Map<String, dynamic> json,
) => GeneracionAplicadaDto(
  creadas: json['creadas'] as num,
  conservadas: json['conservadas'] as num,
  reactivadas: json['reactivadas'] as num,
);

Map<String, dynamic> _$GeneracionAplicadaDtoToJson(
  GeneracionAplicadaDto instance,
) => <String, dynamic>{
  'creadas': instance.creadas,
  'conservadas': instance.conservadas,
  'reactivadas': instance.reactivadas,
};
