// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_vivienda_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiViviendaDto _$MiViviendaDtoFromJson(Map<String, dynamic> json) =>
    MiViviendaDto(
      id: json['id'] as String,
      identificador: json['identificador'] as String,
      agrupacion: json['agrupacion'] as String?,
      etiquetaVivienda: json['etiquetaVivienda'] as String,
      etiquetaAgrupacion: json['etiquetaAgrupacion'] as String,
      direccion: json['direccion'] as String?,
      copropiedadNombre: json['copropiedadNombre'] as String,
      estadoAdministrativo: json['estadoAdministrativo'] as String,
      activa: json['activa'] as bool,
    );

Map<String, dynamic> _$MiViviendaDtoToJson(MiViviendaDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'identificador': instance.identificador,
      'agrupacion': instance.agrupacion,
      'etiquetaVivienda': instance.etiquetaVivienda,
      'etiquetaAgrupacion': instance.etiquetaAgrupacion,
      'direccion': instance.direccion,
      'copropiedadNombre': instance.copropiedadNombre,
      'estadoAdministrativo': instance.estadoAdministrativo,
      'activa': instance.activa,
    };
