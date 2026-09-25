// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hecho_de_bitacora_dto_tipo.dart';

part 'hecho_de_bitacora_dto.g.dart';

@JsonSerializable()
class HechoDeBitacoraDto {
  const HechoDeBitacoraDto({
    required this.id,
    required this.tipo,
    required this.ocurridoEn,
    required this.usuarioId,
    required this.nombreUsuario,
    required this.actorId,
    required this.nombreActor,
    required this.turnoId,
    required this.duracionSegundos,
    required this.origenIp,
    required this.origenDeclarado,
    required this.agente,
    required this.detalle,
  });
  
  factory HechoDeBitacoraDto.fromJson(Map<String, Object?> json) => _$HechoDeBitacoraDtoFromJson(json);
  
  final String id;
  final HechoDeBitacoraDtoTipo tipo;
  final DateTime ocurridoEn;
  final String? usuarioId;
  final String? nombreUsuario;
  final String? actorId;
  final String? nombreActor;
  final String? turnoId;
  final num? duracionSegundos;

  /// Dirección que llamó a la API
  final String? origenIp;

  /// Dirección del navegador según la consola
  final String? origenDeclarado;
  final String? agente;
  final String? detalle;

  Map<String, Object?> toJson() => _$HechoDeBitacoraDtoToJson(this);
}
