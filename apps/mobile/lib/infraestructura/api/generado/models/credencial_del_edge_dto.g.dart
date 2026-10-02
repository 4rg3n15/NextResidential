// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'credencial_del_edge_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CredencialDelEdgeDto _$CredencialDelEdgeDtoFromJson(
  Map<String, dynamic> json,
) => CredencialDelEdgeDto(
  edgeId: json['edgeId'] as String,
  copropiedadId: json['copropiedadId'] as String,
  nombre: json['nombre'] as String,
  credencialRef: json['credencialRef'] as String,
  secreto: json['secreto'] as String,
);

Map<String, dynamic> _$CredencialDelEdgeDtoToJson(
  CredencialDelEdgeDto instance,
) => <String, dynamic>{
  'edgeId': instance.edgeId,
  'copropiedadId': instance.copropiedadId,
  'nombre': instance.nombre,
  'credencialRef': instance.credencialRef,
  'secreto': instance.secreto,
};
