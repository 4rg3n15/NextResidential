// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'error_de_fila_dto.dart';

part 'resultado_de_carga_dto.g.dart';

@JsonSerializable()
class ResultadoDeCargaDto {
  const ResultadoDeCargaDto({
    required this.aceptadas,
    required this.errores,
    required this.aplicada,
    required this.filasLeidas,
    required this.viviendasCreadas,
    required this.personasCreadas,
    required this.identificadoresRecortados,
  });
  
  factory ResultadoDeCargaDto.fromJson(Map<String, Object?> json) => _$ResultadoDeCargaDtoFromJson(json);
  
  final num aceptadas;

  /// Errores fila a fila. Si hay uno solo, `aplicada` es falso: la carga es atómica.
  final List<ErrorDeFilaDto> errores;

  /// Verdadero solo si entró el padrón ENTERO. Una carga a medias no existe (HU-03).
  final bool aplicada;
  final num filasLeidas;

  /// Viviendas que hubo que crear porque el identificador de la hoja no existía. Una errata crea una vivienda que nadie quería, y este número la delata en el momento (D-72).
  final num viviendasCreadas;

  /// Personas nuevas. Las que ya tenían ese documento se reutilizan (RN-06).
  final num personasCreadas;

  /// Identificadores que traían la palabra dentro («Casa 42») y se guardaron sin ella. Se recorta y se cuenta: contarlo es lo que impide que el recorte sea silencioso.
  final num identificadoresRecortados;

  Map<String, Object?> toJson() => _$ResultadoDeCargaDtoToJson(this);
}
