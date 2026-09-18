// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'recuperacion_de_factor_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecuperacionDeFactorDto _$RecuperacionDeFactorDtoFromJson(
  Map<String, dynamic> json,
) => RecuperacionDeFactorDto(
  factoresRetirados: json['factoresRetirados'] as num,
  codigosRestantes: json['codigosRestantes'] as num,
);

Map<String, dynamic> _$RecuperacionDeFactorDtoToJson(
  RecuperacionDeFactorDto instance,
) => <String, dynamic>{
  'factoresRetirados': instance.factoresRetirados,
  'codigosRestantes': instance.codigosRestantes,
};
