// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'franja_de_hoy_dto.g.dart';

@JsonSerializable()
class FranjaDeHoyDto {
  const FranjaDeHoyDto({
    required this.desde,
    required this.hasta,
  });
  
  factory FranjaDeHoyDto.fromJson(Map<String, Object?> json) => _$FranjaDeHoyDtoFromJson(json);
  
  final DateTime desde;
  final DateTime hasta;

  Map<String, Object?> toJson() => _$FranjaDeHoyDtoToJson(this);
}
