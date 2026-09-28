// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'foto_en_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FotoEnEquipoDto _$FotoEnEquipoDtoFromJson(Map<String, dynamic> json) =>
    FotoEnEquipoDto(
      dispositivoId: json['dispositivoId'] as String,
      equipo: json['equipo'] as String,
      estado: FotoEnEquipoDtoEstado.fromJson(json['estado'] as String),
      detalle: json['detalle'] as String?,
      intentos: json['intentos'] as num,
      actualizadoEn: DateTime.parse(json['actualizadoEn'] as String),
    );

Map<String, dynamic> _$FotoEnEquipoDtoToJson(FotoEnEquipoDto instance) =>
    <String, dynamic>{
      'dispositivoId': instance.dispositivoId,
      'equipo': instance.equipo,
      'estado': instance.estado,
      'detalle': instance.detalle,
      'intentos': instance.intentos,
      'actualizadoEn': instance.actualizadoEn.toIso8601String(),
    };
