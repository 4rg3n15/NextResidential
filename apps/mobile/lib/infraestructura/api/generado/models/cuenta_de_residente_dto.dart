// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cuenta_de_residente_dto.g.dart';

@JsonSerializable()
class CuentaDeResidenteDto {
  const CuentaDeResidenteDto({
    required this.usuarioId,
    required this.usuario,
    required this.nombre,
    required this.vivienda,
    required this.activa,
    required this.debeCambiarContrasena,
    required this.creadaEn,
  });
  
  factory CuentaDeResidenteDto.fromJson(Map<String, Object?> json) => _$CuentaDeResidenteDtoFromJson(json);
  
  final String usuarioId;
  final String? usuario;
  final String nombre;
  final String? vivienda;
  final bool activa;
  final bool debeCambiarContrasena;
  final String creadaEn;

  Map<String, Object?> toJson() => _$CuentaDeResidenteDtoToJson(this);
}
