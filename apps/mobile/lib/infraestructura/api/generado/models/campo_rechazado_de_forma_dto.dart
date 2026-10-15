// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'campo_rechazado_de_forma_dto.g.dart';

@JsonSerializable()
class CampoRechazadoDeFormaDto {
  const CampoRechazadoDeFormaDto({
    required this.campo,
    required this.motivo,
  });
  
  factory CampoRechazadoDeFormaDto.fromJson(Map<String, Object?> json) => _$CampoRechazadoDeFormaDtoFromJson(json);
  
  final String campo;
  final String motivo;

  Map<String, Object?> toJson() => _$CampoRechazadoDeFormaDtoToJson(this);
}
