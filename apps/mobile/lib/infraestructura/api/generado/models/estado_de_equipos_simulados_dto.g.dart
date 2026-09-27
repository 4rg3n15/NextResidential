// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'estado_de_equipos_simulados_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EstadoDeEquiposSimuladosDto _$EstadoDeEquiposSimuladosDtoFromJson(
  Map<String, dynamic> json,
) => EstadoDeEquiposSimuladosDto(
  simulado: json['simulado'] as bool,
  equiposRegistrados: json['equiposRegistrados'] as num,
  aviso: json['aviso'] as String?,
);

Map<String, dynamic> _$EstadoDeEquiposSimuladosDtoToJson(
  EstadoDeEquiposSimuladosDto instance,
) => <String, dynamic>{
  'simulado': instance.simulado,
  'equiposRegistrados': instance.equiposRegistrados,
  'aviso': instance.aviso,
};
