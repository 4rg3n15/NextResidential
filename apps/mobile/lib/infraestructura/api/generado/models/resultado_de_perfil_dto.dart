// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'campo_rechazado_dto.dart';
import 'perfil_del_residente_dto.dart';
import 'resultado_de_perfil_dto_motivo.dart';

part 'resultado_de_perfil_dto.g.dart';

@JsonSerializable()
class ResultadoDePerfilDto {
  const ResultadoDePerfilDto({
    required this.guardado,
    required this.motivo,
    required this.campos,
    this.perfil,
  });
  
  factory ResultadoDePerfilDto.fromJson(Map<String, Object?> json) => _$ResultadoDePerfilDtoFromJson(json);
  
  final bool guardado;
  final PerfilDelResidenteDto? perfil;
  final ResultadoDePerfilDtoMotivo? motivo;
  final List<CampoRechazadoDto> campos;

  Map<String, Object?> toJson() => _$ResultadoDePerfilDtoToJson(this);
}
