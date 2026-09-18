// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'miembro_de_familia_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiembroDeFamiliaDto _$MiembroDeFamiliaDtoFromJson(Map<String, dynamic> json) =>
    MiembroDeFamiliaDto(
      residenteId: json['residenteId'] as String,
      nombre: json['nombre'] as String,
      parentesco: json['parentesco'] as String?,
      esTitular: json['esTitular'] as bool,
      nivelAcceso: json['nivelAcceso'] as String?,
      activo: json['activo'] as bool,
    );

Map<String, dynamic> _$MiembroDeFamiliaDtoToJson(
  MiembroDeFamiliaDto instance,
) => <String, dynamic>{
  'residenteId': instance.residenteId,
  'nombre': instance.nombre,
  'parentesco': instance.parentesco,
  'esTitular': instance.esTitular,
  'nivelAcceso': instance.nivelAcceso,
  'activo': instance.activo,
};
