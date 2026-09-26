// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cuenta_de_residente_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CuentaDeResidenteDto _$CuentaDeResidenteDtoFromJson(
  Map<String, dynamic> json,
) => CuentaDeResidenteDto(
  usuarioId: json['usuarioId'] as String,
  usuario: json['usuario'] as String?,
  nombre: json['nombre'] as String,
  vivienda: json['vivienda'] as String?,
  activa: json['activa'] as bool,
  debeCambiarContrasena: json['debeCambiarContrasena'] as bool,
  creadaEn: json['creadaEn'] as String,
);

Map<String, dynamic> _$CuentaDeResidenteDtoToJson(
  CuentaDeResidenteDto instance,
) => <String, dynamic>{
  'usuarioId': instance.usuarioId,
  'usuario': instance.usuario,
  'nombre': instance.nombre,
  'vivienda': instance.vivienda,
  'activa': instance.activa,
  'debeCambiarContrasena': instance.debeCambiarContrasena,
  'creadaEn': instance.creadaEn,
};
