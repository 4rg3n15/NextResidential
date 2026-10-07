// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'perfil_dto.dart';

part 'alta_de_mi_vivienda_dto.g.dart';

@JsonSerializable()
class AltaDeMiViviendaDto {
  const AltaDeMiViviendaDto({
    required this.perfil,
    required this.identificador,
    this.agrupacion,
    this.codigo,
  });
  
  factory AltaDeMiViviendaDto.fromJson(Map<String, Object?> json) => _$AltaDeMiViviendaDtoFromJson(json);
  
  final PerfilDto perfil;

  /// El número de la vivienda, que tiene que EXISTIR
  final String identificador;

  /// La agrupación (torre, manzana…): obligatoria en un conjunto de apartamentos
  final String? agrupacion;

  /// Código de una plaza de la vivienda de destino, con o sin el prefijo del conjunto («MIRA-K7PQ-2XWZ»). Sin él no hay cambio de vivienda (15-W, D3)
  final String? codigo;

  Map<String, Object?> toJson() => _$AltaDeMiViviendaDtoToJson(this);
}
