// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registrar_persona_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistrarPersonaDto _$RegistrarPersonaDtoFromJson(Map<String, dynamic> json) =>
    RegistrarPersonaDto(
      tipoDocumento: RegistrarPersonaDtoTipoDocumento.fromJson(
        json['tipoDocumento'] as String,
      ),
      numeroDocumento: json['numeroDocumento'] as String,
      nombreCompleto: json['nombreCompleto'] as String,
      telefono: json['telefono'] as String?,
      correo: json['correo'] as String?,
    );

Map<String, dynamic> _$RegistrarPersonaDtoToJson(
  RegistrarPersonaDto instance,
) => <String, dynamic>{
  'tipoDocumento': instance.tipoDocumento,
  'numeroDocumento': instance.numeroDocumento,
  'nombreCompleto': instance.nombreCompleto,
  'telefono': instance.telefono,
  'correo': instance.correo,
};
