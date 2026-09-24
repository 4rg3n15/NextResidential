// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'borrado_definitivo_de_vehiculo_dto.g.dart';

@JsonSerializable()
class BorradoDefinitivoDeVehiculoDto {
  const BorradoDefinitivoDeVehiculoDto({
    required this.borrado,
    required this.placa,
  });
  
  factory BorradoDefinitivoDeVehiculoDto.fromJson(Map<String, Object?> json) => _$BorradoDefinitivoDeVehiculoDtoFromJson(json);
  
  final bool borrado;
  final String placa;

  Map<String, Object?> toJson() => _$BorradoDefinitivoDeVehiculoDtoToJson(this);
}
