// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'foto_de_visita_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FotoDeVisitaDto _$FotoDeVisitaDtoFromJson(Map<String, dynamic> json) =>
    FotoDeVisitaDto(
      contenidoBase64: json['contenidoBase64'] as String,
      tipoMime: FotoDeVisitaDtoTipoMime.fromJson(json['tipoMime'] as String),
      medidas: MedidasDeFotoDto.fromJson(
        json['medidas'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$FotoDeVisitaDtoToJson(FotoDeVisitaDto instance) =>
    <String, dynamic>{
      'contenidoBase64': instance.contenidoBase64,
      'tipoMime': instance.tipoMime,
      'medidas': instance.medidas,
    };
