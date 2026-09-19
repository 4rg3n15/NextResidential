// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'franja_de_accesos_dto.g.dart';

@JsonSerializable()
class FranjaDeAccesosDto {
  const FranjaDeAccesosDto({
    required this.hora,
    required this.permitidos,
    required this.negados,
  });
  
  factory FranjaDeAccesosDto.fromJson(Map<String, Object?> json) => _$FranjaDeAccesosDtoFromJson(json);
  
  /// Hora local de la copropiedad
  final num hora;
  final num permitidos;
  final num negados;

  Map<String, Object?> toJson() => _$FranjaDeAccesosDtoToJson(this);
}
