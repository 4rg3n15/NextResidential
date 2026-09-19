// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sesion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SesionDto _$SesionDtoFromJson(Map<String, dynamic> json) => SesionDto(
  usuarioId: json['usuarioId'] as String,
  rol: SesionDtoRol.fromJson(json['rol'] as String),
  copropiedadId: json['copropiedadId'] as String?,
  copropiedadesAtendidas: (json['copropiedadesAtendidas'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  mfaVerificado: json['mfaVerificado'] as bool,
);

Map<String, dynamic> _$SesionDtoToJson(SesionDto instance) => <String, dynamic>{
  'usuarioId': instance.usuarioId,
  'rol': instance.rol,
  'copropiedadId': instance.copropiedadId,
  'copropiedadesAtendidas': instance.copropiedadesAtendidas,
  'mfaVerificado': instance.mfaVerificado,
};
