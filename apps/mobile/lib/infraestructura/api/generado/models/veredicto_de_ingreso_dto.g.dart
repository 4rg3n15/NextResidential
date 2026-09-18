// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'veredicto_de_ingreso_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VeredictoDeIngresoDto _$VeredictoDeIngresoDtoFromJson(
  Map<String, dynamic> json,
) => VeredictoDeIngresoDto(
  admitido: json['admitido'] as bool,
  conteo: json['conteo'] as num?,
  motivo: json['motivo'] as String?,
);

Map<String, dynamic> _$VeredictoDeIngresoDtoToJson(
  VeredictoDeIngresoDto instance,
) => <String, dynamic>{
  'admitido': instance.admitido,
  'conteo': instance.conteo,
  'motivo': instance.motivo,
};
