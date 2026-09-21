// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patron_de_autorizacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PatronDeAutorizacionDto _$PatronDeAutorizacionDtoFromJson(
  Map<String, dynamic> json,
) => PatronDeAutorizacionDto(
  dias: (json['dias'] as List<dynamic>).map((e) => e as num).toList(),
  horaInicio: json['horaInicio'] as String,
  horaFin: json['horaFin'] as String,
);

Map<String, dynamic> _$PatronDeAutorizacionDtoToJson(
  PatronDeAutorizacionDto instance,
) => <String, dynamic>{
  'dias': instance.dias,
  'horaInicio': instance.horaInicio,
  'horaFin': instance.horaFin,
};
