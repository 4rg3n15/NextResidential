// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patron_de_visita_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PatronDeVisitaDto _$PatronDeVisitaDtoFromJson(Map<String, dynamic> json) =>
    PatronDeVisitaDto(
      dias: (json['dias'] as List<dynamic>).map((e) => e as num).toList(),
      minutoInicio: json['minutoInicio'] as num,
      minutoFin: json['minutoFin'] as num,
      desplazamientoUtcMinutos: json['desplazamientoUtcMinutos'] as num,
    );

Map<String, dynamic> _$PatronDeVisitaDtoToJson(PatronDeVisitaDto instance) =>
    <String, dynamic>{
      'dias': instance.dias,
      'minutoInicio': instance.minutoInicio,
      'minutoFin': instance.minutoFin,
      'desplazamientoUtcMinutos': instance.desplazamientoUtcMinutos,
    };
