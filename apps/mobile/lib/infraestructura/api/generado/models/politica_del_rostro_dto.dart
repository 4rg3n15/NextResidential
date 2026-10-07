// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'politica_del_rostro_dto.g.dart';

@JsonSerializable()
class PoliticaDelRostroDto {
  const PoliticaDelRostroDto({
    required this.version,
    required this.texto,
  });
  
  factory PoliticaDelRostroDto.fromJson(Map<String, Object?> json) => _$PoliticaDelRostroDtoFromJson(json);
  
  final String version;
  final String texto;

  Map<String, Object?> toJson() => _$PoliticaDelRostroDtoToJson(this);
}
