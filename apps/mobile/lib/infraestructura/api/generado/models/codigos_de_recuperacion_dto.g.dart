// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'codigos_de_recuperacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CodigosDeRecuperacionDto _$CodigosDeRecuperacionDtoFromJson(
  Map<String, dynamic> json,
) => CodigosDeRecuperacionDto(
  codigos: (json['codigos'] as List<dynamic>).map((e) => e as String).toList(),
  cantidad: json['cantidad'] as num,
);

Map<String, dynamic> _$CodigosDeRecuperacionDtoToJson(
  CodigosDeRecuperacionDto instance,
) => <String, dynamic>{
  'codigos': instance.codigos,
  'cantidad': instance.cantidad,
};
