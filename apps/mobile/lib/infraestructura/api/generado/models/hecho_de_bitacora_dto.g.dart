// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hecho_de_bitacora_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HechoDeBitacoraDto _$HechoDeBitacoraDtoFromJson(Map<String, dynamic> json) =>
    HechoDeBitacoraDto(
      id: json['id'] as String,
      tipo: HechoDeBitacoraDtoTipo.fromJson(json['tipo'] as String),
      ocurridoEn: DateTime.parse(json['ocurridoEn'] as String),
      usuarioId: json['usuarioId'] as String?,
      nombreUsuario: json['nombreUsuario'] as String?,
      actorId: json['actorId'] as String?,
      nombreActor: json['nombreActor'] as String?,
      turnoId: json['turnoId'] as String?,
      duracionSegundos: json['duracionSegundos'] as num?,
      origenIp: json['origenIp'] as String?,
      origenDeclarado: json['origenDeclarado'] as String?,
      agente: json['agente'] as String?,
      detalle: json['detalle'] as String?,
    );

Map<String, dynamic> _$HechoDeBitacoraDtoToJson(HechoDeBitacoraDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'tipo': instance.tipo,
      'ocurridoEn': instance.ocurridoEn.toIso8601String(),
      'usuarioId': instance.usuarioId,
      'nombreUsuario': instance.nombreUsuario,
      'actorId': instance.actorId,
      'nombreActor': instance.nombreActor,
      'turnoId': instance.turnoId,
      'duracionSegundos': instance.duracionSegundos,
      'origenIp': instance.origenIp,
      'origenDeclarado': instance.origenDeclarado,
      'agente': instance.agente,
      'detalle': instance.detalle,
    };
