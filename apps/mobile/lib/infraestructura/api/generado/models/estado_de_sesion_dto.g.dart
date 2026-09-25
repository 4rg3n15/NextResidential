// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'estado_de_sesion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EstadoDeSesionDto _$EstadoDeSesionDtoFromJson(Map<String, dynamic> json) =>
    EstadoDeSesionDto(
      estado: EstadoDeSesionDtoEstado.fromJson(json['estado'] as String),
      codigo: json['codigo'] as String?,
      turnoInicio: json['turnoInicio'] == null
          ? null
          : DateTime.parse(json['turnoInicio'] as String),
      turnoFin: json['turnoFin'] == null
          ? null
          : DateTime.parse(json['turnoFin'] as String),
      porteria: json['porteria'] as String?,
      intentosRestantes: json['intentosRestantes'] as num?,
      patrullajeDesde: json['patrullajeDesde'] == null
          ? null
          : DateTime.parse(json['patrullajeDesde'] as String),
      motivoCierre: json['motivoCierre'] as String?,
    );

Map<String, dynamic> _$EstadoDeSesionDtoToJson(EstadoDeSesionDto instance) =>
    <String, dynamic>{
      'estado': instance.estado,
      'codigo': instance.codigo,
      'turnoInicio': instance.turnoInicio?.toIso8601String(),
      'turnoFin': instance.turnoFin?.toIso8601String(),
      'porteria': instance.porteria,
      'intentosRestantes': instance.intentosRestantes,
      'patrullajeDesde': instance.patrullajeDesde?.toIso8601String(),
      'motivoCierre': instance.motivoCierre,
    };
