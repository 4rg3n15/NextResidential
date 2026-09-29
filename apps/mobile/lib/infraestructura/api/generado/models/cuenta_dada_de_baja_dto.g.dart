// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cuenta_dada_de_baja_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CuentaDadaDeBajaDto _$CuentaDadaDeBajaDtoFromJson(Map<String, dynamic> json) =>
    CuentaDadaDeBajaDto(
      dadaDeBaja: json['dadaDeBaja'] as bool,
      plantillasSuprimidas: json['plantillasSuprimidas'] as num,
    );

Map<String, dynamic> _$CuentaDadaDeBajaDtoToJson(
  CuentaDadaDeBajaDto instance,
) => <String, dynamic>{
  'dadaDeBaja': instance.dadaDeBaja,
  'plantillasSuprimidas': instance.plantillasSuprimidas,
};
