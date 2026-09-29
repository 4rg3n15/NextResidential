// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'receptor_de_la_ficha_dto.g.dart';

@JsonSerializable()
class ReceptorDeLaFichaDto {
  const ReceptorDeLaFichaDto({
    required this.host,
    required this.puerto,
    required this.ruta,
  });
  
  factory ReceptorDeLaFichaDto.fromJson(Map<String, Object?> json) => _$ReceptorDeLaFichaDtoFromJson(json);
  
  final String? host;
  final num? puerto;

  /// La ruta con el secreto oculto: /alarm-server/••••
  final String ruta;

  Map<String, Object?> toJson() => _$ReceptorDeLaFichaDtoToJson(this);
}
