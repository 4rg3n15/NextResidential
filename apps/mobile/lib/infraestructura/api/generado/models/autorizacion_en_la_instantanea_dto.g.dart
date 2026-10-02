// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'autorizacion_en_la_instantanea_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutorizacionEnLaInstantaneaDto _$AutorizacionEnLaInstantaneaDtoFromJson(
  Map<String, dynamic> json,
) => AutorizacionEnLaInstantaneaDto(
  id: json['id'] as String,
  viviendaId: json['viviendaId'] as String,
  personaId: json['personaId'] as String,
  desde: DateTime.parse(json['desde'] as String),
  hasta: DateTime.parse(json['hasta'] as String),
  estado: AutorizacionEnLaInstantaneaDtoEstado.fromJson(
    json['estado'] as String,
  ),
  zonasPermitidas: (json['zonasPermitidas'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  acompanantes: (json['acompanantes'] as List<dynamic>)
      .map(
        (e) =>
            AcompananteEnLaInstantaneaDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  maximoAcompanantes: json['maximoAcompanantes'] as num,
  patron: json['patron'] == null
      ? null
      : PatronEnLaInstantaneaDto.fromJson(
          json['patron'] as Map<String, dynamic>,
        ),
  placa: json['placa'] as String?,
);

Map<String, dynamic> _$AutorizacionEnLaInstantaneaDtoToJson(
  AutorizacionEnLaInstantaneaDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'viviendaId': instance.viviendaId,
  'personaId': instance.personaId,
  'desde': instance.desde.toIso8601String(),
  'hasta': instance.hasta.toIso8601String(),
  'estado': instance.estado,
  'zonasPermitidas': instance.zonasPermitidas,
  'acompanantes': instance.acompanantes,
  'maximoAcompanantes': instance.maximoAcompanantes,
  'patron': instance.patron,
  'placa': instance.placa,
};
