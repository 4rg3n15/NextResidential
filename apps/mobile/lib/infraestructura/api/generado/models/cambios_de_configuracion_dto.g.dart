// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cambios_de_configuracion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CambiosDeConfiguracionDto _$CambiosDeConfiguracionDtoFromJson(
  Map<String, dynamic> json,
) => CambiosDeConfiguracionDto(
  nombre: json['nombre'] as String?,
  direccion: json['direccion'] as String?,
  tipo: json['tipo'] == null
      ? null
      : CambiosDeConfiguracionDtoTipo.fromJson(json['tipo'] as String),
  etiquetaVivienda: json['etiquetaVivienda'] as String?,
  etiquetaAgrupacion: json['etiquetaAgrupacion'] as String?,
  zonaHoraria: json['zonaHoraria'] as String?,
  politicaContingenciaEdge: json['politicaContingenciaEdge'] == null
      ? null
      : CambiosDeConfiguracionDtoPoliticaContingenciaEdge.fromJson(
          json['politicaContingenciaEdge'] as String,
        ),
);

Map<String, dynamic> _$CambiosDeConfiguracionDtoToJson(
  CambiosDeConfiguracionDto instance,
) => <String, dynamic>{
  'nombre': instance.nombre,
  'direccion': instance.direccion,
  'tipo': instance.tipo,
  'etiquetaVivienda': instance.etiquetaVivienda,
  'etiquetaAgrupacion': instance.etiquetaAgrupacion,
  'zonaHoraria': instance.zonaHoraria,
  'politicaContingenciaEdge': instance.politicaContingenciaEdge,
};
