// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'descarga_de_respaldo_dto.g.dart';

@JsonSerializable()
class DescargaDeRespaldoDto {
  const DescargaDeRespaldoDto({
    required this.url,
    required this.segundosDeVida,
  });
  
  factory DescargaDeRespaldoDto.fromJson(Map<String, Object?> json) => _$DescargaDeRespaldoDtoFromJson(json);
  
  /// URL firmada del bucket privado (RN-21)
  final String url;
  final num segundosDeVida;

  Map<String, Object?> toJson() => _$DescargaDeRespaldoDtoToJson(this);
}
