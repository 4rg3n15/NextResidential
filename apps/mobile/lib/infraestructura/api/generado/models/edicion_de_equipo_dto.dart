// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'edicion_de_equipo_dto_modo_de_terminal.dart';
import 'edicion_de_equipo_dto_protocolo.dart';
import 'edicion_de_equipo_dto_tipo.dart';

part 'edicion_de_equipo_dto.g.dart';

@JsonSerializable()
class EdicionDeEquipoDto {
  const EdicionDeEquipoDto({
    this.protocolo = EdicionDeEquipoDtoProtocolo.http,
    this.canalDeAudioHabilitado = false,
    this.probarConexion = true,
    this.nombre,
    this.tipo,
    this.host,
    this.puerto,
    this.usuario,
    this.secreto,
    this.canalBarrera,
    this.numeroDePuerta,
    this.canalDeAudio,
    this.fabricante,
    this.modoDeTerminal,
  });
  
  factory EdicionDeEquipoDto.fromJson(Map<String, Object?> json) => _$EdicionDeEquipoDtoFromJson(json);
  
  final String? nombre;
  final EdicionDeEquipoDtoTipo? tipo;
  final String? host;
  final num? puerto;
  final EdicionDeEquipoDtoProtocolo protocolo;
  final String? usuario;
  final String? secreto;
  final num? canalBarrera;
  final num? numeroDePuerta;
  final num? canalDeAudio;
  final String? fabricante;
  final EdicionDeEquipoDtoModoDeTerminal? modoDeTerminal;
  final bool canalDeAudioHabilitado;
  final bool probarConexion;

  Map<String, Object?> toJson() => _$EdicionDeEquipoDtoToJson(this);
}
