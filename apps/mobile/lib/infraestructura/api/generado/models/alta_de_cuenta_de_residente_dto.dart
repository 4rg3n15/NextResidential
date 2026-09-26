// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'alta_de_cuenta_de_residente_dto.g.dart';

@JsonSerializable()
class AltaDeCuentaDeResidenteDto {
  const AltaDeCuentaDeResidenteDto({
    required this.usuario,
    required this.contrasenaInicial,
    required this.nombre,
    this.telefono,
  });
  
  factory AltaDeCuentaDeResidenteDto.fromJson(Map<String, Object?> json) => _$AltaDeCuentaDeResidenteDtoFromJson(json);
  
  final String usuario;
  final String contrasenaInicial;
  final String nombre;
  final String? telefono;

  Map<String, Object?> toJson() => _$AltaDeCuentaDeResidenteDtoToJson(this);
}
