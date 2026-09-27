// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'estado_de_equipos_simulados_dto.g.dart';

@JsonSerializable()
class EstadoDeEquiposSimuladosDto {
  const EstadoDeEquiposSimuladosDto({
    required this.simulado,
    required this.equiposRegistrados,
    required this.aviso,
  });
  
  factory EstadoDeEquiposSimuladosDto.fromJson(Map<String, Object?> json) => _$EstadoDeEquiposSimuladosDtoFromJson(json);
  
  /// Si la API opera con el proveedor simulado
  final bool simulado;

  /// Equipos activos dados de alta en ESTA copropiedad
  final num equiposRegistrados;

  /// La franja de la consola, sólo si hay equipos reales que no recibirán órdenes
  final String? aviso;

  Map<String, Object?> toJson() => _$EstadoDeEquiposSimuladosDtoToJson(this);
}
