// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'mi_vinculo_dto.dart';
import 'mi_vivienda_dto.dart';

part 'mi_inicio_dto.g.dart';

@JsonSerializable()
class MiInicioDto {
  const MiInicioDto({
    required this.vivienda,
    required this.vinculo,
    required this.puedeAutorizar,
  });
  
  factory MiInicioDto.fromJson(Map<String, Object?> json) => _$MiInicioDtoFromJson(json);
  
  final MiViviendaDto vivienda;
  final MiVinculoDto vinculo;

  /// Si puede crear autorizaciones: exige vivienda activa (RN-13) y ser titular (RN-05). Lo decide el servidor; la app no repite la regla.
  final bool puedeAutorizar;

  Map<String, Object?> toJson() => _$MiInicioDtoToJson(this);
}
