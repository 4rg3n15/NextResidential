// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'franja_de_horario_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FranjaDeHorarioDto _$FranjaDeHorarioDtoFromJson(Map<String, dynamic> json) =>
    FranjaDeHorarioDto(
      dia: json['dia'] as num,
      minutoInicio: json['minutoInicio'] as num,
      minutoFin: json['minutoFin'] as num,
      continuaDelDiaAnterior: json['continuaDelDiaAnterior'] as bool,
    );

Map<String, dynamic> _$FranjaDeHorarioDtoToJson(FranjaDeHorarioDto instance) =>
    <String, dynamic>{
      'dia': instance.dia,
      'minutoInicio': instance.minutoInicio,
      'minutoFin': instance.minutoFin,
      'continuaDelDiaAnterior': instance.continuaDelDiaAnterior,
    };
