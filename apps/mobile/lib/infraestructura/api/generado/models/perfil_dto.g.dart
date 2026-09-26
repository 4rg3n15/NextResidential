// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'perfil_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PerfilDto _$PerfilDtoFromJson(Map<String, dynamic> json) => PerfilDto(
  nombres: json['nombres'] as String,
  apellidos: json['apellidos'] as String,
  tipoDocumento: PerfilDtoTipoDocumento.fromJson(
    json['tipoDocumento'] as String,
  ),
  numeroDocumento: json['numeroDocumento'] as String,
  correo: json['correo'] as String,
  telefono: json['telefono'] as String,
  fechaNacimiento: json['fechaNacimiento'] as String?,
);

Map<String, dynamic> _$PerfilDtoToJson(PerfilDto instance) => <String, dynamic>{
  'nombres': instance.nombres,
  'apellidos': instance.apellidos,
  'fechaNacimiento': instance.fechaNacimiento,
  'tipoDocumento': instance.tipoDocumento,
  'numeroDocumento': instance.numeroDocumento,
  'correo': instance.correo,
  'telefono': instance.telefono,
};
