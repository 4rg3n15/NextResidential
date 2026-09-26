// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'turnos_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TurnosDto _$TurnosDtoFromJson(Map<String, dynamic> json) => TurnosDto(
  turnos: (json['turnos'] as List<dynamic>)
      .map((e) => TurnoDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$TurnosDtoToJson(TurnosDto instance) => <String, dynamic>{
  'turnos': instance.turnos,
};
