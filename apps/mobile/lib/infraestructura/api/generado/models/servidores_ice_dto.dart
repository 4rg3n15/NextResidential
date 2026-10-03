// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'servidor_ice_dto.dart';

part 'servidores_ice_dto.g.dart';

@JsonSerializable()
class ServidoresIceDto {
  const ServidoresIceDto({
    required this.iceServers,
    required this.ttlSegundos,
  });
  
  factory ServidoresIceDto.fromJson(Map<String, Object?> json) => _$ServidoresIceDtoFromJson(json);
  
  /// Vacía sin STUN/TURN configurados
  final List<ServidorIceDto> iceServers;

  /// Vida de la credencial del TURN; pedir otra antes de que caduque
  final num ttlSegundos;

  Map<String, Object?> toJson() => _$ServidoresIceDtoToJson(this);
}
