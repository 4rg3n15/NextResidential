// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'vocabulario_de_alta_dto.dart';

part 'estado_de_mi_alta_dto.g.dart';

@JsonSerializable()
class EstadoDeMiAltaDto {
  const EstadoDeMiAltaDto({
    required this.completa,
    required this.viviendaVinculada,
    required this.debeDeclararOcupantes,
    required this.vocabulario,
    required this.pideAgrupacion,
    required this.avisoOcupantes,
  });
  
  factory EstadoDeMiAltaDto.fromJson(Map<String, Object?> json) => _$EstadoDeMiAltaDtoFromJson(json);
  
  final bool completa;
  final bool viviendaVinculada;
  final bool debeDeclararOcupantes;
  final VocabularioDeAltaDto vocabulario;
  final bool pideAgrupacion;

  /// El texto que la pantalla muestra ANTES de confirmar (D6)
  final String avisoOcupantes;

  Map<String, Object?> toJson() => _$EstadoDeMiAltaDtoToJson(this);
}
