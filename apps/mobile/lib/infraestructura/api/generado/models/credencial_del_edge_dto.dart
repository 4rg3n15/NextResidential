// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'credencial_del_edge_dto.g.dart';

@JsonSerializable()
class CredencialDelEdgeDto {
  const CredencialDelEdgeDto({
    required this.edgeId,
    required this.copropiedadId,
    required this.nombre,
    required this.credencialRef,
    required this.secreto,
  });
  
  factory CredencialDelEdgeDto.fromJson(Map<String, Object?> json) => _$CredencialDelEdgeDtoFromJson(json);
  
  final String edgeId;
  final String copropiedadId;
  final String nombre;

  /// Lo único que queda en la base (RN-21)
  final String credencialRef;

  /// La credencial del Edge, para su `EDGE_INGESTA_SECRETO`. Se muestra UNA vez: la API no la guarda
  final String secreto;

  Map<String, Object?> toJson() => _$CredencialDelEdgeDtoToJson(this);
}
