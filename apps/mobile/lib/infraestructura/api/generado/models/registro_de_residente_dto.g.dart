// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registro_de_residente_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistroDeResidenteDto _$RegistroDeResidenteDtoFromJson(
  Map<String, dynamic> json,
) => RegistroDeResidenteDto(
  usuario: json['usuario'] as String,
  correo: json['correo'] as String,
  contrasena: json['contrasena'] as String,
  confirmacion: json['confirmacion'] as String,
  codigoDeInvitacion: json['codigoDeInvitacion'] as String,
  fechaNacimiento: json['fechaNacimiento'] as String,
  aceptaTratamientoDeDatos: json['aceptaTratamientoDeDatos'] as bool,
  versionPolitica: json['versionPolitica'] as String,
);

Map<String, dynamic> _$RegistroDeResidenteDtoToJson(
  RegistroDeResidenteDto instance,
) => <String, dynamic>{
  'usuario': instance.usuario,
  'correo': instance.correo,
  'contrasena': instance.contrasena,
  'confirmacion': instance.confirmacion,
  'codigoDeInvitacion': instance.codigoDeInvitacion,
  'fechaNacimiento': instance.fechaNacimiento,
  'aceptaTratamientoDeDatos': instance.aceptaTratamientoDeDatos,
  'versionPolitica': instance.versionPolitica,
};
