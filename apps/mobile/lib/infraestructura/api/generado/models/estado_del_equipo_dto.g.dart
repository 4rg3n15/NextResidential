// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'estado_del_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EstadoDelEquipoDto _$EstadoDelEquipoDtoFromJson(Map<String, dynamic> json) =>
    EstadoDelEquipoDto(
      enLinea: EstadoDelEquipoDtoEnLinea.fromJson(json['enLinea'] as String),
      motivo: json['motivo'] as String,
      alcanzable: json['alcanzable'] as bool?,
      autenticacion: EstadoDelEquipoDtoAutenticacion.fromJson(
        json['autenticacion'] as String,
      ),
      autenticacionRechazadaHaceMin:
          json['autenticacionRechazadaHaceMin'] as num?,
      escucha: EstadoDelEquipoDtoEscucha.fromJson(json['escucha'] as String),
      ultimoEvento: json['ultimoEvento'] == null
          ? null
          : DateTime.parse(json['ultimoEvento'] as String),
      ultimoLatido: json['ultimoLatido'] == null
          ? null
          : DateTime.parse(json['ultimoLatido'] as String),
      ultimaSenal: json['ultimaSenal'] == null
          ? null
          : DateTime.parse(json['ultimaSenal'] as String),
    );

Map<String, dynamic> _$EstadoDelEquipoDtoToJson(EstadoDelEquipoDto instance) =>
    <String, dynamic>{
      'enLinea': instance.enLinea,
      'motivo': instance.motivo,
      'alcanzable': instance.alcanzable,
      'autenticacion': instance.autenticacion,
      'autenticacionRechazadaHaceMin': instance.autenticacionRechazadaHaceMin,
      'escucha': instance.escucha,
      'ultimoEvento': instance.ultimoEvento?.toIso8601String(),
      'ultimoLatido': instance.ultimoLatido?.toIso8601String(),
      'ultimaSenal': instance.ultimaSenal?.toIso8601String(),
    };
