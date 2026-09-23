// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'alta_de_equipo_dto_protocolo.dart';
import 'alta_de_equipo_dto_tipo.dart';

part 'alta_de_equipo_dto.g.dart';

@JsonSerializable()
class AltaDeEquipoDto {
  const AltaDeEquipoDto({
    required this.nombre,
    required this.tipo,
    required this.host,
    required this.puerto,
    required this.usuario,
    this.secreto,
    this.canalBarrera,
    this.numeroDePuerta,
    this.canalDeAudio,
    this.protocolo = AltaDeEquipoDtoProtocolo.http,
    this.probarConexion = true,
  });
  
  factory AltaDeEquipoDto.fromJson(Map<String, Object?> json) => _$AltaDeEquipoDtoFromJson(json);
  
  final String nombre;
  final AltaDeEquipoDtoTipo tipo;
  final String host;
  final num puerto;
  final AltaDeEquipoDtoProtocolo protocolo;
  final String usuario;
  final String? secreto;
  final num? canalBarrera;
  final num? numeroDePuerta;
  final num? canalDeAudio;
  final bool probarConexion;

  Map<String, Object?> toJson() => _$AltaDeEquipoDtoToJson(this);
}
