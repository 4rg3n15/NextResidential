// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'documento_crudo_del_equipo_dto.dart';
import 'hallazgo_del_equipo_dto.dart';
import 'receptor_de_la_ficha_dto.dart';

part 'ficha_del_equipo_dto.g.dart';

@JsonSerializable()
class FichaDelEquipoDto {
  const FichaDelEquipoDto({
    required this.modelo,
    required this.firmware,
    required this.serie,
    required this.horaDelEquipo,
    required this.desvioDeRelojSegundos,
    required this.hallazgos,
    required this.sinComprobar,
    this.receptores,
    this.crudos,
  });
  
  factory FichaDelEquipoDto.fromJson(Map<String, Object?> json) => _$FichaDelEquipoDtoFromJson(json);
  
  /// E4 · los receptores («HTTP listening») que el equipo tiene escritos
  final List<ReceptorDeLaFichaDto>? receptores;
  final String? modelo;
  final String? firmware;
  final String? serie;
  final String? horaDelEquipo;
  final num? desvioDeRelojSegundos;
  final List<HallazgoDelEquipoDto> hallazgos;
  final List<String> sinComprobar;

  /// H-SITIO-01 · lo que el equipo CONTESTÓ, saneado (sin claves, IPs enmascaradas), para leer el veredicto contra el documento y no contra una interpretación. Ausente cuando la familia no lo aporta.
  final List<DocumentoCrudoDelEquipoDto>? crudos;

  Map<String, Object?> toJson() => _$FichaDelEquipoDtoToJson(this);
}
