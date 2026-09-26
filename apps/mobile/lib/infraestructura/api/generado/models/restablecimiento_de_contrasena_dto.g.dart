// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'restablecimiento_de_contrasena_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RestablecimientoDeContrasenaDto _$RestablecimientoDeContrasenaDtoFromJson(
  Map<String, dynamic> json,
) => RestablecimientoDeContrasenaDto(
  temporal: json['temporal'] as String,
  motivo: json['motivo'] as String?,
);

Map<String, dynamic> _$RestablecimientoDeContrasenaDtoToJson(
  RestablecimientoDeContrasenaDto instance,
) => <String, dynamic>{
  'temporal': instance.temporal,
  'motivo': instance.motivo,
};
