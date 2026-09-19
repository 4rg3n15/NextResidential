// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patron_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PatronDto _$PatronDtoFromJson(Map<String, dynamic> json) => PatronDto(
  dias: (json['dias'] as List<dynamic>).map((e) => e as num).toList(),
  horaInicio: json['horaInicio'] as String,
  horaFin: json['horaFin'] as String,
);

Map<String, dynamic> _$PatronDtoToJson(PatronDto instance) => <String, dynamic>{
  'dias': instance.dias,
  'horaInicio': instance.horaInicio,
  'horaFin': instance.horaFin,
};
