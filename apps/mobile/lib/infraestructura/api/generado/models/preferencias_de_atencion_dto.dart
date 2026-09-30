// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'preferencia_de_disparador_dto.dart';

part 'preferencias_de_atencion_dto.g.dart';

@JsonSerializable()
class PreferenciasDeAtencionDto {
  const PreferenciasDeAtencionDto({
    required this.llamada,
    required this.rostro,
    required this.placa,
    required this.listaNegra,
    required this.dudoso,
  });
  
  factory PreferenciasDeAtencionDto.fromJson(Map<String, Object?> json) => _$PreferenciasDeAtencionDtoFromJson(json);
  
  final PreferenciaDeDisparadorDto llamada;
  final PreferenciaDeDisparadorDto rostro;
  final PreferenciaDeDisparadorDto placa;
  @JsonKey(name: 'lista_negra')
  final PreferenciaDeDisparadorDto listaNegra;
  final PreferenciaDeDisparadorDto dudoso;

  Map<String, Object?> toJson() => _$PreferenciasDeAtencionDtoToJson(this);
}
