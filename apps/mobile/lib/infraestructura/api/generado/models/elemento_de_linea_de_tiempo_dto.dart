// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'codigo_del_equipo_dto.dart';
import 'elemento_de_linea_de_tiempo_dto_origen.dart';
import 'elemento_de_linea_de_tiempo_dto_resultado.dart';

part 'elemento_de_linea_de_tiempo_dto.g.dart';

@JsonSerializable()
class ElementoDeLineaDeTiempoDto {
  const ElementoDeLineaDeTiempoDto({
    required this.origen,
    required this.id,
    required this.ocurridoEn,
    required this.dispositivoId,
    required this.tipo,
    required this.titulo,
    required this.resultado,
    required this.enVivo,
    required this.eventoId,
    required this.codigo,
  });
  
  factory ElementoDeLineaDeTiempoDto.fromJson(Map<String, Object?> json) => _$ElementoDeLineaDeTiempoDtoFromJson(json);
  
  final ElementoDeLineaDeTiempoDtoOrigen origen;
  final String id;
  final DateTime ocurridoEn;
  final String dispositivoId;

  /// `acceso` o el tipo normalizado del evento de equipo
  final String tipo;

  /// Lo que la consola enseña, en español
  final String titulo;
  final ElementoDeLineaDeTiempoDtoResultado? resultado;

  /// `false` para lo que el equipo declaró histórico
  final bool enVivo;
  final String? eventoId;
  final CodigoDelEquipoDto? codigo;

  Map<String, Object?> toJson() => _$ElementoDeLineaDeTiempoDtoToJson(this);
}
