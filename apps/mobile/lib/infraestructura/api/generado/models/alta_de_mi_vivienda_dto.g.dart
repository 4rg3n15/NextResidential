// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'alta_de_mi_vivienda_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AltaDeMiViviendaDto _$AltaDeMiViviendaDtoFromJson(Map<String, dynamic> json) =>
    AltaDeMiViviendaDto(
      perfil: PerfilDto.fromJson(json['perfil'] as Map<String, dynamic>),
      identificador: json['identificador'] as String,
      agrupacion: json['agrupacion'] as String?,
      codigo: json['codigo'] as String?,
    );

Map<String, dynamic> _$AltaDeMiViviendaDtoToJson(
  AltaDeMiViviendaDto instance,
) => <String, dynamic>{
  'perfil': instance.perfil,
  'identificador': instance.identificador,
  'agrupacion': instance.agrupacion,
  'codigo': instance.codigo,
};
