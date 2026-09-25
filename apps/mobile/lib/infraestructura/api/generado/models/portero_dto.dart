// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sesion_abierta_dto.dart';
import 'turno_dto.dart';

part 'portero_dto.g.dart';

@JsonSerializable()
class PorteroDto {
  const PorteroDto({
    required this.usuarioId,
    required this.usuario,
    required this.nombre,
    required this.telefono,
    required this.correoContacto,
    required this.porteria,
    required this.sectores,
    required this.debeCambiarContrasena,
    required this.turnoVigente,
    required this.sesionAbierta,
  });
  
  factory PorteroDto.fromJson(Map<String, Object?> json) => _$PorteroDtoFromJson(json);
  
  final String usuarioId;
  final String? usuario;
  final String nombre;
  final String? telefono;
  final String? correoContacto;
  final String? porteria;
  final List<String> sectores;
  final bool debeCambiarContrasena;
  final TurnoDto? turnoVigente;
  final SesionAbiertaDto? sesionAbierta;

  Map<String, Object?> toJson() => _$PorteroDtoToJson(this);
}
