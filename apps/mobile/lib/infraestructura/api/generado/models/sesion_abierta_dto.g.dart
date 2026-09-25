// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sesion_abierta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SesionAbiertaDto _$SesionAbiertaDtoFromJson(Map<String, dynamic> json) =>
    SesionAbiertaDto(
      estado: SesionAbiertaDtoEstado.fromJson(json['estado'] as String),
      iniciadaEn: DateTime.parse(json['iniciadaEn'] as String),
      patrullajeDesde: json['patrullajeDesde'] == null
          ? null
          : DateTime.parse(json['patrullajeDesde'] as String),
      origen: json['origen'] as String?,
    );

Map<String, dynamic> _$SesionAbiertaDtoToJson(SesionAbiertaDto instance) =>
    <String, dynamic>{
      'estado': instance.estado,
      'iniciadaEn': instance.iniciadaEn.toIso8601String(),
      'patrullajeDesde': instance.patrullajeDesde?.toIso8601String(),
      'origen': instance.origen,
    };
