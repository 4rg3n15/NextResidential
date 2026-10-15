// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'detalle_de_error_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DetalleDeErrorDto _$DetalleDeErrorDtoFromJson(Map<String, dynamic> json) =>
    DetalleDeErrorDto(
      message: json['message'],
      error: json['error'] as String?,
      statusCode: json['statusCode'] as num?,
      codigo: json['codigo'] == null
          ? null
          : DetalleDeErrorDtoCodigo.fromJson(json['codigo'] as String),
      campos: (json['campos'] as List<dynamic>?)
          ?.map(
            (e) => CampoRechazadoDeFormaDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
    );

Map<String, dynamic> _$DetalleDeErrorDtoToJson(DetalleDeErrorDto instance) =>
    <String, dynamic>{
      'message': instance.message,
      'error': instance.error,
      'statusCode': instance.statusCode,
      'codigo': instance.codigo,
      'campos': instance.campos,
    };
