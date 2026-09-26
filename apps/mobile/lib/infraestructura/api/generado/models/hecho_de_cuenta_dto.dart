// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hecho_de_cuenta_dto_hecho.dart';

part 'hecho_de_cuenta_dto.g.dart';

@JsonSerializable()
class HechoDeCuentaDto {
  const HechoDeCuentaDto({
    required this.hecho,
  });
  
  factory HechoDeCuentaDto.fromJson(Map<String, Object?> json) => _$HechoDeCuentaDtoFromJson(json);
  
  final HechoDeCuentaDtoHecho hecho;

  Map<String, Object?> toJson() => _$HechoDeCuentaDtoToJson(this);
}
