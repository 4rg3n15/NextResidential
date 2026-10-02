// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patron_en_la_instantanea_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PatronEnLaInstantaneaDto _$PatronEnLaInstantaneaDtoFromJson(
  Map<String, dynamic> json,
) => PatronEnLaInstantaneaDto(
  dias: (json['dias'] as List<dynamic>).map((e) => e as num).toList(),
  minutoInicio: json['minutoInicio'] as num,
  minutoFin: json['minutoFin'] as num,
  desplazamientoUtcMinutos: json['desplazamientoUtcMinutos'] as num,
);

Map<String, dynamic> _$PatronEnLaInstantaneaDtoToJson(
  PatronEnLaInstantaneaDto instance,
) => <String, dynamic>{
  'dias': instance.dias,
  'minutoInicio': instance.minutoInicio,
  'minutoFin': instance.minutoFin,
  'desplazamientoUtcMinutos': instance.desplazamientoUtcMinutos,
};
