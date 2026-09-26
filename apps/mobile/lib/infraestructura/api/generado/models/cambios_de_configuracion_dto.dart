// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cambios_de_configuracion_dto_politica_contingencia_edge.dart';
import 'cambios_de_configuracion_dto_tipo.dart';

part 'cambios_de_configuracion_dto.g.dart';

@JsonSerializable()
class CambiosDeConfiguracionDto {
  const CambiosDeConfiguracionDto({
    this.nombre,
    this.direccion,
    this.tipo,
    this.etiquetaVivienda,
    this.etiquetaAgrupacion,
    this.zonaHoraria,
    this.politicaContingenciaEdge,
    this.codigoCorto,
    this.telefonoPorteria,
    this.topeVehiculosPropios,
  });
  
  factory CambiosDeConfiguracionDto.fromJson(Map<String, Object?> json) => _$CambiosDeConfiguracionDtoFromJson(json);
  
  final String? nombre;
  final String? direccion;
  final CambiosDeConfiguracionDtoTipo? tipo;
  final String? etiquetaVivienda;
  final String? etiquetaAgrupacion;
  final String? zonaHoraria;
  final CambiosDeConfiguracionDtoPoliticaContingenciaEdge? politicaContingenciaEdge;

  /// D1 · código corto de acceso: 3 a 8 letras o números (sólo superadministrador)
  final String? codigoCorto;

  /// D7 · teléfono de portería; vacío lo borra (sólo superadministrador)
  final String? telefonoPorteria;

  /// D5 a · vehículos propios por vivienda (sólo superadministrador)
  final num? topeVehiculosPropios;

  Map<String, Object?> toJson() => _$CambiosDeConfiguracionDtoToJson(this);
}
