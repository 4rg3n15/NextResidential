// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mi_vivienda_dto.g.dart';

@JsonSerializable()
class MiViviendaDto {
  const MiViviendaDto({
    required this.id,
    required this.identificador,
    required this.agrupacion,
    required this.etiquetaVivienda,
    required this.etiquetaAgrupacion,
    required this.direccion,
    required this.copropiedadNombre,
    required this.estadoAdministrativo,
    required this.activa,
  });
  
  factory MiViviendaDto.fromJson(Map<String, Object?> json) => _$MiViviendaDtoFromJson(json);
  
  final String id;

  /// El número, sin la palabra: «42».
  final String identificador;
  final String? agrupacion;

  /// Cómo llama esta copropiedad a sus viviendas.
  final String etiquetaVivienda;
  final String etiquetaAgrupacion;
  final String? direccion;
  final String copropiedadNombre;

  /// Alimentado externamente; Next Control no calcula cartera (S-01).
  final String estadoAdministrativo;

  /// RN-13: inactiva conserva lo vigente y no genera autorizaciones nuevas.
  final bool activa;

  Map<String, Object?> toJson() => _$MiViviendaDtoToJson(this);
}
