// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'patron_en_la_instantanea_dto.g.dart';

@JsonSerializable()
class PatronEnLaInstantaneaDto {
  const PatronEnLaInstantaneaDto({
    required this.dias,
    required this.minutoInicio,
    required this.minutoFin,
    required this.desplazamientoUtcMinutos,
  });
  
  factory PatronEnLaInstantaneaDto.fromJson(Map<String, Object?> json) => _$PatronEnLaInstantaneaDtoFromJson(json);
  
  final List<num> dias;
  final num minutoInicio;
  final num minutoFin;
  final num desplazamientoUtcMinutos;

  Map<String, Object?> toJson() => _$PatronEnLaInstantaneaDtoToJson(this);
}
