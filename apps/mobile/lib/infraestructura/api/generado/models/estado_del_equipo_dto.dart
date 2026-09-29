// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'estado_del_equipo_dto_autenticacion.dart';
import 'estado_del_equipo_dto_en_linea.dart';
import 'estado_del_equipo_dto_escucha.dart';

part 'estado_del_equipo_dto.g.dart';

@JsonSerializable()
class EstadoDelEquipoDto {
  const EstadoDelEquipoDto({
    required this.enLinea,
    required this.motivo,
    required this.alcanzable,
    required this.autenticacion,
    required this.autenticacionRechazadaHaceMin,
    required this.escucha,
    required this.ultimoEvento,
    required this.ultimoLatido,
    required this.ultimaSenal,
  });
  
  factory EstadoDelEquipoDto.fromJson(Map<String, Object?> json) => _$EstadoDelEquipoDtoFromJson(json);
  
  /// Una sola fuente de verdad: última señal (latido, evento, escucha o sondeo) contra el umbral de la copropiedad, con la credencial y la escucha por delante
  final EstadoDelEquipoDtoEnLinea enLinea;

  /// Por qué, en una frase para la pantalla
  final String motivo;

  /// `null` = nadie lo ha sondeado
  final bool? alcanzable;
  final EstadoDelEquipoDtoAutenticacion autenticacion;
  final num? autenticacionRechazadaHaceMin;
  final EstadoDelEquipoDtoEscucha escucha;
  final DateTime? ultimoEvento;
  final DateTime? ultimoLatido;
  final DateTime? ultimaSenal;

  Map<String, Object?> toJson() => _$EstadoDelEquipoDtoToJson(this);
}
