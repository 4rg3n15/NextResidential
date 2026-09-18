// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'rechazo_de_ajuste_dto.g.dart';

@JsonSerializable()
class RechazoDeAjusteDto {
  const RechazoDeAjusteDto({
    required this.clave,
    required this.motivo,
  });
  
  factory RechazoDeAjusteDto.fromJson(Map<String, Object?> json) => _$RechazoDeAjusteDtoFromJson(json);
  
  final String clave;
  final String motivo;

  Map<String, Object?> toJson() => _$RechazoDeAjusteDtoToJson(this);
}
