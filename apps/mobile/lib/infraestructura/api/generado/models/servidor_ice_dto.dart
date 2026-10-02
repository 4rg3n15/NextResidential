// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'servidor_ice_dto.g.dart';

@JsonSerializable()
class ServidorIceDto {
  const ServidorIceDto({
    required this.urls,
    this.username,
    this.credential,
  });
  
  factory ServidorIceDto.fromJson(Map<String, Object?> json) => _$ServidorIceDtoFromJson(json);
  
  final List<String> urls;

  /// Usuario EFÍMERO del TURN: `<expira>:<usuario>`
  final String? username;

  /// Credencial EFÍMERA del TURN (caduca sola)
  final String? credential;

  Map<String, Object?> toJson() => _$ServidorIceDtoToJson(this);
}
