// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'billete_del_flujo_dto.g.dart';

@JsonSerializable()
class BilleteDelFlujoDto {
  const BilleteDelFlujoDto({
    required this.billete,
    required this.caducaEn,
    required this.ruta,
  });
  
  factory BilleteDelFlujoDto.fromJson(Map<String, Object?> json) => _$BilleteDelFlujoDtoFromJson(json);
  
  /// Billete de un solo uso; va en `?billete=` del flujo directo.
  final String billete;

  /// Caduca a los 15 s si no se usa.
  final DateTime caducaEn;

  /// Ruta en el origen de la API.
  final String ruta;

  Map<String, Object?> toJson() => _$BilleteDelFlujoDtoToJson(this);
}
