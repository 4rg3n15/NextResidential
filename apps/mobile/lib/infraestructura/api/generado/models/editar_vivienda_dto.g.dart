// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'editar_vivienda_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EditarViviendaDto _$EditarViviendaDtoFromJson(Map<String, dynamic> json) =>
    EditarViviendaDto(
      identificador: json['identificador'] as String?,
      agrupacion: json['agrupacion'] as String?,
      estadoAdministrativo: json['estadoAdministrativo'] == null
          ? null
          : EditarViviendaDtoEstadoAdministrativo.fromJson(
              json['estadoAdministrativo'] as String,
            ),
    );

Map<String, dynamic> _$EditarViviendaDtoToJson(EditarViviendaDto instance) =>
    <String, dynamic>{
      'identificador': instance.identificador,
      'agrupacion': instance.agrupacion,
      'estadoAdministrativo': instance.estadoAdministrativo,
    };
