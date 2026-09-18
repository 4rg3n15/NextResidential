// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vivienda_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ViviendaDto _$ViviendaDtoFromJson(Map<String, dynamic> json) => ViviendaDto(
  id: json['id'] as String,
  identificador: json['identificador'] as String,
  agrupacion: json['agrupacion'] as String?,
  estado: ViviendaDtoEstado.fromJson(json['estado'] as String),
  estadoAdministrativo: json['estadoAdministrativo'] as String,
  residentes: json['residentes'] as num,
  vehiculos: json['vehiculos'] as num,
  autorizacionesVigentes: json['autorizacionesVigentes'] as num,
  desactivadaEn: json['desactivadaEn'] as String?,
  motivoDesactivacion: json['motivoDesactivacion'] as String?,
);

Map<String, dynamic> _$ViviendaDtoToJson(ViviendaDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'identificador': instance.identificador,
      'agrupacion': instance.agrupacion,
      'estado': instance.estado,
      'estadoAdministrativo': instance.estadoAdministrativo,
      'residentes': instance.residentes,
      'vehiculos': instance.vehiculos,
      'autorizacionesVigentes': instance.autorizacionesVigentes,
      'desactivadaEn': instance.desactivadaEn,
      'motivoDesactivacion': instance.motivoDesactivacion,
    };
