// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'equipo_del_rostro_dto.dart';
import 'mi_rostro_con_politica_dto_estado.dart';
import 'politica_del_rostro_dto.dart';

part 'mi_rostro_con_politica_dto.g.dart';

@JsonSerializable()
class MiRostroConPoliticaDto {
  const MiRostroConPoliticaDto({
    required this.estado,
    required this.calidad,
    required this.registradoEn,
    required this.venceEn,
    required this.diasParaVencer,
    required this.equiposConRostro,
    required this.equiposConMiRostro,
    required this.equipos,
    required this.politica,
  });
  
  factory MiRostroConPoliticaDto.fromJson(Map<String, Object?> json) => _$MiRostroConPoliticaDtoFromJson(json);
  
  final MiRostroConPoliticaDtoEstado estado;
  final num? calidad;
  final DateTime? registradoEn;
  final DateTime? venceEn;
  final num? diasParaVencer;
  final num equiposConRostro;
  final num equiposConMiRostro;
  final List<EquipoDelRostroDto> equipos;
  final PoliticaDelRostroDto politica;

  Map<String, Object?> toJson() => _$MiRostroConPoliticaDtoToJson(this);
}
