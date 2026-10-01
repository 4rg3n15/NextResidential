// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'billete_de_audio_dto.g.dart';

@JsonSerializable()
class BilleteDeAudioDto {
  const BilleteDeAudioDto({
    required this.billete,
    required this.caducaEnSegundos,
    required this.ruta,
  });
  
  factory BilleteDeAudioDto.fromJson(Map<String, Object?> json) => _$BilleteDeAudioDtoFromJson(json);
  
  /// Se presenta UNA vez en `ruta?billete=…`; no es el token de sesión
  final String billete;

  /// Segundos que vale para abrir el WebSocket
  final num caducaEnSegundos;

  /// Ruta del WebSocket en la API (la consola la expone en su origen)
  final String ruta;

  Map<String, Object?> toJson() => _$BilleteDeAudioDtoToJson(this);
}
