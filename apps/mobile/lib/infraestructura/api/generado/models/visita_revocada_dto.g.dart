// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'visita_revocada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VisitaRevocadaDto _$VisitaRevocadaDtoFromJson(Map<String, dynamic> json) =>
    VisitaRevocadaDto(
      revocada: json['revocada'] as bool,
      rostrosSuprimidos: json['rostrosSuprimidos'] as num,
      equiposRetirados: json['equiposRetirados'] as num,
      equiposPendientes: json['equiposPendientes'] as num,
    );

Map<String, dynamic> _$VisitaRevocadaDtoToJson(VisitaRevocadaDto instance) =>
    <String, dynamic>{
      'revocada': instance.revocada,
      'rostrosSuprimidos': instance.rostrosSuprimidos,
      'equiposRetirados': instance.equiposRetirados,
      'equiposPendientes': instance.equiposPendientes,
    };
