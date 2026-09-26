// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'datos_de_turno_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DatosDeTurnoDto _$DatosDeTurnoDtoFromJson(Map<String, dynamic> json) =>
    DatosDeTurnoDto(
      porteroId: json['porteroId'] as String,
      dia: json['dia'] as String,
      horaInicio: json['horaInicio'] as String,
      horaFin: json['horaFin'] as String,
      tipo: DatosDeTurnoDtoTipo.fromJson(json['tipo'] as String),
      porteria: json['porteria'] as String?,
      motivo: json['motivo'] as String?,
    );

Map<String, dynamic> _$DatosDeTurnoDtoToJson(DatosDeTurnoDto instance) =>
    <String, dynamic>{
      'porteroId': instance.porteroId,
      'porteria': instance.porteria,
      'dia': instance.dia,
      'horaInicio': instance.horaInicio,
      'horaFin': instance.horaFin,
      'tipo': instance.tipo,
      'motivo': instance.motivo,
    };
