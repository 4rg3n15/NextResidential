// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patron_de_entrada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PatronDeEntradaDto _$PatronDeEntradaDtoFromJson(Map<String, dynamic> json) =>
    PatronDeEntradaDto(
      dias: (json['dias'] as List<dynamic>).map((e) => e as num).toList(),
      minutoInicio: json['minutoInicio'] as num,
      minutoFin: json['minutoFin'] as num,
      desplazamientoUtcMinutos: json['desplazamientoUtcMinutos'] as num,
    );

Map<String, dynamic> _$PatronDeEntradaDtoToJson(PatronDeEntradaDto instance) =>
    <String, dynamic>{
      'dias': instance.dias,
      'minutoInicio': instance.minutoInicio,
      'minutoFin': instance.minutoFin,
      'desplazamientoUtcMinutos': instance.desplazamientoUtcMinutos,
    };
