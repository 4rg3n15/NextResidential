// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'franja_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FranjaDto _$FranjaDtoFromJson(Map<String, dynamic> json) => FranjaDto(
  dia: json['dia'] as num,
  minutoInicio: json['minutoInicio'] as num,
  minutoFin: json['minutoFin'] as num,
  continuaDelDiaAnterior: json['continuaDelDiaAnterior'] as bool?,
);

Map<String, dynamic> _$FranjaDtoToJson(FranjaDto instance) => <String, dynamic>{
  'dia': instance.dia,
  'minutoInicio': instance.minutoInicio,
  'minutoFin': instance.minutoFin,
  'continuaDelDiaAnterior': instance.continuaDelDiaAnterior,
};
