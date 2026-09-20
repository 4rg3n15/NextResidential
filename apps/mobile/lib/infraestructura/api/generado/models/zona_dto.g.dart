// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'zona_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ZonaDto _$ZonaDtoFromJson(Map<String, dynamic> json) => ZonaDto(
  id: json['id'] as String,
  nombre: json['nombre'] as String,
  tipo: json['tipo'] as String,
  abierta: json['abierta'] as bool,
  politicaReinicio: json['politicaReinicio'] as String,
  normas: (json['normas'] as List<dynamic>).map((e) => e as String).toList(),
  aforoMaximo: json['aforoMaximo'] as num,
  aforoActual: json['aforoActual'] as num,
  aforoDisponible: json['aforoDisponible'] as num,
  dentroDeHorario: json['dentroDeHorario'] as bool,
  aforoCompleto: json['aforoCompleto'] as bool,
  horario: (json['horario'] as List<dynamic>)
      .map((e) => FranjaDeHorarioDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  desplazamientoUtcMinutos: json['desplazamientoUtcMinutos'] as num,
  reservasDelDia: (json['reservasDelDia'] as List<dynamic>)
      .map((e) => ReservaDelDiaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ZonaDtoToJson(ZonaDto instance) => <String, dynamic>{
  'id': instance.id,
  'nombre': instance.nombre,
  'tipo': instance.tipo,
  'abierta': instance.abierta,
  'politicaReinicio': instance.politicaReinicio,
  'normas': instance.normas,
  'aforoMaximo': instance.aforoMaximo,
  'aforoActual': instance.aforoActual,
  'aforoDisponible': instance.aforoDisponible,
  'dentroDeHorario': instance.dentroDeHorario,
  'aforoCompleto': instance.aforoCompleto,
  'horario': instance.horario,
  'desplazamientoUtcMinutos': instance.desplazamientoUtcMinutos,
  'reservasDelDia': instance.reservasDelDia,
};
