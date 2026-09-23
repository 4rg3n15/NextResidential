// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hallazgo_del_equipo_dto_correccion.dart';
import 'hallazgo_del_equipo_dto_estado.dart';

part 'hallazgo_del_equipo_dto.g.dart';

@JsonSerializable()
class HallazgoDelEquipoDto {
  const HallazgoDelEquipoDto({
    required this.campo,
    required this.estado,
    required this.valorLeido,
    required this.valorCorrecto,
    required this.detalle,
    required this.correccion,
  });
  
  factory HallazgoDelEquipoDto.fromJson(Map<String, Object?> json) => _$HallazgoDelEquipoDtoFromJson(json);
  
  final String campo;
  final HallazgoDelEquipoDtoEstado estado;
  final String? valorLeido;
  final String? valorCorrecto;
  final String detalle;

  /// Qué corrección lo arregla desde la consola. Nulo si no la hay.
  final HallazgoDelEquipoDtoCorreccion? correccion;

  Map<String, Object?> toJson() => _$HallazgoDelEquipoDtoToJson(this);
}
