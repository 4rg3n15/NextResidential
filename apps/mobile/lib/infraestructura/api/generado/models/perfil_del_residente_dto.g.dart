// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'perfil_del_residente_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PerfilDelResidenteDto _$PerfilDelResidenteDtoFromJson(
  Map<String, dynamic> json,
) => PerfilDelResidenteDto(
  nombres: json['nombres'] as String?,
  apellidos: json['apellidos'] as String?,
  nombreCompleto: json['nombreCompleto'] as String,
  fechaNacimiento: json['fechaNacimiento'] as String?,
  tipoDocumento: json['tipoDocumento'] as String?,
  numeroDocumento: json['numeroDocumento'] as String?,
  correo: json['correo'] as String?,
  telefono: json['telefono'] as String?,
  copropiedadNombre: json['copropiedadNombre'] as String,
  copropiedadDireccion: json['copropiedadDireccion'] as String?,
  telefonoPorteria: json['telefonoPorteria'] as String?,
);

Map<String, dynamic> _$PerfilDelResidenteDtoToJson(
  PerfilDelResidenteDto instance,
) => <String, dynamic>{
  'nombres': instance.nombres,
  'apellidos': instance.apellidos,
  'nombreCompleto': instance.nombreCompleto,
  'fechaNacimiento': instance.fechaNacimiento,
  'tipoDocumento': instance.tipoDocumento,
  'numeroDocumento': instance.numeroDocumento,
  'correo': instance.correo,
  'telefono': instance.telefono,
  'copropiedadNombre': instance.copropiedadNombre,
  'copropiedadDireccion': instance.copropiedadDireccion,
  'telefonoPorteria': instance.telefonoPorteria,
};
