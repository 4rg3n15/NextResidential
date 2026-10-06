// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'estado_del_registro_dto.g.dart';

@JsonSerializable()
class EstadoDelRegistroDto {
  const EstadoDelRegistroDto({
    required this.suspendido,
    required this.hasta,
    required this.fallosRecientes,
  });
  
  factory EstadoDelRegistroDto.fromJson(Map<String, Object?> json) => _$EstadoDelRegistroDtoFromJson(json);
  
  final bool suspendido;
  final DateTime? hasta;

  /// Códigos fallidos en la última hora
  final num fallosRecientes;

  Map<String, Object?> toJson() => _$EstadoDelRegistroDtoToJson(this);
}
