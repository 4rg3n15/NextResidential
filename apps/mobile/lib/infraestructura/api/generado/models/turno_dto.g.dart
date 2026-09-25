// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'turno_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TurnoDto _$TurnoDtoFromJson(Map<String, dynamic> json) => TurnoDto(
  id: json['id'] as String,
  porteroId: json['porteroId'] as String,
  porteria: json['porteria'] as String?,
  dia: json['dia'] as String,
  horaInicio: json['horaInicio'] as String,
  horaFin: json['horaFin'] as String,
  inicio: DateTime.parse(json['inicio'] as String),
  fin: DateTime.parse(json['fin'] as String),
  cruzaMedianoche: json['cruzaMedianoche'] as bool,
  tipo: TurnoDtoTipo.fromJson(json['tipo'] as String),
  motivo: json['motivo'] as String?,
);

Map<String, dynamic> _$TurnoDtoToJson(TurnoDto instance) => <String, dynamic>{
  'id': instance.id,
  'porteroId': instance.porteroId,
  'porteria': instance.porteria,
  'dia': instance.dia,
  'horaInicio': instance.horaInicio,
  'horaFin': instance.horaFin,
  'inicio': instance.inicio.toIso8601String(),
  'fin': instance.fin.toIso8601String(),
  'cruzaMedianoche': instance.cruzaMedianoche,
  'tipo': instance.tipo,
  'motivo': instance.motivo,
};
