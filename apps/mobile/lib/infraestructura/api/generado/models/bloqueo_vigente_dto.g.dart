// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bloqueo_vigente_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BloqueoVigenteDto _$BloqueoVigenteDtoFromJson(Map<String, dynamic> json) =>
    BloqueoVigenteDto(
      dispositivoId: json['dispositivoId'] as String,
      bloqueado: json['bloqueado'] as bool,
      motivo: json['motivo'] as String,
      operadorId: json['operadorId'] as String,
      rol: json['rol'] as String,
      desde: DateTime.parse(json['desde'] as String),
      resultado: json['resultado'] == null
          ? null
          : BloqueoVigenteDtoResultado.fromJson(json['resultado'] as String),
      detalle: json['detalle'] as String?,
    );

Map<String, dynamic> _$BloqueoVigenteDtoToJson(BloqueoVigenteDto instance) =>
    <String, dynamic>{
      'dispositivoId': instance.dispositivoId,
      'bloqueado': instance.bloqueado,
      'motivo': instance.motivo,
      'operadorId': instance.operadorId,
      'rol': instance.rol,
      'desde': instance.desde.toIso8601String(),
      'resultado': instance.resultado,
      'detalle': instance.detalle,
    };
