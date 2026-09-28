// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'visita_dto.dart';

part 'lista_de_visitas_dto.g.dart';

@JsonSerializable()
class ListaDeVisitasDto {
  const ListaDeVisitasDto({
    required this.soloElDia,
    required this.desde,
    required this.hasta,
    required this.visitas,
  });
  
  factory ListaDeVisitasDto.fromJson(Map<String, Object?> json) => _$ListaDeVisitasDtoFromJson(json);
  
  /// La lista es la del día, sin importar los filtros pedidos
  final bool soloElDia;
  final DateTime? desde;
  final DateTime? hasta;
  final List<VisitaDto> visitas;

  Map<String, Object?> toJson() => _$ListaDeVisitasDtoToJson(this);
}
