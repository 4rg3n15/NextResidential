// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'franja_en_la_instantanea_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FranjaEnLaInstantaneaDto _$FranjaEnLaInstantaneaDtoFromJson(
  Map<String, dynamic> json,
) => FranjaEnLaInstantaneaDto(
  dia: json['dia'] as num,
  minutoInicio: json['minutoInicio'] as num,
  minutoFin: json['minutoFin'] as num,
  continuaDelDiaAnterior: json['continuaDelDiaAnterior'] as bool,
);

Map<String, dynamic> _$FranjaEnLaInstantaneaDtoToJson(
  FranjaEnLaInstantaneaDto instance,
) => <String, dynamic>{
  'dia': instance.dia,
  'minutoInicio': instance.minutoInicio,
  'minutoFin': instance.minutoFin,
  'continuaDelDiaAnterior': instance.continuaDelDiaAnterior,
};
