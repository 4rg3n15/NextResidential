// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'autorizacion_en_la_instantanea_dto.dart';
import 'plantilla_en_la_instantanea_dto.dart';
import 'vehiculo_en_la_instantanea_dto.dart';
import 'zona_en_la_instantanea_dto.dart';

part 'instantanea_de_reglas_dto.g.dart';

@JsonSerializable()
class InstantaneaDeReglasDto {
  const InstantaneaDeReglasDto({
    required this.copropiedadId,
    required this.version,
    required this.hash,
    required this.generadaEn,
    required this.autorizaciones,
    required this.personasEnListaNegra,
    required this.placasEnListaNegra,
    required this.viviendasActivas,
    required this.vehiculos,
    required this.zonas,
    required this.personasConConsentimiento,
    required this.plantillas,
    required this.umbralDeConfianza,
  });
  
  factory InstantaneaDeReglasDto.fromJson(Map<String, Object?> json) => _$InstantaneaDeReglasDtoFromJson(json);
  
  final String copropiedadId;

  /// VersiónDeReglas publicada (0010): la que sella cada decisión
  final num version;

  /// SHA-256 del contenido: el Edge puede verificar su caché
  final String hash;

  /// Desde aquí se mide KPI-31
  final DateTime generadaEn;
  final List<AutorizacionEnLaInstantaneaDto> autorizaciones;
  final List<String> personasEnListaNegra;
  final List<String> placasEnListaNegra;
  final List<String> viviendasActivas;
  final List<VehiculoEnLaInstantaneaDto> vehiculos;
  final List<ZonaEnLaInstantaneaDto> zonas;
  final List<String> personasConConsentimiento;
  final List<PlantillaEnLaInstantaneaDto> plantillas;
  final num umbralDeConfianza;

  Map<String, Object?> toJson() => _$InstantaneaDeReglasDtoToJson(this);
}
