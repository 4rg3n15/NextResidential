// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'franja_de_horario_dto.dart';
import 'reserva_del_dia_dto.dart';

part 'zona_dto.g.dart';

@JsonSerializable()
class ZonaDto {
  const ZonaDto({
    required this.id,
    required this.nombre,
    required this.tipo,
    required this.abierta,
    required this.politicaReinicio,
    required this.normas,
    required this.aforoMaximo,
    required this.aforoActual,
    required this.aforoDisponible,
    required this.dentroDeHorario,
    required this.aforoCompleto,
    required this.horario,
    required this.desplazamientoUtcMinutos,
    required this.reservasDelDia,
  });
  
  factory ZonaDto.fromJson(Map<String, Object?> json) => _$ZonaDtoFromJson(json);
  
  final String id;
  final String nombre;
  final String tipo;
  final bool abierta;
  final String politicaReinicio;
  final List<String> normas;
  final num aforoMaximo;
  final num aforoActual;
  final num aforoDisponible;
  final bool dentroDeHorario;
  final bool aforoCompleto;
  final List<FranjaDeHorarioDto> horario;

  /// Minutos de desfase UTC del horario de la zona.
  final num desplazamientoUtcMinutos;

  /// Reservas del día. Vacío mientras no exista el módulo de reservas (P-15): la pantalla muestra el estado vacío, que es información honesta, y no un número inventado.
  final List<ReservaDelDiaDto> reservasDelDia;

  Map<String, Object?> toJson() => _$ZonaDtoToJson(this);
}
