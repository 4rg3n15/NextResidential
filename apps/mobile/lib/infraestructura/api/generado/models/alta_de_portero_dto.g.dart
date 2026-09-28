// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'alta_de_portero_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AltaDePorteroDto _$AltaDePorteroDtoFromJson(Map<String, dynamic> json) =>
    AltaDePorteroDto(
      nombre: json['nombre'] as String,
      sectores: (json['sectores'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      contrasenaInicial: json['contrasenaInicial'] as String,
      telefono: json['telefono'] as String?,
      correoContacto: json['correoContacto'] as String?,
      porteria: json['porteria'] as String?,
      documento: json['documento'] as String?,
    );

Map<String, dynamic> _$AltaDePorteroDtoToJson(AltaDePorteroDto instance) =>
    <String, dynamic>{
      'nombre': instance.nombre,
      'telefono': instance.telefono,
      'correoContacto': instance.correoContacto,
      'porteria': instance.porteria,
      'sectores': instance.sectores,
      'documento': instance.documento,
      'contrasenaInicial': instance.contrasenaInicial,
    };
