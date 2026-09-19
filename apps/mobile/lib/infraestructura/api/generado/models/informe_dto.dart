// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fila_de_informe_dto.dart';
import 'informe_dto_tipo.dart';
import 'punto_de_frecuencia_dto.dart';

part 'informe_dto.g.dart';

@JsonSerializable()
class InformeDto {
  const InformeDto({
    required this.tipo,
    required this.desde,
    required this.hasta,
    required this.total,
    required this.filas,
    required this.frecuencia,
    required this.truncado,
    required this.notas,
  });
  
  factory InformeDto.fromJson(Map<String, Object?> json) => _$InformeDtoFromJson(json);
  
  final InformeDtoTipo tipo;
  final DateTime desde;
  final DateTime hasta;
  final num total;
  final List<FilaDeInformeDto> filas;
  final List<PuntoDeFrecuenciaDto> frecuencia;

  /// Se alcanzó el tope de la vista previa; la exportación trae el conjunto completo.
  final bool truncado;

  /// Limitaciones reales del informe, para mostrarlas en pantalla en vez de fingirlas.
  final List<String> notas;

  Map<String, Object?> toJson() => _$InformeDtoToJson(this);
}
