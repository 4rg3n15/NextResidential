// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'portero_dto.dart';

part 'porteros_dto.g.dart';

@JsonSerializable()
class PorterosDto {
  const PorterosDto({
    required this.porteros,
  });
  
  factory PorterosDto.fromJson(Map<String, Object?> json) => _$PorterosDtoFromJson(json);
  
  final List<PorteroDto> porteros;

  Map<String, Object?> toJson() => _$PorterosDtoToJson(this);
}
