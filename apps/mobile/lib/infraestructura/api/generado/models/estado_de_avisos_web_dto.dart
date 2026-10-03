// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'estado_de_avisos_web_dto.g.dart';

@JsonSerializable()
class EstadoDeAvisosWebDto {
  const EstadoDeAvisosWebDto({
    required this.disponible,
    required this.clavePublica,
  });
  
  factory EstadoDeAvisosWebDto.fromJson(Map<String, Object?> json) => _$EstadoDeAvisosWebDtoFromJson(json);
  
  /// Falso si la API no tiene llaves VAPID: no hay avisos al teléfono
  final bool disponible;

  /// Llave pública VAPID (base64url)
  final String? clavePublica;

  Map<String, Object?> toJson() => _$EstadoDeAvisosWebDtoToJson(this);
}
