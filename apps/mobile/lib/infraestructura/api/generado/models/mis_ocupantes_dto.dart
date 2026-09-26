// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'plaza_de_ocupante_dto.dart';

part 'mis_ocupantes_dto.g.dart';

@JsonSerializable()
class MisOcupantesDto {
  const MisOcupantesDto({
    required this.declarados,
    required this.declarada,
    required this.plazas,
    required this.aviso,
  });
  
  factory MisOcupantesDto.fromJson(Map<String, Object?> json) => _$MisOcupantesDtoFromJson(json);
  
  final num declarados;
  final bool declarada;
  final List<PlazaDeOcupanteDto> plazas;
  final String aviso;

  Map<String, Object?> toJson() => _$MisOcupantesDtoToJson(this);
}
