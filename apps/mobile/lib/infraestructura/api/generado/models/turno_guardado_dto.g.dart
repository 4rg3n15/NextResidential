// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'turno_guardado_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TurnoGuardadoDto _$TurnoGuardadoDtoFromJson(Map<String, dynamic> json) =>
    TurnoGuardadoDto(
      turno: TurnoDto.fromJson(json['turno'] as Map<String, dynamic>),
      solapes: (json['solapes'] as List<dynamic>)
          .map((e) => TurnoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$TurnoGuardadoDtoToJson(TurnoGuardadoDto instance) =>
    <String, dynamic>{'turno': instance.turno, 'solapes': instance.solapes};
