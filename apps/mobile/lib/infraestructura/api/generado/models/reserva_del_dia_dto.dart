// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reserva_del_dia_dto.g.dart';

@JsonSerializable()
class ReservaDelDiaDto {
  const ReservaDelDiaDto({
    required this.id,
    required this.titular,
    required this.desde,
    required this.hasta,
    required this.personas,
  });
  
  factory ReservaDelDiaDto.fromJson(Map<String, Object?> json) => _$ReservaDelDiaDtoFromJson(json);
  
  final String id;
  final String titular;
  final DateTime desde;
  final DateTime hasta;
  final num personas;

  Map<String, Object?> toJson() => _$ReservaDelDiaDtoToJson(this);
}
