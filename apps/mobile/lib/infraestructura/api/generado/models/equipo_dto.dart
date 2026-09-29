// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'atestacion_de_equipo_dto.dart';
import 'capacidades_de_equipo_dto.dart';
import 'equipo_dto_estado.dart';
import 'equipo_dto_modo_de_terminal.dart';
import 'equipo_dto_tipo.dart';
import 'equipo_dto_verificacion.dart';
import 'estado_del_equipo_dto.dart';

part 'equipo_dto.g.dart';

@JsonSerializable()
class EquipoDto {
  const EquipoDto({
    required this.id,
    required this.nombre,
    required this.tipo,
    required this.modelo,
    required this.firmware,
    required this.canalBarrera,
    required this.numeroDePuerta,
    required this.canalDeAudio,
    required this.fabricante,
    required this.modoDeTerminal,
    required this.canalDeAudioHabilitado,
    required this.canalDeVideo,
    required this.zonaId,
    required this.capacidades,
    required this.verificacion,
    required this.verificadoEn,
    required this.motivoNoVerificado,
    required this.estado,
    required this.atestacion,
    required this.estadoDelEquipo,
    required this.sondeadoEn,
    required this.identidadLeidaEn,
  });
  
  factory EquipoDto.fromJson(Map<String, Object?> json) => _$EquipoDtoFromJson(json);
  
  final String id;
  final String nombre;
  final EquipoDtoTipo tipo;
  final String? modelo;
  final String? firmware;
  final num? canalBarrera;
  final num? numeroDePuerta;
  final num? canalDeAudio;
  final String? fabricante;
  final EquipoDtoModoDeTerminal? modoDeTerminal;
  final bool canalDeAudioHabilitado;

  /// Flujo de video; `null` = 102
  final String? canalDeVideo;
  final String? zonaId;
  final CapacidadesDeEquipoDto? capacidades;
  final EquipoDtoVerificacion verificacion;
  final String? verificadoEn;
  final String? motivoNoVerificado;
  final EquipoDtoEstado estado;

  /// D-11 · la atestación física más reciente del instalador, con su vigencia. `null` si nunca se atestó.
  final AtestacionDeEquipoDto? atestacion;
  final EstadoDelEquipoDto estadoDelEquipo;
  final DateTime? sondeadoEn;

  /// Cuándo se leyeron modelo y firmware del propio equipo («dato del …»)
  final DateTime? identidadLeidaEn;

  Map<String, Object?> toJson() => _$EquipoDtoToJson(this);
}
