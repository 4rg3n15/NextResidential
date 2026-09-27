// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'visitante_reciente_dto.g.dart';

@JsonSerializable()
class VisitanteRecienteDto {
  const VisitanteRecienteDto({
    required this.autorizacionId,
    required this.visitante,
    required this.documento,
    required this.ultimaVisita,
    required this.placa,
    required this.tieneFoto,
  });
  
  factory VisitanteRecienteDto.fromJson(Map<String, Object?> json) => _$VisitanteRecienteDtoFromJson(json);
  
  final String autorizacionId;
  final String visitante;
  final String documento;
  final DateTime ultimaVisita;
  final String? placa;
  final bool tieneFoto;

  Map<String, Object?> toJson() => _$VisitanteRecienteDtoToJson(this);
}
