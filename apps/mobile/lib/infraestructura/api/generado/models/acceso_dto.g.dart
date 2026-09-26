// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'acceso_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AccesoDto _$AccesoDtoFromJson(Map<String, dynamic> json) => AccesoDto(
  contrasena: json['contrasena'] as String,
  correo: json['correo'] as String?,
  codigo: json['codigo'] as String?,
  nit: json['nit'] as String?,
  usuario: json['usuario'] as String?,
);

Map<String, dynamic> _$AccesoDtoToJson(AccesoDto instance) => <String, dynamic>{
  'correo': instance.correo,
  'codigo': instance.codigo,
  'nit': instance.nit,
  'usuario': instance.usuario,
  'contrasena': instance.contrasena,
};
