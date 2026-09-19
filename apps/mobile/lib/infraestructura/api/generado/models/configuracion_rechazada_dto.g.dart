// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'configuracion_rechazada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConfiguracionRechazadaDto _$ConfiguracionRechazadaDtoFromJson(
  Map<String, dynamic> json,
) => ConfiguracionRechazadaDto(
  codigo: json['codigo'] as num,
  rechazos: (json['rechazos'] as List<dynamic>)
      .map((e) => RechazoDeAjusteDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ConfiguracionRechazadaDtoToJson(
  ConfiguracionRechazadaDto instance,
) => <String, dynamic>{
  'codigo': instance.codigo,
  'rechazos': instance.rechazos,
};
