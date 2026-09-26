// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'alta_de_cuenta_de_residente_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AltaDeCuentaDeResidenteDto _$AltaDeCuentaDeResidenteDtoFromJson(
  Map<String, dynamic> json,
) => AltaDeCuentaDeResidenteDto(
  usuario: json['usuario'] as String,
  contrasenaInicial: json['contrasenaInicial'] as String,
  nombre: json['nombre'] as String,
  telefono: json['telefono'] as String?,
);

Map<String, dynamic> _$AltaDeCuentaDeResidenteDtoToJson(
  AltaDeCuentaDeResidenteDto instance,
) => <String, dynamic>{
  'usuario': instance.usuario,
  'contrasenaInicial': instance.contrasenaInicial,
  'nombre': instance.nombre,
  'telefono': instance.telefono,
};
