// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'modo_vigente_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModoVigenteDto _$ModoVigenteDtoFromJson(Map<String, dynamic> json) =>
    ModoVigenteDto(
      id: json['id'] as String,
      dispositivoId: json['dispositivoId'] as String,
      numeroDePuerta: json['numeroDePuerta'] as num,
      modo: ModoVigenteDtoModo.fromJson(json['modo'] as String),
      motivo: json['motivo'] as String,
      operadorId: json['operadorId'] as String,
      operadorNombre: json['operadorNombre'] as String?,
      rol: json['rol'] as String,
      desde: DateTime.parse(json['desde'] as String),
      revierteEn: DateTime.parse(json['revierteEn'] as String),
      resultado: json['resultado'] == null
          ? null
          : ModoVigenteDtoResultado.fromJson(json['resultado'] as String),
      reversionesFallidas: json['reversionesFallidas'] as num,
    );

Map<String, dynamic> _$ModoVigenteDtoToJson(ModoVigenteDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'dispositivoId': instance.dispositivoId,
      'numeroDePuerta': instance.numeroDePuerta,
      'modo': instance.modo,
      'motivo': instance.motivo,
      'operadorId': instance.operadorId,
      'operadorNombre': instance.operadorNombre,
      'rol': instance.rol,
      'desde': instance.desde.toIso8601String(),
      'revierteEn': instance.revierteEn.toIso8601String(),
      'resultado': instance.resultado,
      'reversionesFallidas': instance.reversionesFallidas,
    };
