// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dispositivo_del_tablero_dto.dart';

part 'estado_de_dispositivos_dto.g.dart';

@JsonSerializable()
class EstadoDeDispositivosDto {
  const EstadoDeDispositivosDto({
    required this.dispositivos,
    required this.saludables,
    required this.degradados,
    required this.caidos,
  });
  
  factory EstadoDeDispositivosDto.fromJson(Map<String, Object?> json) => _$EstadoDeDispositivosDtoFromJson(json);
  
  final List<DispositivoDelTableroDto> dispositivos;
  final num saludables;
  final num degradados;
  final num caidos;

  Map<String, Object?> toJson() => _$EstadoDeDispositivosDtoToJson(this);
}
