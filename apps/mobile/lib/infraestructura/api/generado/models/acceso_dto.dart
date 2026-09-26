// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'acceso_dto.g.dart';

@JsonSerializable()
class AccesoDto {
  const AccesoDto({
    required this.contrasena,
    this.correo,
    this.codigo,
    this.nit,
    this.usuario,
  });
  
  factory AccesoDto.fromJson(Map<String, Object?> json) => _$AccesoDtoFromJson(json);
  
  /// Cuentas por correo
  final String? correo;

  /// Código corto de la copropiedad (D1): 3 a 8 letras o números
  final String? codigo;

  /// NIT de la copropiedad
  final String? nit;

  /// Nombre de usuario
  final String? usuario;
  final String contrasena;

  Map<String, Object?> toJson() => _$AccesoDtoToJson(this);
}
